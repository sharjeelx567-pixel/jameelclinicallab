'use client';

import { Printer } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { ordersService } from '@/services/lab.service';

/**
 * Opens the patient's bill on the print page (logo, A4, print dialog opens by itself).
 * With `orderId` it prints that bill; with only `patientId` it prints the latest one.
 */
export function PrintBillButton({ patientId, orderId, label = 'Print bill', ...props }: { patientId?: string; orderId?: string; label?: string } & Omit<ButtonProps, 'onClick'>) {
  const [busy, setBusy] = React.useState(false);
  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // rows/cards behind the button navigate on click
    if (orderId) return void window.open(`/print/bill/${orderId}?auto=1`, '_blank', 'noopener');
    // Open the tab now (still inside the click) so pop-up blockers allow it, then point it at the bill.
    const tab = window.open('about:blank', '_blank');
    setBusy(true);
    try {
      const latest = (await ordersService.list({ patientId, limit: 1 })).items.find((o) => o.status !== 'cancelled') ?? null;
      if (!latest) {
        tab?.close();
        return void toast.info('This patient has no bill yet. Use Register & bill to add tests.');
      }
      if (tab) tab.location.href = `/print/bill/${latest.id}?auto=1`;
      else window.location.href = `/print/bill/${latest.id}?auto=1`;
    } catch (err) {
      tab?.close();
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" loading={busy} onClick={(e) => void open(e)} {...props}>
      <Printer /> {label}
    </Button>
  );
}
