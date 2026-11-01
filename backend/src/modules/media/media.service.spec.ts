import type { DoctorDoc, LabSettingsDoc, MediaAssetDoc, UserDoc } from '../../common/entities';
import { ALL_PERMISSIONS, type Permission } from '../../common/permissions';
import type { AuthUser } from '../../common/types';
import { setEnvForTesting } from '../../config/env';
import { C } from '../../database/data-store';
import { MemoryDataStore } from '../../database/memory-data-store';
import { AuditService } from '../audit-logs/audit.service';
import { SettingsService } from '../settings/settings.service';
import { MediaProvider, ProviderUpload, transformUrl } from './media-provider';
import { MediaService } from './media.service';

/** Test double for Cloudinary. It records calls; it is never used at runtime. */
class RecordingProvider extends MediaProvider {
  readonly configured = true;
  readonly cloudName = 'test-cloud';
  uploads: string[] = [];
  destroyed: string[] = [];
  private n = 0;
  async upload(_buf: Buffer, folder: string): Promise<ProviderUpload> {
    const publicId = `${folder}/img${++this.n}`;
    this.uploads.push(publicId);
    return { publicId, secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/v1/${publicId}.png`, version: 1, format: 'png', width: 10, height: 10, bytes: 100 };
  }
  async destroy(publicId: string) {
    this.destroyed.push(publicId);
  }
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const png = (name = 'a.png') => ({ originalname: name, mimetype: 'image/png', size: PNG.length, buffer: PNG });
const user = (uid: string, permissions: Permission[]): AuthUser => ({ uid, email: `${uid}@x`, displayName: uid, role: 'receptionist', permissions });
const admin = user('admin', [...ALL_PERMISSIONS]);

describe('MediaService', () => {
  let store: MemoryDataStore;
  let provider: RecordingProvider;
  let media: MediaService;

  beforeEach(async () => {
    setEnvForTesting({ CLOUDINARY_FOLDER_PREFIX: '' });
    store = new MemoryDataStore();
    provider = new RecordingProvider();
    const audit = new AuditService(store);
    media = new MediaService(store, provider, new SettingsService(store, audit), audit);
    const now = store.now();
    await store.create(C.doctors, 'd1', { id: 'd1', name: 'Dr A', status: 'active', searchTokens: [], createdAt: now, updatedAt: now } satisfies DoctorDoc);
    await store.create(C.users, 'u1', { id: 'u1', email: 'u1@x', displayName: 'U1', role: 'receptionist', status: 'active', createdAt: now, updatedAt: now } satisfies UserDoc);
  });

  it('uploads into the required folders', async () => {
    await media.upload('lab_gallery', png(), {}, admin);
    await media.upload('website_illustration', png(), {}, admin);
    await media.upload('doctor_profile', png(), { ownerId: 'd1' }, admin);
    await media.upload('staff_profile', png(), { ownerId: 'u1' }, admin);
    await media.upload('lab_logo', png(), {}, admin);
    expect(provider.uploads.map((p) => p.replace(/\/img\d+$/, ''))).toEqual(['laboratory/gallery', 'website/illustrations', 'doctors/profiles', 'staff/profiles', 'laboratory/logo']);
  });

  it('stores public_id and secure_url and links the logo to settings', async () => {
    const a = await media.upload('lab_logo', png(), {}, admin);
    const saved = await store.get<MediaAssetDoc>(C.mediaAssets, a.id);
    expect(saved).toMatchObject({ publicId: 'laboratory/logo/img1', secureUrl: expect.stringContaining('res.cloudinary.com'), provider: 'cloudinary' });
    const s = await store.get<LabSettingsDoc>(C.laboratorySettings, 'main');
    expect(s?.logo).toMatchObject({ assetId: a.id, publicId: a.publicId });
  });

  it('a new logo replaces and deletes the previous one', async () => {
    const first = await media.upload('lab_logo', png(), {}, admin);
    const second = await media.upload('lab_logo', png(), {}, admin);
    expect(provider.destroyed).toEqual([first.publicId]);
    expect(await store.get(C.mediaAssets, first.id)).toBeNull();
    expect((await store.get<LabSettingsDoc>(C.laboratorySettings, 'main'))?.logo?.assetId).toBe(second.id);
  });

  it('replace swaps the file and deletes the old one from Cloudinary', async () => {
    const a = await media.upload('doctor_profile', png(), { ownerId: 'd1' }, admin);
    const b = await media.replace(a.id, png('b.png'), admin);
    expect(b.id).toBe(a.id);
    expect(b.publicId).not.toBe(a.publicId);
    expect(provider.destroyed).toEqual([a.publicId]);
    expect((await store.get<DoctorDoc>(C.doctors, 'd1'))?.photo?.publicId).toBe(b.publicId);
  });

  it('delete removes the file, the record and the owner link', async () => {
    const a = await media.upload('staff_profile', png(), { ownerId: 'u1' }, admin);
    await media.remove(a.id, admin);
    expect(provider.destroyed).toEqual([a.publicId]);
    expect(await store.get(C.mediaAssets, a.id)).toBeNull();
    expect((await store.get<UserDoc>(C.users, 'u1'))?.photo).toBeUndefined();
  });

  it('enforces per-category permissions; staff may change only their own photo', async () => {
    const reception = user('u1', ['doctors.write']);
    await expect(media.upload('lab_logo', png(), {}, reception)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(media.upload('doctor_profile', png(), { ownerId: 'd1' }, reception)).resolves.toBeDefined();
    await expect(media.upload('staff_profile', png(), { ownerId: 'u1' }, reception)).resolves.toBeDefined();
    await expect(media.upload('staff_profile', png(), { ownerId: 'someone-else' }, reception)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(provider.uploads).toHaveLength(2);
  });

  it('validates type by content and size, before anything is uploaded', async () => {
    await expect(media.upload('lab_gallery', undefined, {}, admin)).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    const pdf = Buffer.from('%PDF-1.4 fake');
    await expect(media.upload('lab_gallery', { originalname: 'x.png', mimetype: 'image/png', size: pdf.length, buffer: pdf }, {}, admin)).rejects.toMatchObject({ code: 'FILE_TYPE' });
    await expect(media.upload('lab_gallery', { ...png(), mimetype: 'image/jpeg' }, {}, admin)).rejects.toMatchObject({ code: 'FILE_TYPE' });
    await expect(media.upload('lab_logo', { ...png(), size: 3 * 1024 * 1024 }, {}, admin)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(media.upload('doctor_profile', png(), {}, admin)).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(media.upload('doctor_profile', png(), { ownerId: 'missing' }, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(provider.uploads).toHaveLength(0);
  });

  it('removes the Cloudinary file if saving the record fails', async () => {
    jest.spyOn(store, 'create').mockRejectedValueOnce(new Error('db down'));
    await expect(media.upload('lab_gallery', png(), {}, admin)).rejects.toThrow('db down');
    expect(provider.destroyed).toEqual(provider.uploads);
  });

  it('applies the folder prefix', async () => {
    setEnvForTesting({ CLOUDINARY_FOLDER_PREFIX: 'jcl-dev/' });
    await media.upload('lab_gallery', png(), {}, admin);
    expect(provider.uploads[0]).toMatch(/^jcl-dev\/laboratory\/gallery\//);
  });
});

describe('transformUrl', () => {
  it('inserts a delivery transformation', () => {
    expect(transformUrl('https://res.cloudinary.com/c/image/upload/v12/a/b.png', 'f_auto,q_auto')).toBe('https://res.cloudinary.com/c/image/upload/f_auto,q_auto/v12/a/b.png');
  });
});
