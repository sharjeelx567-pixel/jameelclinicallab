import type { PanelDoc, TestDoc } from '../../common/entities';
import { deriveOrderStatus } from './order-status';
import { priceOrder } from './orders.service';

const billing = (paid: number, total = 100) => ({ subtotal: total, collectionFee: 0, discountAmount: 0, total, paid, refunded: 0, balance: total - paid });

describe('deriveOrderStatus', () => {
  const order = (paid = 0) => ({ status: 'registered' as const, billing: billing(paid) });

  it('is payment_pending when nothing is paid and samples are pending', () => {
    expect(deriveOrderStatus(order(0), [{ status: 'pending_collection' }], [{ status: 'pending' }])).toBe('payment_pending');
  });
  it('is sample_pending once something is paid', () => {
    expect(deriveOrderStatus(order(50), [{ status: 'pending_collection' }], [{ status: 'pending' }])).toBe('sample_pending');
  });
  it('is sample_collected when all samples collected', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'collected' }, { status: 'received' }], [{ status: 'pending' }])).toBe('sample_collected');
  });
  it('is processing once a sample is accepted', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'accepted' }], [{ status: 'pending' }])).toBe('processing');
  });
  it('is results_pending once entry begins', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'processing' }], [{ status: 'draft' }, { status: 'pending' }])).toBe('results_pending');
  });
  it('is verification_pending when every result is submitted/approved', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'processing' }], [{ status: 'submitted' }, { status: 'approved' }])).toBe('verification_pending');
  });
  it('is completed only when every result is approved', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'completed' }], [{ status: 'approved' }, { status: 'approved' }])).toBe('completed');
  });
  it('stays cancelled', () => {
    expect(deriveOrderStatus({ ...order(), status: 'cancelled' }, [], [{ status: 'approved' }])).toBe('cancelled');
  });
  it('ignores rejected samples (replacement sample drives status)', () => {
    expect(deriveOrderStatus(order(100), [{ status: 'rejected' }, { status: 'collected' }], [{ status: 'pending' }])).toBe('sample_collected');
  });
});

describe('priceOrder', () => {
  const test = (id: string, price: number, discountEligible = true) => ({ id, price, discountEligible }) as TestDoc;

  it('uses catalogue prices without a panel', () => {
    expect(priceOrder([test('a', 100), test('b', 50)], null).subtotal).toBe(150);
  });
  it('panel negotiated rate overrides; percent applies only to eligible tests', () => {
    const panel = { rates: { a: 80 }, discountPercent: 10 } as unknown as PanelDoc;
    const r = priceOrder([test('a', 100), test('b', 50), test('c', 200, false)], panel);
    expect(r.lines.map((l) => l.unitPrice)).toEqual([80, 45, 200]);
    expect(r.subtotal).toBe(325);
    expect(r.discountableSubtotal).toBe(125);
  });
});
