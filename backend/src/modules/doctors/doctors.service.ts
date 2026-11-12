import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { DoctorDoc, OrderDoc, PatientDoc } from '../../common/entities';
import { notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { buildSearchTokens, diff, normalizeSearch, optionalText, paginationQuery, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';

export const DoctorDto = z.object({
  name: requiredText(100),
  specialization: optionalText(80),
  qualification: optionalText(80),
  phone: optionalText(20),
  email: z.email().max(120).optional(),
  clinic: optionalText(120),
  address: optionalText(300),
  commission: z
    .object({ type: z.enum(['none', 'percent', 'fixed']), value: z.number().min(0).max(100000) })
    .refine((c) => c.type !== 'percent' || c.value <= 100, { message: 'Percent cannot exceed 100' })
    .optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

/** Moves the doctors' version marker (1 write): server copies of the doctor list reload. */
export async function touchDoctors(store: DataStore): Promise<void> {
  await store.set(C.counters, 'doctorsVersion', { id: 'doctorsVersion', v: `${Date.now().toString(36)}-${store.newId().slice(0, 8)}` });
}

export const DoctorQuery = paginationQuery.extend({ q: z.string().max(60).optional(), status: z.enum(['active', 'inactive']).optional() });

@Injectable()
export class DoctorsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  /**
   * The plain doctor list (no search, first page) is loaded by Register & bill for every
   * patient: kept in this server's memory while the doctors' version marker is unchanged
   * (1 small read instead of up to 100). Doctors are reference data, not patient data.
   */
  private listCache = new Map<string, { version: string; value: Awaited<ReturnType<DoctorsService['queryList']>> }>();

  async list(q: z.infer<typeof DoctorQuery>) {
    if (q.q || q.cursor) return this.queryList(q);
    const v = (await this.store.get<{ id: string; v: string }>(C.counters, 'doctorsVersion'))?.v ?? 'none';
    const key = `${q.status ?? 'all'}|${q.limit}`;
    const hit = this.listCache.get(key);
    if (hit?.version === v) return hit.value;
    const value = await this.queryList(q);
    this.listCache.set(key, { version: v, value });
    return value;
  }

  private async queryList(q: z.infer<typeof DoctorQuery>) {
    const where: WhereClause[] = [];
    if (q.status) where.push({ field: 'status', op: '==', value: q.status });
    if (q.q && normalizeSearch(q.q).length >= 2) where.push({ field: 'searchTokens', op: 'array-contains', value: normalizeSearch(q.q) });
    const res = await this.store.query<DoctorDoc>(C.doctors, { where, orderBy: { field: 'name' }, limit: q.limit, cursor: q.cursor });
    return { ...res, items: res.items.map(({ searchTokens: _t, ...d }) => d) };
  }

  async get(id: string): Promise<DoctorDoc> {
    const d = await this.store.get<DoctorDoc>(C.doctors, id);
    if (!d) throw notFound('Doctor');
    return d;
  }

  async create(dto: z.infer<typeof DoctorDto>, actor: AuthUser): Promise<DoctorDoc> {
    const now = this.store.now();
    const doc: DoctorDoc = { ...dto, id: this.store.newId(), searchTokens: buildSearchTokens(dto.name, dto.clinic, dto.phone), createdAt: now, updatedAt: now };
    await this.store.create(C.doctors, doc.id, doc);
    await touchDoctors(this.store);
    await this.audit.record({ action: 'doctor.create', entity: 'doctor', entityId: doc.id, actor: toActor(actor) });
    return doc;
  }

  async update(id: string, dto: Partial<z.infer<typeof DoctorDto>>, actor: AuthUser): Promise<DoctorDoc> {
    const before = await this.get(id);
    const next: DoctorDoc = { ...before, ...dto, updatedAt: this.store.now() };
    next.searchTokens = buildSearchTokens(next.name, next.clinic, next.phone);
    await this.store.set(C.doctors, id, next);
    await touchDoctors(this.store);
    await this.audit.record({ action: 'doctor.update', entity: 'doctor', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    return next;
  }

  /** Referral history and doctor-wise statistics. */
  async stats(id: string) {
    const doctor = await this.get(id);
    const [orders, patients] = await Promise.all([
      this.store.query<OrderDoc>(C.orders, { where: [{ field: 'doctorId', op: '==', value: id }], orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 }),
      this.store.query<PatientDoc>(C.patients, { where: [{ field: 'referringDoctorId', op: '==', value: id }], orderBy: { field: 'createdAt', direction: 'desc' }, limit: 100 }),
    ]);
    const active = orders.items.filter((o) => o.status !== 'cancelled');
    const testCounts = new Map<string, { testName: string; count: number; revenue: number }>();
    for (const o of active)
      for (const item of o.items) {
        const e = testCounts.get(item.testId) ?? { testName: item.testName, count: 0, revenue: 0 };
        e.count++;
        e.revenue += item.unitPrice;
        testCounts.set(item.testId, e);
      }
    const revenue = active.reduce((s, o) => s + o.billing.total, 0);
    const commission =
      doctor.commission?.type === 'percent'
        ? (revenue * doctor.commission.value) / 100
        : doctor.commission?.type === 'fixed'
          ? active.length * doctor.commission.value
          : 0;
    return {
      doctor: { ...doctor, searchTokens: undefined },
      totals: { orders: active.length, patients: patients.items.length, revenue, estimatedCommission: Math.round(commission) },
      tests: [...testCounts.values()].sort((a, b) => b.count - a.count),
      recentOrders: active.slice(0, 20).map((o) => ({ id: o.id, orderNumber: o.orderNumber, patientName: o.patientName, total: o.billing.total, status: o.status, createdAt: o.createdAt })),
      referredPatients: patients.items.map((p) => ({ id: p.id, mrNumber: p.mrNumber, name: p.name, createdAt: p.createdAt })),
    };
  }
}
