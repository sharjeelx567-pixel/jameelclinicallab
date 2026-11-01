'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { PAYMENT_METHODS } from '@/constants';
import { errorMessage } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { billingService } from '@/services/admin.service';
import type { PaymentMethod } from '@/types';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  orderNumber: string;
  mode: 'payment' | 'refund';
  /** Server-reported balance (payment) or net paid (refund) — shown as guidance; the server re-validates. */
  limit: number;
  onDone: () => void;
}

export function PaymentDialog({ open, onOpenChange, orderId, orderNumber, mode, limit, onDone }: Props) {
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<PaymentMethod>('cash');
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [pending, setPending] = React.useState(false);
  const idem = useIdempotencyKey();

  React.useEffect(() => {
    if (open) {
      setAmount(mode === 'payment' && limit > 0 ? String(limit) : '');
      setReference('');
      setReason('');
      setError(undefined);
      setMethod('cash');
    }
  }, [open, limit, mode]);

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero');
    if (n > limit) return setError(`Cannot exceed ${formatMoney(limit)}`);
    if (mode === 'refund' && reason.trim().length < 3) return setError('A refund reason is required');
    if ((method === 'card' || method === 'bank_transfer') && !reference.trim()) return setError('Enter the transaction / slip reference');
    setPending(true);
    try {
      const res =
        mode === 'payment'
          ? await billingService.pay(orderId, { amount: n, method, reference: reference.trim() || undefined }, idem.key())
          : await billingService.refund(orderId, { amount: n, method: method as Exclude<PaymentMethod, 'panel'>, reason: reason.trim(), reference: reference.trim() || undefined }, idem.key());
      idem.reset();
      toast.success(`${mode === 'payment' ? 'Payment' : 'Refund'} recorded — receipt ${res.payment.receiptNumber}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{mode === 'payment' ? 'Record payment' : 'Record refund'}</DialogTitle>
          <DialogDescription>
            Order {orderNumber} · {mode === 'payment' ? 'balance due' : 'refundable'} <strong>{formatMoney(limit)}</strong>. Record only money actually received or returned.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Amount (PKR)" htmlFor="pay-amount" required>
            <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Method" htmlFor="pay-method" required>
            <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.filter((m) => mode === 'payment' || m.value !== 'panel').map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          {method !== 'cash' && (
            <Field label="Reference" htmlFor="pay-ref" required={method !== 'panel'} hint="Card slip, bank transaction or panel claim number">
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
            </Field>
          )}
          {mode === 'refund' && (
            <Field label="Reason" htmlFor="pay-reason" required>
              <Textarea id="pay-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
          )}
          {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={mode === 'refund' ? 'destructive' : 'default'} loading={pending} onClick={() => void submit()}>
            {mode === 'payment' ? 'Record payment' : 'Record refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
