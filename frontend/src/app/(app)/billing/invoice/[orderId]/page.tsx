'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Barcode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { ErrorState, LoadingRows } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { formatDateTime, formatMoney, titleCase } from '@/lib/utils';
import { billingService } from '@/services/admin.service';

export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const state = useApi(() => billingService.invoice(orderId), [orderId]);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const inv = state.data;
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/orders/${orderId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Order {inv.order.orderNumber}</Link>
        <Button onClick={() => window.print()}><Printer /> Print invoice</Button>
      </div>
      <div className="-mx-4 overflow-x-auto bg-muted/40 px-4 py-6 sm:mx-0 sm:rounded-xl print:m-0 print:bg-transparent print:p-0">
        <article className="print-area mx-auto w-full max-w-[210mm] bg-white p-[10mm] text-[10pt] text-slate-900 shadow-elevated sm:p-[14mm]">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0d7f8e] pb-3">
            <div className="flex items-center gap-3">
              <LabLogoMark className="size-12" />
              <div>
                <p className="text-[14pt] font-bold tracking-wide text-[#0d7f8e]">{inv.lab.name}</p>
                <p className="text-[9pt] italic text-slate-500">{inv.lab.tagline}</p>
                <p className="text-[8pt] text-slate-600">{[inv.lab.address, inv.lab.phone].filter(Boolean).join(' • ')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[13pt] font-semibold uppercase tracking-wider">Invoice</p>
              <p className="font-mono text-[9pt]">{inv.invoiceNumber}</p>
              <Barcode value={inv.order.orderNumber} height={26} width={1.1} fontSize={9} />
            </div>
          </header>
          <section className="mt-4 grid grid-cols-2 gap-4 text-[9.5pt]">
            <div>
              <p className="text-[8pt] uppercase text-slate-500">Billed to</p>
              <p className="font-semibold">{inv.patient?.name}</p>
              <p>{inv.patient?.mrNumber} · {inv.patient?.mobile}</p>
            </div>
            <div className="text-right">
              <p><span className="text-slate-500">Date:</span> {formatDateTime(inv.order.createdAt)}</p>
              <p><span className="text-slate-500">Order:</span> {inv.order.orderNumber}</p>
              <p><span className="text-slate-500">Referred by:</span> {inv.order.doctorName ?? 'Self'}</p>
            </div>
          </section>
          <table className="mt-5 w-full border-collapse text-[9.5pt]">
            <thead><tr className="border-y border-slate-300 text-left"><th className="py-2">Code</th><th>Description</th><th className="text-right">Amount ({inv.lab.currency})</th></tr></thead>
            <tbody>{inv.lines.map((l) => <tr key={l.testCode} className="border-b border-slate-100"><td className="py-1.5 font-mono">{l.testCode}</td><td>{l.testName}</td><td className="text-right">{formatMoney(l.amount)}</td></tr>)}</tbody>
          </table>
          <div className="ml-auto mt-4 w-72 space-y-1 text-[9.5pt]">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(inv.billing.subtotal)}</span></div>
            {inv.billing.collectionFee > 0 && <div className="flex justify-between"><span>Collection fee</span><span>{formatMoney(inv.billing.collectionFee)}</span></div>}
            {inv.billing.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(inv.billing.discountAmount)}</span></div>}
            <div className="flex justify-between border-t border-slate-300 pt-1 text-[11pt] font-bold"><span>Total</span><span>{formatMoney(inv.billing.total)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>{formatMoney(inv.billing.paid)}</span></div>
            {inv.billing.refunded > 0 && <div className="flex justify-between"><span>Refunded</span><span>−{formatMoney(inv.billing.refunded)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatMoney(inv.billing.balance)}</span></div>
          </div>
          {inv.payments.length > 0 && (
            <section className="mt-6">
              <p className="mb-1 text-[8.5pt] font-semibold uppercase text-slate-500">Payments</p>
              <table className="w-full text-[8.5pt]">
                <tbody>{inv.payments.map((p) => <tr key={p.id} className="border-b border-slate-100"><td className="py-1 font-mono">{p.receiptNumber}</td><td>{titleCase(p.type)} · {titleCase(p.method)}</td><td>{formatDateTime(p.recordedAt)}</td><td className="text-right">{p.type === 'refund' ? '−' : ''}{formatMoney(p.amount)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          <p className="mt-8 border-t border-slate-200 pt-2 text-center text-[8pt] text-slate-500">Computer-generated invoice. Amounts are as recorded by the laboratory billing system.</p>
        </article>
      </div>
    </div>
  );
}
