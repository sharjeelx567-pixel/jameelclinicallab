import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { DoctorDoc, OrderDoc, PatientDoc, PaymentDoc, ReportDoc } from '../../common/entities';
import { conflict, notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import {
  ageInYears,
  buildSearchTokens,
  cnic,
  diff,
  docId,
  isoDate,
  normalizeSearch,
  nextSequence,
  optionalText,
  pad,
  paginationQuery,
  patchOf,
  pkMobile,
  requiredText,
  yearCode,
} from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { UploadedBinary, StorageService } from '../settings/storage.service';

const PatientFields = z.object({
  name: requiredText(100),
  guardianName: optionalText(100),
  guardianRelation: z.enum(['father', 'husband', 'other']).optional(),
  dateOfBirth: isoDate.optional(),
  ageYears: z.number().int().min(0).max(130).optional(),
  gender: z.enum(['male', 'female', 'other']),
  mobile: pkMobile,
  alternateMobile: pkMobile.optional(),
  cnic: cnic.optional(),
  email: z.email().max(120).optional(),
  address: z
    .object({
      province: optionalText(60),
      division: optionalText(60),
      district: optionalText(60),
      tehsil: optionalText(60),
      unionCouncil: optionalText(80),
      line: optionalText(300),
    })
    .default({}),
  referringDoctorId: docId.optional(),
  branchId: optionalText(40),
  collectionCenterId: optionalText(40),
  sampleCollectionLocation: optionalText(120),
  panelId: docId.optional(),
  category: optionalText(40),
  notes: optionalText(1000),
});

const requireAge = <T extends { dateOfBirth?: string; ageYears?: number }>(v: T) =>
  v.dateOfBirth !== undefined || v.ageYears !== undefined;

export const CreatePatientDto = PatientFields.extend({
  /** Set after staff reviewed suspected duplicates and confirmed this is a different person. */
  confirmNotDuplicate: z.boolean().default(false),
}).refine(requireAge, { message: 'Enter date of birth or age', path: ['ageYears'] });

export const UpdatePatientDto = patchOf(PatientFields);

export const PatientQuery = paginationQuery.extend({
  q: z.string().max(60).optional(),
  status: z.enum(['active', 'archived']).default('active'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  doctorId: docId.optional(),
  panelId: docId.optional(),
});

export interface DuplicateCandidate {
  id: string;
  mrNumber: string;
  name: string;
  mobile: string;
  reason: 'same_cnic' | 'same_mobile_and_name';
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async get(id: string): Promise<PatientDoc> {
    const p = await this.store.get<PatientDoc>(C.patients, id);
    if (!p) throw notFound('Patient');
    return p;
  }

  async findDuplicates(input: { name: string; mobile: string; cnic?: string }, excludeId?: string): Promise<DuplicateCandidate[]> {
    const found = new Map<string, DuplicateCandidate>();
    if (input.cnic) {
      const byCnic = await this.store.query<PatientDoc>(C.patients, { where: [{ field: 'cnic', op: '==', value: input.cnic }], limit: 10 });
      byCnic.items.forEach((p) => found.set(p.id, { id: p.id, mrNumber: p.mrNumber, name: p.name, mobile: p.mobile, reason: 'same_cnic' }));
    }
    const byMobile = await this.store.query<PatientDoc>(C.patients, { where: [{ field: 'mobile', op: '==', value: input.mobile }], limit: 20 });
    const nameWords = new Set(input.name.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
    for (const p of byMobile.items) {
      const overlap = p.name.toLowerCase().split(/\s+/).some((w) => nameWords.has(w));
      if (overlap && !found.has(p.id))
        found.set(p.id, { id: p.id, mrNumber: p.mrNumber, name: p.name, mobile: p.mobile, reason: 'same_mobile_and_name' });
    }
    found.delete(excludeId ?? '');
    return [...found.values()];
  }

  private tokens(p: Pick<PatientDoc, 'name' | 'mrNumber' | 'mobile' | 'cnic' | 'guardianName'>) {
    return buildSearchTokens(p.name, p.mrNumber, p.mobile, p.cnic, p.guardianName);
  }

  async create(dto: z.infer<typeof CreatePatientDto>, actor: AuthUser): Promise<PatientDoc> {
    const { confirmNotDuplicate, ...fields } = dto;
    if (!confirmNotDuplicate) {
      const candidates = await this.findDuplicates(fields);
      if (candidates.length)
        throw conflict('DUPLICATE_SUSPECTED', 'A patient with matching details already exists. Review before continuing.', candidates);
    }

    const id = this.store.newId();
    const patient = await this.store.transaction(async (tx) => {
      const seq = await nextSequence(tx, 'patientMr');
      const now = this.store.now();
      const mrNumber = `JCL-${yearCode(now)}${pad(seq, 6)}`;
      const doc: PatientDoc = {
        ...fields,
        id,
        mrNumber,
        ageYears: fields.dateOfBirth ? ageInYears(fields.dateOfBirth) : fields.ageYears,
        attachments: [],
        status: 'active',
        searchTokens: [],
        createdBy: toActor(actor),
        createdAt: now,
        updatedAt: now,
      };
      doc.searchTokens = this.tokens(doc);
      tx.create(C.patients, id, doc);
      this.audit.recordInTx(tx, {
        action: 'patient.create',
        entity: 'patient',
        entityId: id,
        actor: toActor(actor),
        note: confirmNotDuplicate ? 'Registered after duplicate review' : undefined,
      });
      return doc;
    });
    return patient;
  }

  async update(id: string, dto: z.infer<typeof UpdatePatientDto>, actor: AuthUser): Promise<PatientDoc> {
    return this.store.transaction(async (tx) => {
      const before = await tx.get<PatientDoc>(C.patients, id);
      if (!before) throw notFound('Patient');
      const merged: PatientDoc = { ...before, ...dto, address: { ...before.address, ...dto.address }, updatedAt: this.store.now() };
      if (dto.dateOfBirth) merged.ageYears = ageInYears(dto.dateOfBirth);
      merged.searchTokens = this.tokens(merged);
      tx.set(C.patients, id, merged);
      const changes = diff(before, merged);
      if (Object.keys(changes).length)
        this.audit.recordInTx(tx, { action: 'patient.update', entity: 'patient', entityId: id, actor: toActor(actor), changes });
      return merged;
    });
  }

  async setArchived(id: string, archived: boolean, reason: string, actor: AuthUser): Promise<PatientDoc> {
    const p = await this.get(id);
    const status = archived ? 'archived' : 'active';
    await this.store.update(C.patients, id, { status, updatedAt: this.store.now() });
    await this.audit.record({ action: archived ? 'patient.archive' : 'patient.restore', entity: 'patient', entityId: id, actor: toActor(actor), note: reason });
    return { ...p, status };
  }

  async list(q: z.infer<typeof PatientQuery>) {
    const where: WhereClause[] = [{ field: 'status', op: '==', value: q.status }];
    if (q.q && normalizeSearch(q.q).length >= 2) where.push({ field: 'searchTokens', op: 'array-contains', value: normalizeSearch(q.q) });
    if (q.gender) where.push({ field: 'gender', op: '==', value: q.gender });
    if (q.doctorId) where.push({ field: 'referringDoctorId', op: '==', value: q.doctorId });
    if (q.panelId) where.push({ field: 'panelId', op: '==', value: q.panelId });
    const res = await this.store.query<PatientDoc>(C.patients, { where, orderBy: { field: 'createdAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
    // searchTokens are an implementation detail; don't ship them to the browser.
    return { ...res, items: res.items.map(({ searchTokens: _t, ...p }) => p) };
  }

  async history(id: string) {
    const patient = await this.get(id);
    const byPatient = [{ field: 'patientId', op: '==' as const, value: id }];
    const [orders, payments, reports, timeline] = await Promise.all([
      this.store.query<OrderDoc>(C.orders, { where: byPatient, orderBy: { field: 'createdAt', direction: 'desc' }, limit: 100 }),
      this.store.query<PaymentDoc>(C.payments, { where: byPatient, orderBy: { field: 'recordedAt', direction: 'desc' }, limit: 100 }),
      this.store.query<ReportDoc>(C.reports, { where: byPatient, orderBy: { field: 'generatedAt', direction: 'desc' }, limit: 100 }),
      this.store.query(C.auditLogs, {
        where: [
          { field: 'entity', op: '==', value: 'patient' },
          { field: 'entityId', op: '==', value: id },
        ],
        orderBy: { field: 'at', direction: 'desc' },
        limit: 50,
      }),
    ]);
    const doctor = patient.referringDoctorId ? await this.store.get<DoctorDoc>(C.doctors, patient.referringDoctorId) : null;
    const activeOrders = orders.items.filter((o) => o.status !== 'cancelled');
    return {
      patient: { ...patient, searchTokens: undefined },
      referringDoctor: doctor ? { id: doctor.id, name: doctor.name } : null,
      orders: orders.items.map(({ searchTokens: _t, ...o }) => o),
      payments: payments.items,
      reports: reports.items.map(({ snapshot: _s, ...r }) => r),
      timeline: timeline.items,
      summary: {
        totalOrders: activeOrders.length,
        totalBilled: activeOrders.reduce((s, o) => s + o.billing.total, 0),
        totalPaid: activeOrders.reduce((s, o) => s + o.billing.paid - o.billing.refunded, 0),
        outstanding: activeOrders.reduce((s, o) => s + o.billing.balance, 0),
      },
    };
  }

  async addAttachment(id: string, file: UploadedBinary | undefined, actor: AuthUser) {
    const patient = await this.get(id);
    const path = await this.storage.upload(file, `patients/${id}`, ['image/png', 'image/jpeg', 'application/pdf']);
    const attachment = { path, name: (file?.originalname ?? 'file').slice(0, 120), contentType: file?.mimetype ?? '', uploadedAt: this.store.now() };
    await this.store.update(C.patients, id, { attachments: [...patient.attachments, attachment], updatedAt: this.store.now() });
    await this.audit.record({ action: 'patient.attachment_add', entity: 'patient', entityId: id, actor: toActor(actor) });
    return attachment;
  }
}
