import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  OrderDoc,
  PatientDoc,
  ReportDoc,
  ResultDoc,
  ResultValue,
  ResultVersionDoc,
  SampleDoc,
  TestDoc,
} from '../../common/entities';
import { forbidden, notFound, unprocessable } from '../../common/errors';
import { AuditActor, AuthUser, toActor } from '../../common/types';
import { C, DataStore, TransactionContext, WhereClause } from '../../database/data-store';
import { optionalText, paginationQuery, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { flagValue, isCritical, selectRange } from '../tests/reference-range';

export const EnterValuesDto = z.object({
  values: z.array(z.object({ parameterId: z.string().max(40), value: z.string().trim().max(200) })).max(80),
  technicianComment: optionalText(1000),
  submit: z.boolean().default(false),
});

export const DecisionDto = z.object({ comment: optionalText(1000) });
export const RejectDto = z.object({ reason: requiredText(500), kind: z.enum(['rejected', 'correction_requested']).default('correction_requested') });
export const AmendDto = z.object({ reason: requiredText(500) });

export const ResultQuery = paginationQuery.extend({
  status: z.string().max(30).optional(),
  orderId: z.string().max(64).optional(),
  patientId: z.string().max(64).optional(),
});

const ENTERABLE = new Set(['pending', 'draft', 'correction_requested', 'rejected']);
const SAMPLE_READY = new Set(['accepted', 'processing', 'completed']);

export interface AnalyzerValueInput {
  parameterId: string;
  value: string;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  async list(q: z.infer<typeof ResultQuery>) {
    const where: WhereClause[] = [];
    if (q.status) where.push({ field: 'status', op: '==', value: q.status });
    if (q.orderId) where.push({ field: 'orderId', op: '==', value: q.orderId });
    if (q.patientId) where.push({ field: 'patientId', op: '==', value: q.patientId });
    const res = await this.store.query<ResultDoc>(C.results, { where, orderBy: { field: 'updatedAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
    // Enrich with minimal order context for queues.
    const orderIds = [...new Set(res.items.map((r) => r.orderId))];
    const orders = new Map((await Promise.all(orderIds.map((id) => this.store.get<OrderDoc>(C.orders, id)))).filter(Boolean).map((o) => [o!.id, o!]));
    return {
      ...res,
      items: res.items.map((r) => {
        const o = orders.get(r.orderId);
        return { ...r, patientName: o?.patientName, patientMrNumber: o?.patientMrNumber, priority: o?.priority };
      }),
    };
  }

  async get(id: string): Promise<ResultDoc> {
    const r = await this.store.get<ResultDoc>(C.results, id);
    if (!r) throw notFound('Result');
    return r;
  }

  /** Everything the entry and verification screens need, in one call. */
  async workspace(id: string) {
    const result = await this.get(id);
    const [test, order, patient, sample, versions, previous] = await Promise.all([
      this.store.get<TestDoc>(C.tests, result.testId),
      this.store.get<OrderDoc>(C.orders, result.orderId),
      this.store.get<PatientDoc>(C.patients, result.patientId),
      this.store.get<SampleDoc>(C.samples, result.sampleId),
      this.store.query<ResultVersionDoc>(C.resultVersions, { where: [{ field: 'resultId', op: '==', value: id }], orderBy: { field: 'version', direction: 'desc' } }),
      this.store.query<ResultDoc>(C.results, {
        where: [
          { field: 'patientId', op: '==', value: result.patientId },
          { field: 'testId', op: '==', value: result.testId },
          { field: 'status', op: '==', value: 'approved' },
        ],
        orderBy: { field: 'approvedAt', direction: 'desc' },
        limit: 6,
      }),
    ]);
    if (!test || !order || !patient) throw notFound('Result context');
    const parameters = [...test.parameters]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        const range = selectRange(p, patient.gender, patient.ageYears);
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          inputType: p.inputType,
          options: p.options,
          decimals: p.decimals,
          defaultValue: p.defaultValue,
          optional: p.optional ?? false,
          section: p.section,
          approvedRange: range ? { low: range.low, high: range.high, text: range.text, criticalLow: range.criticalLow, criticalHigh: range.criticalHigh } : null,
          hasDraftRanges: p.ranges.some((r) => r.status === 'draft'),
        };
      });
    return {
      result,
      test: { id: test.id, name: test.name, code: test.code, sampleType: test.sampleType, processingInstructions: test.processingInstructions },
      parameters,
      order: { id: order.id, orderNumber: order.orderNumber, priority: order.priority, clinicalNotes: order.clinicalNotes, doctorName: order.doctorName, createdAt: order.createdAt },
      patient: { id: patient.id, mrNumber: patient.mrNumber, name: patient.name, gender: patient.gender, ageYears: patient.ageYears },
      sample: sample && { id: sample.id, sampleNumber: sample.sampleNumber, status: sample.status, sampleType: sample.sampleType, collectedAt: sample.collectedAt, condition: sample.condition },
      versions: versions.items.map((v) => ({ version: v.version, approvedBy: v.approvedBy, approvedAt: v.approvedAt, supersededAt: v.supersededAt, amendmentReason: v.amendmentReason, values: v.snapshot.values })),
      previousResults: previous.items
        .filter((p) => p.id !== id)
        .slice(0, 5)
        .map((p) => ({ id: p.id, orderNumber: p.orderNumber, approvedAt: p.approvedAt, values: p.values.map((v) => ({ parameterId: v.parameterId, value: v.value, unit: v.unit, flag: v.flag })) })),
    };
  }

  /** Builds validated, server-flagged values. Ranges come only from the approved catalogue. */
  private computeValues(
    test: TestDoc,
    patient: PatientDoc,
    input: Array<{ parameterId: string; value: string }>,
    existing: ResultValue[],
    source: 'manual' | 'analyzer',
    analyzerMessageId?: string,
  ): ResultValue[] {
    const errors: Array<{ path: string; message: string }> = [];
    const byId = new Map(input.filter((v) => v.value !== '').map((v) => [v.parameterId, v.value]));
    for (const id of byId.keys())
      if (!test.parameters.some((p) => p.id === id)) errors.push({ path: id, message: 'Unknown parameter for this test' });

    const values: ResultValue[] = [];
    for (const p of test.parameters) {
      const raw = byId.get(p.id);
      if (raw === undefined) {
        const keep = existing.find((e) => e.parameterId === p.id);
        if (keep && source === 'analyzer') values.push(keep);
        continue;
      }
      if (p.inputType === 'numeric' && !/^[-+]?\d+(\.\d+)?$/.test(raw)) {
        errors.push({ path: p.id, message: `${p.name}: enter a number` });
        continue;
      }
      if (p.inputType === 'select' && !(p.options ?? []).includes(raw)) {
        errors.push({ path: p.id, message: `${p.name}: choose one of the listed options` });
        continue;
      }
      const value = p.inputType === 'numeric' && p.decimals !== undefined ? Number(raw).toFixed(p.decimals) : raw;
      const range = selectRange(p, patient.gender, patient.ageYears);
      const { flag, numericValue } = flagValue(p, value, range);
      const prev = existing.find((e) => e.parameterId === p.id);
      // A manually edited analyzer value becomes a manual value; an untouched one keeps its provenance.
      const unchangedAnalyzer = source === 'manual' && prev?.source === 'analyzer' && prev.value === value;
      values.push({
        parameterId: p.id,
        parameterName: p.name,
        unit: p.unit,
        value,
        numericValue,
        referenceRange: range ? { low: range.low, high: range.high, text: range.text, rangeId: range.id } : undefined,
        flag,
        source: unchangedAnalyzer ? 'analyzer' : source,
        analyzerMessageId: unchangedAnalyzer ? prev.analyzerMessageId : source === 'analyzer' ? analyzerMessageId : undefined,
      });
    }
    if (errors.length) throw unprocessable('INVALID_RESULT_VALUES', 'Some result values are invalid', errors);
    return values;
  }

  async enterValues(id: string, dto: z.infer<typeof EnterValuesDto>, actor: AuthUser) {
    const by = toActor(actor);
    const saved = await this.store.transaction(async (tx) => {
      const { result, test, patient, sample, order } = await this.loadContext(tx, id);
      if (!ENTERABLE.has(result.status))
        throw unprocessable('RESULT_LOCKED', result.status === 'approved' ? 'Approved results can only be changed through an amendment' : 'Result is awaiting verification');
      if (!sample || !SAMPLE_READY.has(sample.status))
        throw unprocessable('SAMPLE_NOT_READY', 'The sample must be accepted in the laboratory before results are entered');
      if (order.status === 'cancelled') throw unprocessable('ORDER_CANCELLED', 'Order is cancelled');
      const statusBase = await this.orders.statusBase(tx, order); // before any write

      const values = this.computeValues(test, patient, dto.values, result.values, 'manual');
      if (dto.submit) {
        const missing = test.parameters.filter((p) => !p.optional && !values.some((v) => v.parameterId === p.id));
        if (missing.length)
          throw unprocessable('INCOMPLETE_RESULT', 'All parameters need a value before submitting', missing.map((p) => ({ path: p.id, message: `${p.name} is required` })));
      }
      const now = this.store.now();
      const next: ResultDoc = {
        ...result,
        values,
        hasCritical: values.some((v) => isCritical(v.flag)),
        hasAnalyzerValues: values.some((v) => v.source === 'analyzer'),
        technicianComment: dto.technicianComment ?? result.technicianComment,
        status: dto.submit ? 'submitted' : 'draft',
        enteredBy: by,
        submittedAt: dto.submit ? now : result.submittedAt,
        updatedAt: now,
      };
      tx.set(C.results, id, next);
      const sampleNext = sample.status === 'accepted' ? { ...sample, status: 'processing' as const } : sample;
      if (sample.status === 'accepted') {
        tx.update(C.samples, sample.id, { status: 'processing', timeline: [...sample.timeline, { status: 'processing', at: now, by }], updatedAt: now });
      }
      const orderPatch = this.orders.statusPatch(order, statusBase, { samples: { [sample.id]: sampleNext.status }, results: { [id]: next.status } }, by, now);
      if (orderPatch) tx.update(C.orders, order.id, orderPatch);
      if (dto.submit) {
        this.notifications.notifyInTx(tx, {
          kind: 'pending_verification',
          severity: next.hasCritical ? 'critical' : 'info',
          title: `${result.testCode} awaiting verification`,
          body: `Order ${result.orderNumber}${next.hasCritical ? ' — contains CRITICAL values' : ''}.`,
          link: `/verification?result=${id}`,
          audiencePermission: 'results.approve',
        });
      }
      this.audit.recordInTx(tx, {
        action: dto.submit ? 'result.submit' : 'result.save_draft',
        entity: 'result',
        entityId: id,
        actor: by,
        changes: { values: values.map((v) => ({ p: v.parameterName, v: v.value, src: v.source })), version: result.version },
      });
      return next;
    });
    return saved;
  }

  private async loadContext(tx: TransactionContext, id: string) {
    const result = await tx.get<ResultDoc>(C.results, id);
    if (!result) throw notFound('Result');
    const [test, patient, sample, order] = await Promise.all([
      tx.get<TestDoc>(C.tests, result.testId),
      tx.get<PatientDoc>(C.patients, result.patientId),
      tx.get<SampleDoc>(C.samples, result.sampleId),
      tx.get<OrderDoc>(C.orders, result.orderId),
    ]);
    if (!test || !patient || !order) throw notFound('Result context');
    return { result, test, patient, sample, order };
  }

  async approve(id: string, dto: z.infer<typeof DecisionDto>, actor: AuthUser) {
    const settings = await this.settings.get();
    const by = toActor(actor);
    const approved = await this.store.transaction(async (tx) => {
      const result = await tx.get<ResultDoc>(C.results, id);
      if (!result) throw notFound('Result');
      if (result.status !== 'submitted') throw unprocessable('NOT_SUBMITTED', 'Only submitted results can be approved');
      if (!settings.results.allowSelfVerification && result.enteredBy?.uid === actor.uid)
        throw forbidden('Results must be verified by a different person than the one who entered them');
      // Version history exists only for amended results (versions are written on approval).
      const prevVersions = result.version > 1 ? await tx.query<ResultVersionDoc>(C.resultVersions, { where: [{ field: 'resultId', op: '==', value: id }] }) : [];
      // Order + its status summary (in this same transaction) for the sample and order status.
      const order = await tx.get<OrderDoc>(C.orders, result.orderId);
      const statusBase = order ? await this.orders.statusBase(tx, order) : null;
      const otherOfSample = order ? order.items.filter((i) => i.sampleId === result.sampleId && i.resultId !== id) : [];
      const allApproved = !!statusBase && otherOfSample.every((i) => statusBase.results.get(i.resultId) === 'approved');
      // The sample document itself is read (fresh, in this transaction) only when it is to be completed.
      const sample = allApproved && statusBase?.samples.get(result.sampleId) !== 'completed' ? await tx.get<SampleDoc>(C.samples, result.sampleId) : null;

      const now = this.store.now();
      const next: ResultDoc = { ...result, status: 'approved', approvedBy: by, approvedAt: now, approverComment: dto.comment, rejection: undefined, updatedAt: now };
      tx.set(C.results, id, next);

      const { id: _omit, ...snapshot } = next;
      const versionDoc: ResultVersionDoc = {
        id: `${id}_v${next.version}`,
        resultId: id,
        version: next.version,
        snapshot,
        approvedBy: by,
        approvedAt: now,
        amendmentReason: next.amendment?.reason,
      };
      tx.create(C.resultVersions, versionDoc.id, versionDoc);
      for (const v of prevVersions.filter((p) => !p.supersededAt)) tx.update(C.resultVersions, v.id, { supersededAt: now });

      const sampleDone = !!sample && allApproved && sample.status !== 'completed';
      if (sample && sampleDone) {
        tx.update(C.samples, sample.id, { status: 'completed', timeline: [...sample.timeline, { status: 'completed', at: now, by }], updatedAt: now });
      }
      if (order && statusBase) {
        const orderPatch = this.orders.statusPatch(order, statusBase, { samples: sampleDone ? { [result.sampleId]: 'completed' } : {}, results: { [id]: 'approved' } }, by, now);
        if (orderPatch) tx.update(C.orders, order.id, orderPatch);
      }
      if (next.hasCritical && settings.notifications.criticalResults) {
        this.notifications.notifyInTx(tx, {
          kind: 'critical_result',
          severity: 'critical',
          title: `CRITICAL result — ${result.testCode}`,
          body: `Order ${result.orderNumber}: verified critical value. Notify the referring clinician within ${settings.results.criticalEscalationMinutes} minutes and acknowledge.`,
          link: `/orders/${result.orderId}`,
          audiencePermission: 'results.read',
        });
      }
      this.audit.recordInTx(tx, {
        action: result.amendment ? 'result.approve_amendment' : 'result.approve',
        entity: 'result',
        entityId: id,
        actor: by,
        changes: { version: next.version, previousVersion: result.amendment?.previousVersion },
        note: dto.comment,
      });
      return next;
    });
    return approved;
  }

  async reject(id: string, dto: z.infer<typeof RejectDto>, actor: AuthUser) {
    const by = toActor(actor);
    const rejected = await this.store.transaction(async (tx) => {
      const result = await tx.get<ResultDoc>(C.results, id);
      if (!result) throw notFound('Result');
      if (result.status !== 'submitted') throw unprocessable('NOT_SUBMITTED', 'Only submitted results can be rejected');
      const order = await tx.get<OrderDoc>(C.orders, result.orderId);
      const statusBase = order ? await this.orders.statusBase(tx, order) : null;
      const now = this.store.now();
      const next: ResultDoc = { ...result, status: dto.kind, rejection: { reason: dto.reason, at: now, by, kind: dto.kind }, updatedAt: now };
      tx.set(C.results, id, next);
      const orderPatch = order && statusBase ? this.orders.statusPatch(order, statusBase, { results: { [id]: dto.kind } }, by, now) : null;
      if (order && orderPatch) tx.update(C.orders, order.id, orderPatch);
      this.notifications.notifyInTx(tx, {
        kind: 'result_rejected',
        severity: 'warning',
        title: `${result.testCode} returned for ${dto.kind === 'rejected' ? 're-test' : 'correction'}`,
        body: `Order ${result.orderNumber}. Reason: ${dto.reason}`,
        link: `/results/${id}`,
        audiencePermission: 'results.enter',
      });
      this.audit.recordInTx(tx, { action: `result.${dto.kind}`, entity: 'result', entityId: id, actor: by, note: dto.reason });
      return next;
    });
    return rejected;
  }

  /**
   * Opens an approved result for amendment. The approved version is preserved in
   * resultVersions; issued reports for the order are marked superseded so an
   * outdated report is never presented as current.
   */
  async amend(id: string, dto: z.infer<typeof AmendDto>, actor: AuthUser) {
    const by = toActor(actor);
    const amended = await this.store.transaction(async (tx) => {
      const result = await tx.get<ResultDoc>(C.results, id);
      if (!result) throw notFound('Result');
      if (result.status !== 'approved') throw unprocessable('NOT_APPROVED', 'Only approved results can be amended');
      const reports = await tx.query<ReportDoc>(C.reports, { where: [{ field: 'orderId', op: '==', value: result.orderId }] });
      const order = await tx.get<OrderDoc>(C.orders, result.orderId);
      const statusBase = order ? await this.orders.statusBase(tx, order) : null;
      const now = this.store.now();
      const next: ResultDoc = {
        ...result,
        status: 'draft',
        version: result.version + 1,
        amendment: { reason: dto.reason, at: now, by, previousVersion: result.version },
        approvedBy: undefined,
        approvedAt: undefined,
        updatedAt: now,
      };
      tx.set(C.results, id, next);
      const orderPatch = order && statusBase ? this.orders.statusPatch(order, statusBase, { results: { [id]: 'draft' } }, by, now) : null;
      if (order && orderPatch) tx.update(C.orders, order.id, orderPatch);
      for (const r of reports.filter((r) => r.status === 'final' || r.status === 'interim' || r.status === 'amended'))
        tx.update(C.reports, r.id, { status: 'superseded' });
      this.audit.recordInTx(tx, { action: 'result.amend_open', entity: 'result', entityId: id, actor: by, note: dto.reason, changes: { fromVersion: result.version, toVersion: next.version } });
      return next;
    });
    return amended;
  }

  /**
   * Called by analyzer intake after a message is matched. Values are stored as a
   * DRAFT with source=analyzer. They are never submitted or approved automatically.
   */
  async applyAnalyzerValues(resultId: string, values: AnalyzerValueInput[], messageId: string, by: AuditActor): Promise<ResultDoc> {
    const saved = await this.store.transaction(async (tx) => {
      const { result, test, patient, sample, order } = await this.loadContext(tx, resultId);
      if (!ENTERABLE.has(result.status)) throw unprocessable('RESULT_LOCKED', `Result is ${result.status}; analyzer values were not applied`);
      if (!sample || !SAMPLE_READY.has(sample.status)) throw unprocessable('SAMPLE_NOT_READY', 'Sample has not been accepted in the laboratory');
      const statusBase = await this.orders.statusBase(tx, order); // before any write
      const computed = this.computeValues(test, patient, values, result.values, 'analyzer', messageId);
      // Keep any manual values for parameters the analyzer didn't send.
      const merged = [...computed, ...result.values.filter((v) => !computed.some((c) => c.parameterId === v.parameterId))];
      const now = this.store.now();
      const next: ResultDoc = {
        ...result,
        values: merged,
        status: 'draft',
        hasCritical: merged.some((v) => isCritical(v.flag)),
        hasAnalyzerValues: true,
        updatedAt: now,
      };
      tx.set(C.results, resultId, next);
      if (sample.status === 'accepted')
        tx.update(C.samples, sample.id, { status: 'processing', timeline: [...sample.timeline, { status: 'processing', at: now, by }], updatedAt: now });
      const orderPatch = this.orders.statusPatch(order, statusBase, { samples: sample.status === 'accepted' ? { [sample.id]: 'processing' } : {}, results: { [resultId]: 'draft' } }, by, now);
      if (orderPatch) tx.update(C.orders, order.id, orderPatch);
      this.audit.recordInTx(tx, { action: 'result.analyzer_import', entity: 'result', entityId: resultId, actor: by, changes: { messageId, parameters: computed.length } });
      return next;
    });
    return saved;
  }
}
