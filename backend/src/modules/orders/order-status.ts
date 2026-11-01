import type { OrderDoc, OrderStatus, ResultDoc, SampleDoc } from '../../common/entities';

/**
 * Derives an order's status from its samples, results and billing. Status is
 * always computed on the server from the underlying records — never accepted
 * from the client — so it cannot drift from reality.
 */
export function deriveOrderStatus(
  order: Pick<OrderDoc, 'status' | 'billing'>,
  samples: Pick<SampleDoc, 'status'>[],
  results: Pick<ResultDoc, 'status'>[],
): OrderStatus {
  if (order.status === 'cancelled') return 'cancelled';
  const live = samples.filter((s) => s.status !== 'rejected');

  if (results.length && results.every((r) => r.status === 'approved')) return 'completed';
  if (results.length && results.every((r) => r.status === 'submitted' || r.status === 'approved')) return 'verification_pending';

  if (live.some((s) => s.status === 'pending_collection')) {
    return order.billing.total > 0 && order.billing.paid === 0 ? 'payment_pending' : 'sample_pending';
  }
  if (results.some((r) => r.status !== 'pending')) return 'results_pending';
  if (live.some((s) => s.status === 'accepted' || s.status === 'processing' || s.status === 'completed')) return 'processing';
  if (live.length && live.every((s) => s.status === 'collected' || s.status === 'received')) return 'sample_collected';
  return 'registered';
}
