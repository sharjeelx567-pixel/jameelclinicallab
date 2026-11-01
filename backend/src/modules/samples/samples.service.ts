import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { OrderDoc, ResultDoc, SampleDoc, SampleStatus } from '../../common/entities';
import { notFound, unprocessable } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { optionalText, pad, paginationQuery, requiredText, reserveSequences, yearCode } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';

export const SAMPLE_TRANSITIONS: Record<string, { from: SampleStatus[]; to: SampleStatus }> = {
  collect: { from: ['pending_collection'], to: 'collected' },
  receive: { from: ['collected'], to: 'received' },
  accept: { from: ['received'], to: 'accepted' },
  process: { from: ['accepted'], to: 'processing' },
  complete: { from: ['processing', 'accepted'], to: 'completed' },
  reject: { from: ['collected', 'received', 'accepted'], to: 'rejected' },
};
export type SampleAction = keyof typeof SAMPLE_TRANSITIONS;

export const SampleActionDto = z.object({
  location: optionalText(120),
  condition: optionalText(120),
  note: optionalText(300),
  reason: optionalText(300),
});

export const SampleQuery = paginationQuery.extend({
  status: z.string().max(30).optional(),
  orderId: z.string().max(64).optional(),
});

@Injectable()
export class SamplesService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: z.infer<typeof SampleQuery>) {
    const where: WhereClause[] = [];
    if (q.status) where.push({ field: 'status', op: '==', value: q.status });
    if (q.orderId) where.push({ field: 'orderId', op: '==', value: q.orderId });
    return this.store.query<SampleDoc>(C.samples, { where, orderBy: { field: 'createdAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
  }

  async get(id: string): Promise<SampleDoc> {
    const s = await this.store.get<SampleDoc>(C.samples, id);
    if (!s) throw notFound('Sample');
    return s;
  }

  /** Barcode scan lookup: accepts the printed sample number. */
  async byBarcode(code: string) {
    const clean = code.trim().toUpperCase().slice(0, 30);
    const res = await this.store.query<SampleDoc>(C.samples, { where: [{ field: 'sampleNumber', op: '==', value: clean }], limit: 1 });
    if (!res.items[0]) throw notFound('Sample with this barcode');
    return res.items[0];
  }

  async transition(id: string, action: SampleAction, dto: z.infer<typeof SampleActionDto>, actor: AuthUser) {
    const rule = SAMPLE_TRANSITIONS[action];
    if (action === 'reject' && !dto.reason) throw unprocessable('REASON_REQUIRED', 'A rejection reason is required');
    const by = toActor(actor);

    const updated = await this.store.transaction(async (tx) => {
      const sample = await tx.get<SampleDoc>(C.samples, id);
      if (!sample) throw notFound('Sample');
      const order = await tx.get<OrderDoc>(C.orders, sample.orderId);
      if (!order || order.status === 'cancelled') throw unprocessable('ORDER_CANCELLED', 'The order for this sample is cancelled');
      if (!rule.from.includes(sample.status))
        throw unprocessable('INVALID_TRANSITION', `Cannot ${action} a sample that is ${sample.status.replace('_', ' ')}`);

      const results =
        action === 'reject'
          ? await tx.query<ResultDoc>(C.results, { where: [{ field: 'sampleId', op: '==', value: id }] })
          : [];
      if (results.some((r) => r.status === 'approved' || r.status === 'submitted'))
        throw unprocessable('RESULTS_EXIST', 'Results for this sample are already submitted or approved');
      const seq = action === 'reject' ? await reserveSequences(tx, { sample: 1 }) : null;

      const now = this.store.now();
      const next: SampleDoc = {
        ...sample,
        status: rule.to,
        timeline: [...sample.timeline, { status: rule.to, at: now, by, note: dto.reason ?? dto.note }],
        updatedAt: now,
        ...(action === 'collect' && {
          collectedAt: now,
          collectedBy: by,
          collectionLocation: dto.location ?? sample.collectionLocation,
          condition: dto.condition,
        }),
        ...(action === 'receive' && dto.condition && { condition: dto.condition }),
        ...(action === 'reject' && { rejectionReason: dto.reason }),
      };
      tx.set(C.samples, id, next);

      let replacement: SampleDoc | undefined;
      if (action === 'reject' && seq) {
        // Rejected specimen → automatically queue a recollection for the same tests.
        replacement = {
          ...sample,
          id: this.store.newId(),
          sampleNumber: `S${yearCode(now)}${pad(seq.sample[0], 7)}`,
          status: 'pending_collection',
          collectedAt: undefined,
          collectedBy: undefined,
          condition: undefined,
          rejectionReason: undefined,
          timeline: [{ status: 'pending_collection', at: now, by, note: `Recollection — replaces ${sample.sampleNumber}` }],
          createdAt: now,
          updatedAt: now,
        };
        tx.create(C.samples, replacement.id, replacement);
        tx.update(C.orders, order.id, {
          items: order.items.map((i) => (i.sampleId === id ? { ...i, sampleId: replacement!.id } : i)),
          updatedAt: now,
        });
        for (const r of results) tx.update(C.results, r.id, { sampleId: replacement.id, values: [], status: 'pending', updatedAt: now });
        this.notifications.notifyInTx(tx, {
          kind: 'pending_sample',
          severity: 'warning',
          title: `Sample ${sample.sampleNumber} rejected`,
          body: `Recollection required for order ${order.orderNumber} (new sample ${replacement.sampleNumber}).`,
          link: `/orders/${order.id}`,
          audiencePermission: 'samples.collect',
        });
      }
      this.audit.recordInTx(tx, {
        action: `sample.${action}`,
        entity: 'sample',
        entityId: id,
        actor: by,
        note: dto.reason ?? dto.note,
        changes: { status: { from: sample.status, to: rule.to }, ...(replacement && { replacementSample: replacement.sampleNumber }) },
      });
      return { sample: next, replacement };
    });

    await this.orders.syncStatus(updated.sample.orderId, by);
    return updated;
  }

  async recordLabelPrint(id: string, kind: 'sample' | 'order' | 'patient', actor: AuthUser) {
    const sample = await this.get(id);
    const doc = { id: this.store.newId(), sampleId: id, sampleNumber: sample.sampleNumber, kind, by: toActor(actor), at: this.store.now() };
    await this.store.create(C.labelPrints, doc.id, doc);
    const prints = await this.store.count(C.labelPrints, [{ field: 'sampleId', op: '==', value: id }]);
    await this.audit.record({ action: prints > 1 ? 'label.reprint' : 'label.print', entity: 'sample', entityId: id, actor: toActor(actor) });
    return { printCount: prints };
  }
}

export const RejectReason = requiredText(300);
