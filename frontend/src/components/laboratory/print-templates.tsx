'use client';

import { Barcode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { BRAND } from '@/constants';
import { formatDateTime, formatMoney, titleCase } from '@/lib/utils';
import type { Order, Payment, Sample } from '@/types';

/**
 * Sample labels sized from Settings → Barcode (default 50×25 mm). Printed via the
 * browser so any label/thermal printer driver can be used — no specific model assumed.
 */
export function SampleLabels({ samples, order, widthMm = 50, heightMm = 25 }: { samples: Sample[]; order: Pick<Order, 'patientName' | 'patientMrNumber' | 'orderNumber'>; widthMm?: number; heightMm?: number }) {
  return (
    <div className="flex flex-wrap gap-[2mm]">
      {samples.map((s) => (
        <div key={s.id} className="flex flex-col justify-between overflow-hidden border border-dashed border-slate-300 p-[1.5mm] text-black print:border-none" style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, breakInside: 'avoid' }}>
          <div className="flex justify-between text-[7pt] font-semibold leading-tight">
            <span className="truncate">{order.patientName}</span>
            <span>{order.patientMrNumber}</span>
          </div>
          <Barcode value={s.sampleNumber} height={22} width={1.2} fontSize={9} className="mx-auto max-w-full" />
          <div className="flex justify-between text-[6.5pt] leading-tight">
            <span className="truncate">{s.sampleType}{s.containerType ? ` · ${s.containerType}` : ''}</span>
            <span>{order.orderNumber}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderReceipt({ order, payments, patient }: { order: Order; payments: Payment[]; patient: { mobile?: string; ageYears?: number; gender?: string } | null }) {
  return (
    <div className="mx-auto max-w-[180mm] text-[10pt] text-slate-900">
      <div className="flex items-start justify-between border-b border-slate-300 pb-3">
        <div className="flex items-center gap-3">
          <LabLogoMark className="size-11" />
          <div>
            <p className="text-[13pt] font-bold tracking-wide text-[#0d7f8e]">{BRAND.name}</p>
            <p className="text-[9pt] italic text-slate-500">{BRAND.tagline}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11pt] font-semibold">Order receipt</p>
          <Barcode value={order.orderNumber} height={30} width={1.2} fontSize={10} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[9.5pt]">
        <p><span className="text-slate-500">Patient:</span> <strong>{order.patientName}</strong></p>
        <p><span className="text-slate-500">MR No.:</span> {order.patientMrNumber}</p>
        <p><span className="text-slate-500">Age / Sex:</span> {patient?.ageYears ?? '—'} Y / {titleCase(patient?.gender ?? '')}</p>
        <p><span className="text-slate-500">Mobile:</span> {patient?.mobile}</p>
        <p><span className="text-slate-500">Referred by:</span> {order.doctorName ?? 'Self'}</p>
        <p><span className="text-slate-500">Date:</span> {formatDateTime(order.createdAt)}</p>
      </div>
      <table className="mt-4 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="border-y border-slate-300 text-left"><th className="py-1.5">Code</th><th>Test</th><th className="text-right">Amount</th></tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.testId} className="border-b border-slate-100"><td className="py-1">{i.testCode}</td><td>{i.testName}</td><td className="text-right">{formatMoney(i.unitPrice)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-3 w-64 space-y-1 text-[9.5pt]">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(order.billing.subtotal)}</span></div>
        {order.billing.collectionFee > 0 && <div className="flex justify-between"><span>Collection fee</span><span>{formatMoney(order.billing.collectionFee)}</span></div>}
        {order.billing.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(order.billing.discountAmount)}</span></div>}
        <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold"><span>Total</span><span>{formatMoney(order.billing.total)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{formatMoney(order.billing.paid - order.billing.refunded)}</span></div>
        <div className="flex justify-between font-semibold"><span>Balance</span><span>{formatMoney(order.billing.balance)}</span></div>
      </div>
      {payments.length > 0 && (
        <p className="mt-3 text-[8.5pt] text-slate-500">Receipts: {payments.map((p) => `${p.receiptNumber} (${titleCase(p.method)} ${p.type === 'refund' ? '−' : ''}${formatMoney(p.amount)})`).join(', ')}</p>
      )}
      <p className="mt-6 border-t border-slate-200 pt-2 text-center text-[8pt] text-slate-500">Please keep this receipt. Reports are released only after verification by an authorised pathologist.</p>
    </div>
  );
}
