'use client';

import { ArrowLeft, FilePlus2, Printer, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PatientBill } from '@/components/billing/patient-bill';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { billingService } from '@/services/admin.service';

/** Bill on its own page: just the A4 document. ?auto=1 opens the print dialog once the bill (and logo) has loaded. */
export default function PrintBillPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const params = useSearchParams();
  const state = useApi(() => billingService.invoice(orderId), [orderId]);
  const printed = React.useRef(false);

  React.useEffect(() => {
    if (!state.data || params.get('auto') !== '1' || printed.current) return;
    printed.current = true;
    // Wait for the logo and barcodes to finish loading so they appear on paper.
    const waitImages = Promise.all(
      Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }))),
    );
    let cancelled = false;
    void Promise.race([waitImages, new Promise((r) => setTimeout(r, 2500))]).then(() => !cancelled && setTimeout(() => window.print(), 150));
    return () => {
      cancelled = true;
    };
  }, [state.data, params]);

  React.useEffect(() => {
    document.title = state.data ? `Bill ${state.data.order.orderNumber} — ${state.data.patient?.name ?? ''}` : 'Patient bill';
  }, [state.data]);

  return (
    <div className="mx-auto max-w-[230mm] px-3 py-4 print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/orders/${orderId}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" /> Back to order</Link>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"><Link href="/register"><FilePlus2 /> New registration</Link></Button>
          <Button onClick={() => window.print()} disabled={!state.data}><Printer /> Print bill</Button>
        </div>
      </div>
      {state.error ? (
        <div className="no-print rounded-xl border border-red-200 bg-white p-6 text-center text-sm">
          <p className="font-semibold text-red-700">The bill could not be loaded.</p>
          <p className="mt-1 text-slate-600">{errorMessage(state.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void state.reload()}><RefreshCw /> Try again</Button>
        </div>
      ) : !state.data ? (
        <div className="mx-auto h-[270mm] max-w-[210mm] animate-pulse rounded bg-white" aria-busy />
      ) : (
        <PatientBill inv={state.data} />
      )}
    </div>
  );
}
