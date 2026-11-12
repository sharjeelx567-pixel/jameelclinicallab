import * as React from 'react';
import { Barcode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { amountInWords } from '@/lib/amount-words';
import { formatDateTime, titleCase } from '@/lib/utils';
import type { billingService } from '@/services/admin.service';

export type InvoiceData = Awaited<ReturnType<typeof billingService.invoice>>;

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n);

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-[1px]">
      <span className="font-semibold">{k}</span>
      <span className="font-bold uppercase">: {v || ''}</span>
    </div>
  );
}

/** A4 patient bill laid out like the laboratory's printed bill (logo, barcodes, report times, amount in words). */
export function PatientBill({ inv }: { inv: InvoiceData }) {
  const p = inv.patient;
  const b = inv.billing;
  const toBePaid = b.total;
  const paidNet = b.paid - b.refunded;
  const relation = p?.guardianRelation && p.guardianRelation !== 'other' ? ` (${titleCase(p.guardianRelation)})` : '';
  return (
    <article className="print-area print-doc mx-auto flex min-h-[273mm] w-full min-w-[180mm] max-w-[210mm] flex-col bg-white p-[10mm] text-[10pt] font-medium text-black shadow-elevated print:min-h-0 sm:p-[12mm]">
      <header className="flex items-center justify-between gap-6 border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-4">
          <LabLogoMark className="size-24" alt={inv.lab.name} />
          <div>
            <p className="text-[9pt] font-semibold italic text-slate-900">{inv.lab.tagline}</p>
            {inv.lab.address && <p className="text-[8.5pt] text-slate-900">{inv.lab.address}</p>}
            <p className="text-[8.5pt] text-slate-900">{[inv.lab.phone, inv.lab.email].filter(Boolean).join(' • ')}</p>
          </div>
        </div>
        <p className="text-right text-[8pt] font-semibold uppercase tracking-wide text-slate-900">Keep this bill to collect your report</p>
      </header>

      <h1 className="my-2 text-center text-[14pt] font-bold tracking-wide">PATIENT BILL</h1>

      <section className="grid grid-cols-2 border border-slate-800">
        <div className="flex items-center gap-3 border-r border-slate-800 p-2">
          <span className="text-[11pt] font-bold">Patient No:</span>
          {p && <Barcode value={p.mrNumber} height={30} width={1.2} fontSize={11} />}
        </div>
        <div className="flex items-center justify-end gap-3 p-2">
          <span className="text-[11pt] font-bold">Lab No:</span>
          <Barcode value={inv.order.orderNumber} height={30} width={1.2} fontSize={11} />
        </div>
        <div className="border-r border-t border-slate-800 p-2">
          <Row k="Patient Name" v={p?.name} />
          <Row k="Father/Husband" v={p?.guardianName ? `${p.guardianName}${relation}` : ''} />
          <Row k="Age / Gender" v={p ? `${p.ageYears ?? '—'} years / ${titleCase(p.gender)}` : ''} />
          <Row k="Phone" v={p?.mobile} />
        </div>
        <div className="border-t border-slate-800 p-2">
          <Row k="Center" v={p?.centre ?? inv.lab.name} />
          <Row k="Advised by" v={inv.order.doctorName ?? 'SELF'} />
          <Row k="Registered at" v={inv.lab.name} />
          <Row k="Requested on" v={formatDateTime(inv.order.createdAt)} />
        </div>
      </section>

      <table className="mt-3 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-y-2 border-slate-800 text-left">
            <th className="w-10 py-1.5 pl-1">Sr #</th>
            <th className="py-1.5">Test Name</th>
            <th className="w-48 py-1.5">Report Date/Time</th>
            <th className="w-24 py-1.5 pr-1 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={`${l.testCode}-${i}`} className="border-b border-slate-200">
              <td className="py-1 pl-1 font-bold">{i + 1}</td>
              <td className="py-1 font-bold">{l.testName}</td>
              <td className="py-1 font-semibold">{l.reportDue ? formatDateTime(l.reportDue) : '—'}</td>
              <td className="py-1 pr-1 text-right font-semibold">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-3 grid grid-cols-[1fr_17rem] gap-6">
        <div className="flex flex-col justify-between">
          <p className="font-bold">Rupees: {amountInWords(toBePaid)}</p>
          <p className="mt-6 text-[9pt]"><span className="font-semibold">Enter By:</span> <span className="ml-2 font-bold uppercase">{inv.order.createdByName ?? ''}</span></p>
        </div>
        <dl className="text-[10pt] [&>div]:flex [&>div]:justify-between [&>div]:border-b [&>div]:border-slate-200 [&>div]:py-1">
          <div><dt className="font-bold">Total :</dt><dd className="font-bold">{money(b.subtotal + b.collectionFee)}</dd></div>
          <div><dt className="font-bold">Discount :</dt><dd>{b.discountAmount ? money(b.discountAmount) : ''}</dd></div>
          <div><dt className="font-bold">To be Paid :</dt><dd className="font-bold">{money(toBePaid)}</dd></div>
          <div><dt className="font-bold">Paid :</dt><dd className="font-bold">{money(paidNet)}</dd></div>
          <div className="!border-b-2 !border-slate-800"><dt className="font-bold">Balance :</dt><dd className="font-bold">{money(b.balance)}</dd></div>
        </dl>
      </section>

      <p className="mt-4 flex items-center gap-2 text-[9pt]"><span className="inline-grid size-4 place-items-center border border-slate-800 text-[8pt]">✓</span> I allow the staff for phlebotomy procedure for mentioned lab investigation(s).</p>

      <div className="mt-auto pt-4">
        <p className="text-[9pt] text-slate-900">Reports are released on or after the report date shown above. Please bring this bill (Patient No. / Lab No.) when collecting reports.</p>
        <p className="mt-2 border-t-2 border-slate-800 pt-1.5 text-center text-[9pt] font-bold">{[inv.lab.address || inv.lab.name, inv.lab.phone, inv.lab.email].filter(Boolean).join('    •    ')}</p>
      </div>
    </article>
  );
}
