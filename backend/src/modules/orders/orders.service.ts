import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  DoctorDoc,
  HomeSamplingDoc,
  OrderDoc,
  OrderItem,
  PanelDoc,
  PatientDoc,
  PaymentDoc,
  ReportDoc,
  ResultDoc,
  ResultStatus,
  SampleDoc,
  SampleStatus,
  TestDoc,
} from '../../common/entities';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { AuditActor, AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore, TransactionContext, WhereClause } from '../../database/data-store';
import {
  buildSearchTokens,
  docId,
  labDateKey,
  money,
  normalizeSearch,
  optionalText,
  pad,
  paginationQuery,
  requiredText,
  reserveSequences,
  round2,
  yearCode,
} from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { SettingsService } from '../settings/settings.service';
import { TestsService } from '../tests/tests.service';
import { deriveOrderStatus } from './order-status';

export interface StatusBase {
  samples: Map<string, SampleStatus>;
  results: Map<string, ResultStatus>;
}
export interface StatusChanges {
  samples?: Record<string, SampleStatus>;
  results?: Record<string, ResultStatus>;
}

export const PaymentInput = z.object({
  amount: money.refine((n) => n > 0, 'Amount must be greater than zero'),
  method: z.enum(['cash', 'card', 'bank_transfer', 'panel']),
  reference: optionalText(80),
});

export const CreateOrderDto = z.object({
  patientId: docId,
  testIds: z.array(docId).min(1, 'Select at least one test').max(60),
  doctorId: docId.optional(),
  /** Defaults to the patient's panel. Send null to bill privately. */
  panelId: docId.nullable().optional(),
  technicianId: z.string().max(128).optional(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  clinicalNotes: optionalText(1000),
  discount: z
    .object({ amount: money, reason: requiredText(200) })
    .optional(),
  advancePayment: PaymentInput.optional(),
  homeSamplingRequestId: docId.optional(),
});

export const OrderQuery = paginationQuery.extend({
  status: z.string().max(30).optional(),
  patientId: docId.optional(),
  doctorId: docId.optional(),
  q: z.string().max(60).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
});

export const UpdateOrderDto = z.object({
  priority: z.enum(['routine', 'urgent', 'stat']).optional(),
  clinicalNotes: optionalText(1000),
  technicianId: z.string().max(128).nullable().optional(),
  doctorId: docId.nullable().optional(),
});

export interface PriceLine {
  test: TestDoc;
  unitPrice: number;
}

/** Pure pricing — the client never supplies prices. */
export function priceOrder(tests: TestDoc[], panel: PanelDoc | null) {
  const lines: PriceLine[] = tests.map((test) => {
    const rate = panel?.rates[test.id];
    if (rate !== undefined) return { test, unitPrice: rate };
    const pct = panel?.discountPercent ?? 0;
    return { test, unitPrice: round2(test.discountEligible ? test.price * (1 - pct / 100) : test.price) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice, 0));
  const discountableSubtotal = round2(lines.filter((l) => l.test.discountEligible).reduce((s, l) => s + l.unitPrice, 0));
  return { lines, subtotal, discountableSubtotal };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly testsCatalog: TestsService,
  ) {}

  async get(id: string): Promise<OrderDoc> {
    const o = await this.store.get<OrderDoc>(C.orders, id);
    if (!o) throw notFound('Order');
    return o;
  }

  async quote(dto: Pick<z.infer<typeof CreateOrderDto>, 'patientId' | 'testIds' | 'panelId'>) {
    const patient = await this.store.get<PatientDoc>(C.patients, dto.patientId);
    if (!patient) throw notFound('Patient');
    const tests = await this.loadTests(dto.testIds);
    const panelId = dto.panelId === null ? undefined : (dto.panelId ?? patient.panelId);
    const panel = panelId ? await this.store.get<PanelDoc>(C.insurancePanels, panelId) : null;
    const settings = await this.settings.get();
    const { lines, subtotal, discountableSubtotal } = priceOrder(tests, panel?.active ? panel : null);
    return {
      lines: lines.map((l) => ({ testId: l.test.id, name: l.test.name, code: l.test.code, catalogPrice: l.test.price, unitPrice: l.unitPrice })),
      subtotal,
      maxDiscount: round2((discountableSubtotal * settings.billing.maxDiscountPercent) / 100),
      panel: panel ? { id: panel.id, name: panel.name } : null,
    };
  }

  private async loadTests(ids: string[]): Promise<TestDoc[]> {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw badRequest('DUPLICATE_TEST', 'A test was selected more than once');
    // From the catalogue copy (checked against its version marker: 1 read) instead of one read per test.
    const byId = new Map((await this.testsCatalog.allTests()).map((t) => [t.id, t]));
    const tests = unique.map((id) => byId.get(id) ?? null);
    const missing = unique.filter((_, i) => !tests[i] || !tests[i]!.active);
    if (missing.length) throw badRequest('TEST_UNAVAILABLE', 'One or more selected tests are not available', missing);
    return tests as TestDoc[];
  }

  async create(dto: z.infer<typeof CreateOrderDto>, actor: AuthUser): Promise<OrderDoc> {
    if (dto.discount && dto.discount.amount > 0 && !actor.permissions.includes('orders.discount'))
      throw forbidden('You are not authorised to apply discounts');
    if (dto.advancePayment && !actor.permissions.includes('billing.collect'))
      throw forbidden('You are not authorised to record payments');

    const settings = await this.settings.get();
    const tests = await this.loadTests(dto.testIds);
    const orderId = this.store.newId();

    const order = await this.store.transaction(async (tx) => {
      // ── all reads first ──
      const patient = await tx.get<PatientDoc>(C.patients, dto.patientId);
      if (!patient || patient.status !== 'active') throw badRequest('PATIENT_UNAVAILABLE', 'Patient not found or archived');
      const doctorId = dto.doctorId ?? patient.referringDoctorId;
      const doctor = doctorId ? await tx.get<DoctorDoc>(C.doctors, doctorId) : null;
      if (dto.doctorId && !doctor) throw badRequest('DOCTOR_NOT_FOUND', 'Referring doctor not found');
      const panelId = dto.panelId === null ? undefined : (dto.panelId ?? patient.panelId);
      const panel = panelId ? await tx.get<PanelDoc>(C.insurancePanels, panelId) : null;
      if (dto.panelId && (!panel || !panel.active)) throw badRequest('PANEL_UNAVAILABLE', 'Panel not found or inactive');
      const home = dto.homeSamplingRequestId ? await tx.get<HomeSamplingDoc>(C.homeSamplingRequests, dto.homeSamplingRequestId) : null;
      if (dto.homeSamplingRequestId && !home) throw badRequest('HOME_REQUEST_NOT_FOUND', 'Home sampling request not found');
      if (home?.orderId) throw conflict('HOME_REQUEST_LINKED', 'This home sampling request already has an order');

      const { lines, subtotal, discountableSubtotal } = priceOrder(tests, panel?.active ? panel : null);
      const collectionFee = home?.fee ?? 0;
      const discountAmount = round2(dto.discount?.amount ?? 0);
      const maxDiscount = round2((discountableSubtotal * settings.billing.maxDiscountPercent) / 100);
      if (discountAmount > maxDiscount)
        throw unprocessable('DISCOUNT_EXCEEDS_LIMIT', `Maximum discount allowed is ${maxDiscount} (${settings.billing.maxDiscountPercent}% of eligible tests)`);
      const total = round2(subtotal + collectionFee - discountAmount);
      const advance = dto.advancePayment?.amount ?? 0;
      if (advance > total) throw unprocessable('PAYMENT_EXCEEDS_TOTAL', `Advance payment cannot exceed the payable amount (${total})`);

      // Group tests into physical samples by sample + container type.
      const groups = new Map<string, TestDoc[]>();
      for (const t of tests) {
        const key = `${t.sampleType.toLowerCase()}|${(t.containerType ?? '').toLowerCase()}`;
        groups.set(key, [...(groups.get(key) ?? []), t]);
      }
      const seq = await reserveSequences(tx, { order: 1, sample: groups.size, receipt: advance > 0 ? 1 : 0 });

      // ── writes ──
      const now = this.store.now();
      const yy = yearCode(now);
      const orderNumber = `ORD-${yy}${pad(seq.order[0], 6)}`;
      const by = toActor(actor);

      const samples: SampleDoc[] = [...groups.values()].map((groupTests, i) => ({
        id: this.store.newId(),
        sampleNumber: `S${yy}${pad(seq.sample[i], 7)}`,
        orderId,
        orderNumber,
        patientId: patient.id,
        sampleType: groupTests[0].sampleType,
        containerType: groupTests[0].containerType,
        testIds: groupTests.map((t) => t.id),
        status: 'pending_collection',
        collectionLocation: home ? 'Home collection' : patient.sampleCollectionLocation,
        timeline: [{ status: 'pending_collection', at: now, by }],
        createdAt: now,
        updatedAt: now,
      }));
      const sampleFor = (testId: string) => samples.find((s) => s.testIds.includes(testId))!;

      const items: OrderItem[] = lines.map((l) => ({
        testId: l.test.id,
        testName: l.test.name,
        testCode: l.test.code,
        sampleType: l.test.sampleType,
        unitPrice: l.unitPrice,
        discountEligible: l.test.discountEligible,
        resultId: this.store.newId(),
        sampleId: sampleFor(l.test.id).id,
      }));

      const doc: OrderDoc = {
        id: orderId,
        orderNumber,
        patientId: patient.id,
        patientMrNumber: patient.mrNumber,
        patientName: patient.name,
        doctorId: doctor?.id,
        doctorName: doctor?.name,
        panelId: panel?.id,
        technicianId: dto.technicianId,
        priority: dto.priority,
        clinicalNotes: dto.clinicalNotes,
        items,
        billing: {
          subtotal,
          collectionFee,
          discountAmount,
          discountReason: dto.discount?.reason,
          discountApprovedBy: discountAmount > 0 ? by : undefined,
          total,
          paid: advance,
          refunded: 0,
          balance: round2(total - advance),
        },
        status: 'registered',
        statusHistory: [{ status: 'registered', at: now, by }],
        homeSamplingRequestId: home?.id,
        createdBy: by,
        searchTokens: buildSearchTokens(orderNumber, patient.name, patient.mrNumber),
        createdAt: now,
        updatedAt: now,
      };

      const results: ResultDoc[] = items.map((item) => ({
        id: item.resultId,
        orderId,
        orderNumber,
        patientId: patient.id,
        sampleId: item.sampleId,
        testId: item.testId,
        testName: item.testName,
        testCode: item.testCode,
        status: 'pending',
        version: 1,
        values: [],
        hasCritical: false,
        hasAnalyzerValues: false,
        createdAt: now,
        updatedAt: now,
      }));

      // Status summary on each item (see OrderItem.sampleStatus).
      const sampleStatusById = new Map(samples.map((x) => [x.id, x.status]));
      doc.items = doc.items.map((i) => ({ ...i, sampleStatus: sampleStatusById.get(i.sampleId), resultStatus: 'pending' as const }));
      const status = deriveOrderStatus(doc, samples, results);
      if (status !== doc.status) {
        doc.status = status;
        doc.statusHistory.push({ status, at: now, by });
      }

      tx.create(C.orders, orderId, doc);
      samples.forEach((s) => tx.create(C.samples, s.id, s));
      results.forEach((r) => tx.create(C.results, r.id, r));
      if (advance > 0 && dto.advancePayment) {
        const payment: PaymentDoc = {
          id: this.store.newId(),
          receiptNumber: `RC-${yy}${pad(seq.receipt[0], 6)}`,
          orderId,
          orderNumber,
          patientId: patient.id,
          type: 'payment',
          method: dto.advancePayment.method,
          amount: advance,
          reference: dto.advancePayment.reference,
          recordedBy: by,
          recordedAt: now,
          businessDate: labDateKey(getEnv().LAB_TIMEZONE, new Date(now)),
        };
        tx.create(C.payments, payment.id, payment);
        this.audit.recordInTx(tx, { action: 'payment.record', entity: 'order', entityId: orderId, actor: by, changes: { amount: advance, method: payment.method } });
      }
      if (home) {
        tx.update(C.homeSamplingRequests, home.id, { orderId, patientId: patient.id, updatedAt: now });
      }
      this.audit.recordInTx(tx, {
        action: 'order.create',
        entity: 'order',
        entityId: orderId,
        actor: by,
        changes: { tests: items.map((i) => i.testCode), total, discountAmount },
      });
      return doc;
    });
    return order;
  }

  async list(q: z.infer<typeof OrderQuery>) {
    const where: WhereClause[] = [];
    if (q.status) where.push({ field: 'status', op: '==', value: q.status });
    if (q.patientId) where.push({ field: 'patientId', op: '==', value: q.patientId });
    if (q.doctorId) where.push({ field: 'doctorId', op: '==', value: q.doctorId });
    if (q.from) where.push({ field: 'createdAt', op: '>=', value: q.from });
    if (q.to) where.push({ field: 'createdAt', op: '<=', value: q.to });
    if (q.q && normalizeSearch(q.q).length >= 2) where.push({ field: 'searchTokens', op: 'array-contains', value: normalizeSearch(q.q) });
    const res = await this.store.query<OrderDoc>(C.orders, { where, orderBy: { field: 'createdAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
    return { ...res, items: res.items.map(({ searchTokens: _t, ...o }) => o) };
  }

  async detail(id: string) {
    const order = await this.get(id);
    const byOrder = [{ field: 'orderId', op: '==' as const, value: id }];
    const [samples, results, payments, reports, patient] = await Promise.all([
      this.store.query<SampleDoc>(C.samples, { where: byOrder }),
      this.store.query<ResultDoc>(C.results, { where: byOrder }),
      this.store.query<PaymentDoc>(C.payments, { where: byOrder, orderBy: { field: 'recordedAt', direction: 'desc' } }),
      this.store.query<ReportDoc>(C.reports, { where: byOrder, orderBy: { field: 'version', direction: 'desc' } }),
      this.store.get<PatientDoc>(C.patients, order.patientId),
    ]);
    const { searchTokens: _t, ...o } = order;
    return {
      order: o,
      patient: patient && { id: patient.id, mrNumber: patient.mrNumber, name: patient.name, gender: patient.gender, ageYears: patient.ageYears, mobile: patient.mobile },
      samples: samples.items,
      results: results.items.map((r) => ({ id: r.id, testId: r.testId, testName: r.testName, testCode: r.testCode, status: r.status, version: r.version, hasCritical: r.hasCritical, sampleId: r.sampleId })),
      payments: payments.items,
      reports: reports.items.map(({ snapshot: _s, ...r }) => r),
    };
  }

  async update(id: string, dto: z.infer<typeof UpdateOrderDto>, actor: AuthUser) {
    return this.store.transaction(async (tx) => {
      const order = await tx.get<OrderDoc>(C.orders, id);
      if (!order) throw notFound('Order');
      if (order.status === 'cancelled' || order.status === 'completed') throw unprocessable('ORDER_CLOSED', 'This order can no longer be edited');
      let doctorName = order.doctorName;
      if (dto.doctorId) {
        const doctor = await tx.get<DoctorDoc>(C.doctors, dto.doctorId);
        if (!doctor) throw badRequest('DOCTOR_NOT_FOUND', 'Referring doctor not found');
        doctorName = doctor.name;
      }
      const patch = {
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.clinicalNotes !== undefined && { clinicalNotes: dto.clinicalNotes }),
        ...(dto.technicianId !== undefined && { technicianId: dto.technicianId ?? undefined }),
        ...(dto.doctorId !== undefined && { doctorId: dto.doctorId ?? undefined, doctorName: dto.doctorId ? doctorName : undefined }),
        updatedAt: this.store.now(),
      };
      tx.update(C.orders, id, patch);
      this.audit.recordInTx(tx, { action: 'order.update', entity: 'order', entityId: id, actor: toActor(actor), changes: dto });
      return { ...order, ...patch };
    });
  }

  async cancel(id: string, reason: string, actor: AuthUser) {
    return this.store.transaction(async (tx) => {
      const order = await tx.get<OrderDoc>(C.orders, id);
      if (!order) throw notFound('Order');
      if (order.status === 'cancelled') throw conflict('ALREADY_CANCELLED', 'Order is already cancelled');
      const results = await tx.query<ResultDoc>(C.results, { where: [{ field: 'orderId', op: '==', value: id }] });
      if (results.some((r) => r.status === 'approved'))
        throw unprocessable('HAS_APPROVED_RESULTS', 'Orders with approved results cannot be cancelled. Amend the results instead.');
      const now = this.store.now();
      const by = toActor(actor);
      const netPaid = round2(order.billing.paid - order.billing.refunded);
      tx.update(C.orders, id, {
        status: 'cancelled',
        statusHistory: [...order.statusHistory, { status: 'cancelled', at: now, by, note: reason }],
        cancellation: { reason, at: now, by },
        // Nothing further is owed. Any money already received must be refunded explicitly via billing.
        billing: { ...order.billing, balance: 0 },
        updatedAt: now,
      });
      this.audit.recordInTx(tx, { action: 'order.cancel', entity: 'order', entityId: id, actor: by, note: reason, changes: { refundDue: netPaid } });
      return { ...order, status: 'cancelled' as const, refundDue: netPaid };
    });
  }

  /**
   * Re-derive and persist order status after sample/result changes. Runs in its
   * own transaction (call after the triggering write has committed).
   */
  /**
   * Current sample/result statuses of an order, for a transaction that has read the order.
   * From the order's own status summary (no reads); for older orders without it, the samples
   * and results are read once (statusPatch then writes the summary). Call BEFORE the
   * transaction's writes (a Firestore rule).
   */
  async statusBase(tx: TransactionContext, order: OrderDoc): Promise<StatusBase> {
    if (order.items.every((i) => i.sampleStatus && i.resultStatus))
      return { samples: new Map(order.items.map((i) => [i.sampleId, i.sampleStatus!])), results: new Map(order.items.map((i) => [i.resultId, i.resultStatus!])) };
    const byOrder = [{ field: 'orderId', op: '==' as const, value: order.id }];
    const [samples, results] = await Promise.all([tx.query<SampleDoc>(C.samples, { where: byOrder }), tx.query<ResultDoc>(C.results, { where: byOrder })]);
    return { samples: new Map(samples.map((x) => [x.id, x.status])), results: new Map(results.map((r) => [r.id, r.status])) };
  }

  /**
   * The order update for this transaction's sample/result status changes: the per-item status
   * summary and, if it changes, the order status. null when nothing changes.
   */
  statusPatch(order: OrderDoc, base: StatusBase, changes: StatusChanges, by: AuditActor, now: string): Partial<OrderDoc> | null {
    const sampleStatus = (id: string) => changes.samples?.[id] ?? base.samples.get(id);
    const resultStatus = (id: string) => changes.results?.[id] ?? base.results.get(id);
    const items = order.items.map((i) => ({ ...i, sampleStatus: sampleStatus(i.sampleId) ?? i.sampleStatus, resultStatus: resultStatus(i.resultId) ?? i.resultStatus }));
    const samples = [...new Set(items.map((i) => i.sampleId))].map((id) => ({ status: sampleStatus(id) })).filter((x): x is { status: SampleStatus } => !!x.status);
    const results = items.map((i) => ({ status: i.resultStatus })).filter((x): x is { status: ResultStatus } => !!x.status);
    const status = deriveOrderStatus(order, samples, results);
    const itemsChanged = items.some((i, k) => i.sampleStatus !== order.items[k].sampleStatus || i.resultStatus !== order.items[k].resultStatus);
    if (status === order.status && !itemsChanged) return null;
    return {
      ...(itemsChanged ? { items } : {}),
      ...(status !== order.status ? { status, statusHistory: [...order.statusHistory, { status, at: now, by }] } : {}),
      updatedAt: now,
    };
  }

  /**
   * Rebuilds the order status AND its status summary from the real sample and result
   * documents (used after a sample rejection, which also moves tests to a new sample).
   */
  async syncStatus(orderId: string, by: AuditActor): Promise<void> {
    await this.store.transaction(async (t: TransactionContext) => {
      const order = await t.get<OrderDoc>(C.orders, orderId);
      if (!order) return;
      const byOrder = [{ field: 'orderId', op: '==' as const, value: orderId }];
      const samples = await t.query<SampleDoc>(C.samples, { where: byOrder });
      const results = await t.query<ResultDoc>(C.results, { where: byOrder });
      const base: StatusBase = { samples: new Map(samples.map((x) => [x.id, x.status])), results: new Map(results.map((r) => [r.id, r.status])) };
      const patch = this.statusPatch(order, base, {}, by, this.store.now());
      if (patch) t.update(C.orders, orderId, patch);
    });
  }
}
