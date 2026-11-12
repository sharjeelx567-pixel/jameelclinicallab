import type { ReactNode } from 'react';
import { Barcode, QrCode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { FLAG_META } from '@/constants';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import type { Report, ReportSignatory } from '@/types';

/** Parameter names as written; a name typed in ALL CAPITALS is shown as "Each Word Capitalised". */
const niceName = (s: string) => (s.length > 3 && s === s.toUpperCase() && /[A-Z]/.test(s) ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()) : s);

const DEFAULT_PROVISO =
  'This report relates only to the sample(s) received. Results should be interpreted by a qualified clinician in the clinical context.';

/**
 * A4 clinical report rendered from the immutable server snapshot, in the classic
 * Pakistani laboratory layout: letterhead, two-column patient block, department
 * band, TEST NAME / RESULT / UNITS / NORMAL VALUE table, and a footer pinned to
 * the bottom with staff names, proviso and print details.
 */
export function ReportDocument({
  report,
  verifyBase,
  printedBy,
  current,
}: {
  report: Report;
  verifyBase: string;
  printedBy?: string;
  /** Current letterhead settings — used when the report was generated before they were set. */
  current?: { signatories?: ReportSignatory[]; phone?: string; address?: string };
}) {
  const s = { ...report.snapshot, lab: { ...report.snapshot.lab, phone: report.snapshot.lab.phone || current?.phone || '', address: report.snapshot.lab.address || current?.address || '' } };
  const watermark = report.status === 'interim' || report.status === 'superseded';
  const tests = [...s.tests].sort((a, b) => a.category.localeCompare(b.category));
  // Footer names: as set in Settings; otherwise the people on record (approver, then the technologist who entered results).
  const staff: Array<{ name: string; qualification?: string }> = s.lab.signatories?.length
    ? s.lab.signatories
    : current?.signatories?.length
      ? current.signatories
      : [...new Set([...s.verifiedBy, ...s.technicians])].filter(Boolean).map((name) => ({ name }));
  if (!staff.length) staff.push({ name: '—' });
  const Row = ({ k, v }: { k: string; v?: ReactNode }) => (
    <div className="grid grid-cols-[7.8rem_1fr] gap-1 py-[1px]">
      <span className="text-slate-900">{k}</span>
      <span className="font-bold">:- {v || '—'}</span>
    </div>
  );

  return (
    <article className="print-area print-doc relative mx-auto flex min-h-[273mm] w-full max-w-[210mm] flex-col overflow-hidden bg-white p-[10mm] text-[10pt] font-medium leading-snug text-black shadow-elevated print:min-h-[245mm] print:overflow-visible sm:p-[12mm]">
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className={cn('-rotate-[30deg] select-none text-[64pt] font-black tracking-widest opacity-[0.07] sm:text-[88pt]', report.status === 'superseded' ? 'text-red-700' : 'text-slate-900')}>{report.status.toUpperCase()}</span>
        </div>
      )}

      {/* Letterhead */}
      <header className="flex items-center gap-4">
        <LabLogoMark className="size-24 shrink-0" alt={s.lab.name} />
        <div className="min-w-0 flex-1 text-center">
          <h1 className="font-serif text-[22pt] font-bold uppercase leading-tight tracking-wide text-slate-900">{s.lab.name}</h1>
          {s.lab.tagline && <p className="text-[11pt] font-bold text-[#15803d] print:text-black">{s.lab.tagline}</p>}
          {(s.lab.address || s.lab.phone) && <p className="text-[9.5pt] font-semibold">{[s.lab.address, s.lab.phone && `Ph# ${s.lab.phone}`].filter(Boolean).join('. ')}</p>}
        </div>
      </header>
      <p className="mt-1 border-b-2 border-slate-800 pb-1 text-center font-serif text-[11.5pt] font-bold uppercase tracking-wide">
        Clinical Laboratory Report
        {(report.status === 'interim' || report.status === 'superseded') && <span className="ml-2 align-middle text-[8pt] font-bold text-amber-700">({report.status})</span>}
      </p>

      {/* Patient block */}
      <section className="grid grid-cols-2 gap-6 border-b-2 border-slate-800 py-2 text-[10pt]">
        <div>
          <Row k="Patient Name" v={s.patient.name} />
          {s.patient.guardian && <Row k="Father/Husband" v={s.patient.guardian} />}
          <Row k="Address" v={s.patient.address} />
          <Row k="Age & Gender" v={`${s.patient.age ?? '—'} ${titleCase(s.patient.gender)}`} />
          <Row k="MR No." v={s.patient.mrNumber} />
          <Row k="Referred By" v={s.doctorName ?? 'Self'} />
        </div>
        <div className="flex flex-col">
          <Row k="Lab No. #" v={s.orderNumber} />
          <Row k="Sample Date & Time" v={formatDateTime(s.samples[0]?.collectedAt ?? s.registeredAt)} />
          <Row k="Report Date & Time" v={formatDateTime(report.generatedAt)} />
          <div className="mt-1 flex items-end justify-end gap-3">
            <Barcode value={s.orderNumber} height={26} width={1.1} displayValue={false} />
            <QrCode value={`${verifyBase}/${report.verificationCode}`} size={46} />
          </div>
        </div>
      </section>

      {/* Results, grouped by department */}
      <section className="mt-2 space-y-3">
        {tests.map((t, i) => (
          <div key={t.resultId} className="print-avoid-break">
            {(i === 0 || tests[i - 1].category !== t.category) && (
              <>
                <h2 className="mt-1 text-center font-serif text-[12pt] font-bold uppercase tracking-wide">{t.category}</h2>
                <div className="grid grid-cols-[40%_18%_17%_25%] border-y-2 border-slate-800 bg-slate-200 px-3 py-1 text-[9.5pt] font-bold uppercase">
                  <span>Test Name</span><span>Result</span><span>Units</span><span>Normal Value</span>
                </div>
              </>
            )}
            <div className="mt-1 border-b border-slate-300 bg-slate-100 px-3 py-[2px] text-[10pt] font-bold uppercase">
              {t.testName}
            </div>
            {t.status === 'pending' ? (
              <p className="px-3 py-1 text-[8.5pt] italic text-slate-800">Result pending — will be issued after verification.</p>
            ) : (
              <>
                {t.values.map((v, j) => {
                  const abnormal = v.flag !== 'normal' && v.flag !== 'no_range';
                  const low = v.flag.includes('low');
                  return (
                    <div key={`${v.parameterName}-${j}`} className="grid grid-cols-[40%_18%_17%_25%] border-b border-slate-200 px-3 py-[3px] text-[10pt] last:border-b-0">
                      <span className="text-[9.5pt]">{niceName(v.parameterName === 'Result' ? t.testName : v.parameterName)}</span>
                      <span className={cn('tabular font-semibold', abnormal && 'font-bold', abnormal && (low ? 'text-blue-700' : 'text-red-700'))}>
                        {v.value}
                        {abnormal && <span className="ml-1.5 text-[8.5pt]">{FLAG_META[v.flag]?.short}</span>}
                      </span>
                      <span>{v.unit}</span>
                      <span className="whitespace-pre-line">{v.range || <span className="italic text-slate-800">—</span>}</span>
                    </div>
                  );
                })}
                {t.comment && <p className="px-3 pt-0.5 text-[9pt] italic text-slate-900">Comment: {t.comment}</p>}
              </>
            )}
          </div>
        ))}
      </section>

      {/* Footer pinned to the bottom of the page */}
      <footer className="print-avoid-break mt-auto pt-6 text-[9pt]">
        <p className="border-b-2 border-slate-800 pb-0.5 text-center text-[9pt] font-semibold">Electronically verified, no signature(s) required.</p>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 py-1.5">
          {staff.map((p) => (
            <div key={p.name} className="min-w-0 first:text-left last:text-right [&:not(:first-child):not(:last-child)]:text-center">
              <p className="text-[9.5pt] font-bold">{p.name}</p>
              {'qualification' in p && p.qualification && <p className="text-[8.5pt]">{p.qualification}</p>}
            </div>
          ))}
        </div>
        <p className="border-t-2 border-slate-800 pt-1 text-[8.5pt]"><strong>Proviso:</strong> {s.lab.reportFooter || DEFAULT_PROVISO}</p>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[8.5pt] text-slate-900">
          <span>Print Date &amp; Time: {formatDateTime(new Date().toISOString())}</span>
          <span>Report No. {report.reportNumber}{s.lab.phone ? ` · For any query please contact: ${s.lab.phone}` : ` · Thank you for choosing ${s.lab.name}`}</span>
          {printedBy && <span>Printed By:- {printedBy}</span>}
        </div>
      </footer>
    </article>
  );
}
