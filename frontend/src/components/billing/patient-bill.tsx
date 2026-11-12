import * as React from 'react';
import { Barcode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { amountInWords } from '@/lib/amount-words';
import { formatDateTime, titleCase } from '@/lib/utils';
import type { billingService } from '@/services/admin.service';

export type InvoiceData = Awaited<ReturnType<typeof billingService.invoice>>;

const money = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n);

/** One "Label : value" line; every label column in a block has the same width so the colons line up. */
function Field({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap font-semibold">{k}</dt>
      <dd className="min-w-0 break-words font-bold">: {v || '—'}</dd>
    </>
  );
}

/** A4 patient bill: letterhead, patient & order details, tests table, totals and consent. */
export function PatientBill({ inv }: { inv: InvoiceData }) {
  const p = inv.patient;
  const b = inv.billing;
  const gross = b.subtotal + b.collectionFee;
  const paidNet = b.paid - b.refunded;
  const relation = p?.guardianRelation && p.guardianRelation !== 'other' ? ` (${titleCase(p.guardianRelation)})` : '';
  const receipts = inv.payments.filter((x) => x.type === 'payment');
  const contact = [inv.lab.address, inv.lab.phone && `Ph: ${inv.lab.phone}`, inv.lab.email].filter(Boolean);

  return (
    <article className="print-area print-doc mx-auto flex min-h-[273mm] w-full min-w-[180mm] max-w-[210mm] flex-col bg-white p-[10mm] text-[10pt] font-medium text-black shadow-elevated print:min-h-0 sm:p-[12mm]">
      {/* Letterhead */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b-2 border-slate-800 pb-3">
        <LabLogoMark className="size-24" alt={inv.lab.name} />
        <div className="min-w-0">
          <p className="text-[16pt] font-bold uppercase leading-tight tracking-wide">{inv.lab.name}</p>
          {inv.lab.tagline && <p className="text-[9.5pt] font-semibold italic">{inv.lab.tagline}</p>}
          {contact.length > 0 && <p className="mt-0.5 text-[9pt]">{contact.join('  •  ')}</p>}
        </div>
        <div className="text-right">
          <p className="text-[15pt] font-bold tracking-wide">PATIENT BILL</p>
          <p className="text-[9.5pt] font-semibold">Bill No: {inv.invoiceNumber}</p>
          <p className="text-[9pt]">{formatDateTime(inv.order.createdAt)}</p>
        </div>
      </header>

      {/* Barcodes */}
      <section className="mt-3 grid grid-cols-2 border border-slate-800">
        <div className="flex flex-col items-center justify-center gap-0.5 border-r border-slate-800 px-3 py-2">
          <span className="text-[9pt] font-bold uppercase tracking-wide">Patient No. (MR)</span>
          {p && <Barcode value={p.mrNumber} height={30} width={1.25} fontSize={11} />}
        </div>
        <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-2">
          <span className="text-[9pt] font-bold uppercase tracking-wide">Lab No.</span>
          <Barcode value={inv.order.orderNumber} height={30} width={1.25} fontSize={11} />
        </div>
      </section>

      {/* Patient and order details */}
      <section className="grid grid-cols-2 border-x border-b border-slate-800">
        <dl className="grid grid-cols-[30mm_1fr] content-start gap-x-2 gap-y-1 border-r border-slate-800 px-3 py-2.5">
          <Field k="Patient Name" v={p?.name} />
          <Field k="Father/Husband" v={p?.guardianName ? `${p.guardianName}${relation}` : undefined} />
          <Field k="Age / Gender" v={p ? `${p.ageYears ?? '—'} Years / ${titleCase(p.gender)}` : undefined} />
          <Field k="Phone" v={p?.mobile} />
        </dl>
        <dl className="grid grid-cols-[30mm_1fr] content-start gap-x-2 gap-y-1 px-3 py-2.5">
          <Field k="Referred By" v={inv.order.doctorName ?? 'Self'} />
          <Field k="Collection Centre" v={p?.centre ?? 'Main Laboratory'} />
          <Field k="Registered On" v={formatDateTime(inv.order.createdAt)} />
          <Field k="Registered By" v={inv.order.createdByName} />
        </dl>
      </section>

      {/* Tests */}
      <table className="mt-4 w-full border-collapse text-[10pt]">
        <colgroup>
          <col className="w-[12mm]" />
          <col />
          <col className="w-[46mm]" />
          <col className="w-[32mm]" />
        </colgroup>
        <thead>
          <tr className="border-y-2 border-slate-800 bg-slate-100 text-[9.5pt] uppercase tracking-wide">
            <th className="px-2 py-1.5 text-center font-bold">Sr.</th>
            <th className="px-2 py-1.5 text-left font-bold">Test Name</th>
            <th className="px-2 py-1.5 text-left font-bold">Report Date / Time</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">Amount (Rs)</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={`${l.testCode}-${i}`} className="border-b border-slate-300 align-top">
              <td className="px-2 py-1.5 text-center">{i + 1}</td>
              <td className="px-2 py-1.5 font-bold">{l.testName}</td>
              <td className="px-2 py-1.5">{l.reportDue ? formatDateTime(l.reportDue) : '—'}</td>
              <td className="tabular px-2 py-1.5 text-right font-semibold">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Amount in words + totals */}
      <section className="mt-4 grid grid-cols-[1fr_72mm] items-start gap-6">
        <div className="space-y-2 pt-1 text-[9.5pt]">
          <p><span className="font-semibold">Amount in words:</span> <span className="font-bold">Rupees {amountInWords(b.total)}</span></p>
          {receipts.length > 0 && (
            <p><span className="font-semibold">Payment:</span> {receipts.map((x) => `${titleCase(x.method)} Rs ${money(x.amount)} (${x.receiptNumber})`).join(', ')}</p>
          )}
        </div>
        <table className="w-full border-collapse border border-slate-800 text-[10pt]">
          <tbody className="[&_td]:px-3 [&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-slate-300">
            <tr><td className="font-semibold">Total</td><td className="tabular text-right font-semibold">{money(gross)}</td></tr>
            <tr><td className="font-semibold">Discount</td><td className="tabular text-right font-semibold">{b.discountAmount ? `− ${money(b.discountAmount)}` : '0'}</td></tr>
            <tr className="bg-slate-100"><td className="font-bold">Net Payable</td><td className="tabular text-right font-bold">{money(b.total)}</td></tr>
            <tr><td className="font-semibold">Paid</td><td className="tabular text-right font-semibold">{money(paidNet)}</td></tr>
            <tr className="!border-b-0 border-t-2 !border-t-slate-800"><td className="text-[11pt] font-bold">Balance</td><td className="tabular text-right text-[11pt] font-bold">{money(b.balance)}</td></tr>
          </tbody>
        </table>
      </section>

      <p className="mt-5 flex items-center gap-2 text-[9.5pt]">
        <span className="inline-grid size-4 shrink-0 place-items-center border border-slate-800 text-[8pt]">✓</span>
        I allow the staff to collect sample(s) for the laboratory investigation(s) mentioned above.
      </p>

      {/* Footer */}
      <footer className="mt-auto pt-6 print:mt-6">
        <p className="text-center text-[9pt] font-semibold">Keep this bill to collect your report. Reports are released on or after the report date shown above.</p>
        <p className="mt-1.5 border-t-2 border-slate-800 pt-1.5 text-center text-[9pt] font-bold">{[inv.lab.name, ...contact].join('    •    ')}</p>
      </footer>
    </article>
  );
}
