import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { OrderDoc, PatientDoc, PaymentDoc } from '../../common/entities';
import { notFound, unprocessable } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { isoDate, labDateKey, money, nextSequence, optionalText, pad, paginationQuery, requiredText, round2, yearCode } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

export const RecordPaymentDto = z.object({
  amount: money.refine((n) => n > 0, 'Amount must be greater than zero'),
  method: z.enum(['cash', 'card', 'bank_transfer', 'panel']),
  reference: optionalText(80),
});

export const RefundDto = z.object({
  amount: money.refine((n) => n > 0, 'Amount must be greater than zero'),
  method: z.enum(['cash', 'card', 'bank_transfer']),
  reason: requiredText(300),
  reference: optionalText(80),
});

export const PaymentQuery = paginationQuery.extend({
  businessDate: isoDate.optional(),
  method: z.enum(['cash', 'card', 'bank_transfer', 'panel']).optional(),
  type: z.enum(['payment', 'refund']).optional(),
});

@Injectable()
export class BillingService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  private businessDate(iso: string) {
    return labDateKey(getEnv().LAB_TIMEZONE, new Date(iso));
  }

  /**
   * Records money actually received. The amount is validated against the
   * server-side balance; the client cannot mark an order "paid".
   */
  async recordPayment(orderId: string, dto: z.infer<typeof RecordPaymentDto>, actor: AuthUser, type: 'payment' | 'refund' = 'payment', reason?: string) {
    const by = toActor(actor);
    return this.store.transaction(async (tx) => {
      const order = await tx.get<OrderDoc>(C.orders, orderId);
      if (!order) throw notFound('Order');
      const amount = round2(dto.amount);
      const netPaid = round2(order.billing.paid - order.billing.refunded);
      if (type === 'payment') {
        if (order.status === 'cancelled') throw unprocessable('ORDER_CANCELLED', 'Cannot take payment for a cancelled order');
        if (amount > order.billing.balance)
          throw unprocessable('PAYMENT_EXCEEDS_BALANCE', `Amount exceeds the outstanding balance (${order.billing.balance})`);
      } else if (amount > netPaid) {
        throw unprocessable('REFUND_EXCEEDS_PAID', `Refund cannot exceed the net amount paid (${netPaid})`);
      }
      const seq = await nextSequence(tx, type === 'payment' ? 'receipt' : 'refund');
      const now = this.store.now();
      const payment: PaymentDoc = {
        id: this.store.newId(),
        receiptNumber: `${type === 'payment' ? 'RC' : 'RF'}-${yearCode(now)}${pad(seq, 6)}`,
        orderId,
        orderNumber: order.orderNumber,
        patientId: order.patientId,
        type,
        method: dto.method,
        amount,
        reference: dto.reference,
        reason,
        recordedBy: by,
        recordedAt: now,
        businessDate: this.businessDate(now),
      };
      const billing =
        type === 'payment'
          ? { ...order.billing, paid: round2(order.billing.paid + amount), balance: round2(order.billing.balance - amount) }
          : {
              ...order.billing,
              refunded: round2(order.billing.refunded + amount),
              // A refund on an active order re-opens the balance; on a cancelled order nothing is owed.
              balance: order.status === 'cancelled' ? 0 : round2(order.billing.balance + amount),
            };
      const patch: Partial<OrderDoc> = { billing, updatedAt: now };
      if (type === 'payment' && order.status === 'payment_pending') {
        patch.status = 'sample_pending';
        patch.statusHistory = [...order.statusHistory, { status: 'sample_pending', at: now, by }];
      }
      tx.create(C.payments, payment.id, payment);
      tx.update(C.orders, orderId, patch);
      if (type === 'refund') {
        this.notifications.notifyInTx(tx, {
          kind: 'payment',
          severity: 'warning',
          title: `Refund ${payment.receiptNumber} recorded`,
          body: `Order ${order.orderNumber}: ${amount} refunded (${dto.method}).`,
          link: `/billing?order=${orderId}`,
          audiencePermission: 'billing.refund',
        });
      }
      this.audit.recordInTx(tx, {
        action: type === 'payment' ? 'payment.record' : 'payment.refund',
        entity: 'order',
        entityId: orderId,
        actor: by,
        note: reason,
        changes: { receipt: payment.receiptNumber, amount, method: dto.method, balanceAfter: billing.balance },
      });
      return { payment, billing };
    });
  }

  refund(orderId: string, dto: z.infer<typeof RefundDto>, actor: AuthUser) {
    return this.recordPayment(orderId, dto, actor, 'refund', dto.reason);
  }

  async listPayments(q: z.infer<typeof PaymentQuery>) {
    const where: WhereClause[] = [];
    if (q.businessDate) where.push({ field: 'businessDate', op: '==', value: q.businessDate });
    if (q.method) where.push({ field: 'method', op: '==', value: q.method });
    if (q.type) where.push({ field: 'type', op: '==', value: q.type });
    return this.store.query<PaymentDoc>(C.payments, { where, orderBy: { field: 'recordedAt', direction: 'desc' }, limit: q.limit, cursor: q.cursor });
  }

  async dailySummary(date?: string) {
    const businessDate = date ?? this.businessDate(this.store.now());
    const { items } = await this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'businessDate', op: '==', value: businessDate }] });
    const byMethod: Record<string, { payments: number; refunds: number; net: number; count: number }> = {};
    const byUser: Record<string, { name: string; net: number; count: number }> = {};
    for (const p of items) {
      const m = (byMethod[p.method] ??= { payments: 0, refunds: 0, net: 0, count: 0 });
      const signed = p.type === 'payment' ? p.amount : -p.amount;
      if (p.type === 'payment') m.payments += p.amount;
      else m.refunds += p.amount;
      m.net += signed;
      m.count++;
      const u = (byUser[p.recordedBy.uid] ??= { name: p.recordedBy.name, net: 0, count: 0 });
      u.net += signed;
      u.count++;
    }
    const total = items.reduce((s, p) => s + (p.type === 'payment' ? p.amount : -p.amount), 0);
    return {
      businessDate,
      totals: {
        collected: round2(items.filter((p) => p.type === 'payment').reduce((s, p) => s + p.amount, 0)),
        refunded: round2(items.filter((p) => p.type === 'refund').reduce((s, p) => s + p.amount, 0)),
        net: round2(total),
        cashInHand: round2(byMethod.cash?.net ?? 0),
        transactions: items.length,
      },
      byMethod,
      byUser: Object.values(byUser),
      transactions: items.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    };
  }

  async outstanding(limit: number, cursor?: string) {
    const res = await this.store.query<OrderDoc>(C.orders, {
      where: [{ field: 'billing.balance', op: '>', value: 0 }],
      orderBy: { field: 'billing.balance', direction: 'desc' },
      limit,
      cursor,
    });
    return {
      ...res,
      items: res.items.map((o) => ({ id: o.id, orderNumber: o.orderNumber, patientName: o.patientName, patientMrNumber: o.patientMrNumber, total: o.billing.total, paid: o.billing.paid - o.billing.refunded, balance: o.billing.balance, status: o.status, createdAt: o.createdAt, panelId: o.panelId })),
    };
  }

  async invoice(orderId: string) {
    const order = await this.store.get<OrderDoc>(C.orders, orderId);
    if (!order) throw notFound('Order');
    const [patient, payments, settings] = await Promise.all([
      this.store.get<PatientDoc>(C.patients, order.patientId),
      this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'orderId', op: '==', value: orderId }], orderBy: { field: 'recordedAt' } }),
      this.settings.get(),
    ]);
    return {
      invoiceNumber: order.orderNumber.replace('ORD', 'INV'),
      lab: { name: settings.name, tagline: settings.tagline, address: settings.address, phone: settings.phone, currency: settings.billing.currency },
      order: { id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, status: order.status, doctorName: order.doctorName },
      patient: patient && { name: patient.name, mrNumber: patient.mrNumber, mobile: patient.mobile },
      lines: order.items.map((i) => ({ testCode: i.testCode, testName: i.testName, amount: i.unitPrice })),
      billing: order.billing,
      payments: payments.items,
    };
  }
}
