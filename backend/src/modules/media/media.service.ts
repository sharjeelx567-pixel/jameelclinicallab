import { Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import type { DoctorDoc, LabSettingsDoc, MediaAssetDoc, MediaCategory, MediaRef, UserDoc } from '../../common/entities';
import { badRequest, forbidden, notFound } from '../../common/errors';
import type { Permission } from '../../common/permissions';
import { AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { optionalText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { AccessService } from '../auth/access.service';
import { touchDoctors } from '../doctors/doctors.service';
import { SettingsService } from '../settings/settings.service';
import { sniff, UploadedBinary } from '../settings/storage.service';
import { MediaProvider, ProviderUpload } from './media-provider';

const MB = 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface CategoryRule {
  label: string;
  folder: string;
  maxBytes: number;
  /** 'global' = one asset for the lab, 'owner' = one per doctor/staff member, false = many. */
  single: 'global' | 'owner' | false;
  owner?: 'doctor' | 'user';
  permission: Permission;
}

/**
 * The ONLY categories that may be sent to Cloudinary. All are non-sensitive
 * and publicly deliverable. There is intentionally no category for patient
 * documents, attachments or reports — those stay in private storage.
 */
export const MEDIA_CATEGORIES: Record<MediaCategory, CategoryRule> = {
  lab_logo: { label: 'Laboratory logo', folder: 'laboratory/logo', maxBytes: 2 * MB, single: 'global', permission: 'settings.write' },
  lab_gallery: { label: 'Laboratory gallery', folder: 'laboratory/gallery', maxBytes: 4 * MB, single: false, permission: 'settings.write' },
  staff_profile: { label: 'Staff profile photo', folder: 'staff/profiles', maxBytes: 2 * MB, single: 'owner', owner: 'user', permission: 'users.manage' },
  doctor_profile: { label: 'Doctor profile photo', folder: 'doctors/profiles', maxBytes: 2 * MB, single: 'owner', owner: 'doctor', permission: 'doctors.write' },
  website_illustration: { label: 'Website illustration', folder: 'website/illustrations', maxBytes: 4 * MB, single: false, permission: 'settings.write' },
};
export const MEDIA_CATEGORY_IDS = Object.keys(MEDIA_CATEGORIES) as [MediaCategory, ...MediaCategory[]];
export const MAX_MEDIA_BYTES = Math.max(...Object.values(MEDIA_CATEGORIES).map((c) => c.maxBytes));

export const MediaCategoryParam = z.enum(MEDIA_CATEGORY_IDS);
export const MediaUploadFields = z.object({
  ownerId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  alt: optionalText(160),
});
export const MediaListQuery = z.object({
  category: MediaCategoryParam,
  ownerId: z.string().max(128).optional(),
});

const toRef = (a: MediaAssetDoc): MediaRef => ({ assetId: a.id, publicId: a.publicId, secureUrl: a.secureUrl, width: a.width, height: a.height });

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(
    private readonly store: DataStore,
    private readonly provider: MediaProvider,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Optional() private readonly access?: AccessService,
  ) {}

  config() {
    return {
      configured: this.provider.configured,
      provider: 'cloudinary' as const,
      cloudName: this.provider.cloudName ?? null,
      categories: MEDIA_CATEGORY_IDS.map((id) => ({ id, label: MEDIA_CATEGORIES[id].label, folder: this.folder(id), maxBytes: MEDIA_CATEGORIES[id].maxBytes, accept: IMAGE_TYPES })),
    };
  }

  async list(q: z.infer<typeof MediaListQuery>): Promise<MediaAssetDoc[]> {
    const where: WhereClause[] = [{ field: 'category', op: '==', value: q.category }];
    if (q.ownerId) where.push({ field: 'ownerId', op: '==', value: q.ownerId });
    const res = await this.store.query<MediaAssetDoc>(C.mediaAssets, { where, orderBy: { field: 'createdAt', direction: 'desc' }, limit: 200 });
    return res.items;
  }

  async upload(category: MediaCategory, file: UploadedBinary | undefined, fields: z.infer<typeof MediaUploadFields>, actor: AuthUser): Promise<MediaAssetDoc> {
    const rule = MEDIA_CATEGORIES[category];
    this.authorize(rule, fields.ownerId, actor);
    if (rule.owner && !fields.ownerId) throw badRequest('OWNER_REQUIRED', `${rule.label} needs an ownerId`);
    if (!rule.owner && fields.ownerId) throw badRequest('OWNER_NOT_ALLOWED', `${rule.label} does not belong to a person`);
    if (rule.owner) await this.requireOwner(rule.owner, fields.ownerId!);
    this.validate(file, rule);

    const uploaded = await this.provider.upload(file!.buffer, this.folder(category));
    const now = this.store.now();
    const asset: MediaAssetDoc = {
      id: this.store.newId(),
      category,
      ...(fields.ownerId ? { ownerId: fields.ownerId } : {}),
      provider: 'cloudinary',
      ...this.fromUpload(uploaded),
      originalName: file!.originalname.slice(0, 120),
      ...(fields.alt ? { alt: fields.alt } : {}),
      uploadedBy: toActor(actor),
      createdAt: now,
      updatedAt: now,
    };
    let previous: MediaAssetDoc[] = [];
    try {
      if (rule.single) previous = await this.list({ category, ownerId: fields.ownerId });
      await this.store.create(C.mediaAssets, asset.id, asset);
      if (rule.single) await this.link(category, fields.ownerId, toRef(asset));
    } catch (err) {
      // Never leave an orphaned file in Cloudinary when our record failed.
      await this.provider.destroy(uploaded.publicId).catch((e) => this.logger.error(`cleanup of ${uploaded.publicId} failed: ${(e as Error).message}`));
      throw err;
    }
    // A single-slot category (logo, profile photo) replaces what was there.
    for (const old of previous) await this.removeQuietly(old);
    await this.audit.record({ action: 'media.upload', entity: 'media', entityId: asset.id, actor: toActor(actor), changes: { category, ownerId: fields.ownerId, publicId: asset.publicId, replaced: previous.map((p) => p.publicId) } });
    return asset;
  }

  async replace(id: string, file: UploadedBinary | undefined, actor: AuthUser): Promise<MediaAssetDoc> {
    const before = await this.get(id);
    const rule = MEDIA_CATEGORIES[before.category];
    this.authorize(rule, before.ownerId, actor);
    this.validate(file, rule);

    const uploaded = await this.provider.upload(file!.buffer, this.folder(before.category));
    const next: MediaAssetDoc = { ...before, ...this.fromUpload(uploaded), originalName: file!.originalname.slice(0, 120), uploadedBy: toActor(actor), updatedAt: this.store.now() };
    try {
      await this.store.set(C.mediaAssets, id, next);
      if (rule.single) await this.link(before.category, before.ownerId, toRef(next));
    } catch (err) {
      await this.provider.destroy(uploaded.publicId).catch((e) => this.logger.error(`cleanup of ${uploaded.publicId} failed: ${(e as Error).message}`));
      throw err;
    }
    await this.provider.destroy(before.publicId).catch((e) => this.logger.warn(`old image ${before.publicId} not deleted: ${(e as Error).message}`));
    await this.audit.record({ action: 'media.replace', entity: 'media', entityId: id, actor: toActor(actor), changes: { publicId: { from: before.publicId, to: next.publicId } } });
    return next;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const asset = await this.get(id);
    this.authorize(MEDIA_CATEGORIES[asset.category], asset.ownerId, actor);
    // Delete from Cloudinary first: if that fails we keep the record, so nothing is lost track of.
    await this.provider.destroy(asset.publicId);
    await this.store.delete(C.mediaAssets, id);
    await this.unlink(asset);
    await this.audit.record({ action: 'media.delete', entity: 'media', entityId: id, actor: toActor(actor), changes: { category: asset.category, ownerId: asset.ownerId, publicId: asset.publicId } });
  }

  private async get(id: string): Promise<MediaAssetDoc> {
    const a = await this.store.get<MediaAssetDoc>(C.mediaAssets, id);
    if (!a) throw notFound('Image');
    return a;
  }

  private folder(category: MediaCategory): string {
    const prefix = getEnv().CLOUDINARY_FOLDER_PREFIX.replace(/^\/+|\/+$/g, '');
    return prefix ? `${prefix}/${MEDIA_CATEGORIES[category].folder}` : MEDIA_CATEGORIES[category].folder;
  }

  private authorize(rule: CategoryRule, ownerId: string | undefined, actor: AuthUser) {
    if (actor.permissions.includes(rule.permission)) return;
    // Staff may manage their own profile photo.
    if (rule.owner === 'user' && ownerId && ownerId === actor.uid) return;
    throw forbidden();
  }

  /** Type is decided by the file's bytes, not its name or the browser's claim. */
  private validate(file: UploadedBinary | undefined, rule: CategoryRule) {
    if (!file || !file.size) throw badRequest('FILE_REQUIRED', 'Please choose an image to upload');
    if (file.size > rule.maxBytes) throw badRequest('FILE_TOO_LARGE', `${rule.label} must be ${rule.maxBytes / MB} MB or smaller`);
    const detected = sniff(file.buffer);
    if (!detected || !IMAGE_TYPES.includes(detected) || detected !== file.mimetype)
      throw badRequest('FILE_TYPE', 'Only PNG, JPEG or WebP images are allowed');
  }

  private async requireOwner(kind: 'doctor' | 'user', id: string) {
    const doc = await this.store.get(kind === 'doctor' ? C.doctors : C.users, id);
    if (!doc) throw notFound(kind === 'doctor' ? 'Doctor' : 'Staff account');
  }

  private fromUpload(u: ProviderUpload) {
    return { publicId: u.publicId, secureUrl: u.secureUrl, version: u.version, format: u.format, width: u.width, height: u.height, bytes: u.bytes };
  }

  /** Points the owning document at the asset (logo → settings, photo → doctor/user). */
  private async link(category: MediaCategory, ownerId: string | undefined, ref: MediaRef) {
    const now = this.store.now();
    if (category === 'lab_logo') {
      const current = await this.settings.get();
      await this.store.set(C.laboratorySettings, 'main', { ...current, logo: ref, updatedAt: now });
      this.settings.invalidate();
    } else if (category === 'doctor_profile' && ownerId) {
      await this.store.update(C.doctors, ownerId, { photo: ref, updatedAt: now });
      await touchDoctors(this.store);
    }
    else if (category === 'staff_profile' && ownerId) {
      await this.store.update(C.users, ownerId, { photo: ref, updatedAt: now });
      this.access?.invalidateUser(ownerId);
    }
  }

  private async unlink(asset: MediaAssetDoc) {
    const now = this.store.now();
    if (asset.category === 'lab_logo') {
      const { logo, ...rest } = await this.settings.get();
      if (logo?.assetId === asset.id) await this.store.set(C.laboratorySettings, 'main', { ...rest, updatedAt: now } satisfies Omit<LabSettingsDoc, 'logo'>);
      this.settings.invalidate();
    } else if (asset.ownerId && (asset.category === 'doctor_profile' || asset.category === 'staff_profile')) {
      const coll = asset.category === 'doctor_profile' ? C.doctors : C.users;
      const owner = await this.store.get<DoctorDoc | UserDoc>(coll, asset.ownerId);
      if (owner?.photo?.assetId === asset.id) {
        const { photo: _p, ...rest } = owner;
        await this.store.set(coll, asset.ownerId, { ...rest, updatedAt: now });
        if (coll === C.users) this.access?.invalidateUser(asset.ownerId);
        else await touchDoctors(this.store);
      }
    }
  }

  private async removeQuietly(asset: MediaAssetDoc) {
    try {
      await this.provider.destroy(asset.publicId);
      await this.store.delete(C.mediaAssets, asset.id);
    } catch (err) {
      this.logger.warn(`previous image ${asset.publicId} not removed: ${(err as Error).message}`);
    }
  }
}
