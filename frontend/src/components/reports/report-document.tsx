import { QrCode } from '@/components/shared/codes';
import { LabLogoMark } from '@/components/shared/lab-logo';
import { FLAG_META } from '@/constants';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import type { Report } from '@/types';

/**
 * A4 clinical report rendered from the immutable server snapshot. Designed as a
 * print document (not dashboard UI): fixed typographic scale in pt, tables whose
 * header repeats across pages, rows that never split, and a status watermark.
 */
export function ReportDocument({ report, verifyBase }: { report: Report; verifyBase: string }) {
  const s = report.snapshot;
  const watermark = report.status === 'interim' || report.status === 'superseded';
  return (
    <article className="print-area relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-[10mm] text-[9.5pt] leading-snug text-slate-900 shadow-elevated sm:p-[14mm]">
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className={cn('-rotate-[30deg] select-none text-[64pt] font-black tracking-widest opacity-[0.07] sm:text-[88pt]', report.status === 'superseded' ? 'text-red-700' : 'text-slate-900')}>{report.status.toUpperCase()}</span>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0d7f8e] pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <LabLogoMark className="size-20 shrink-0" alt={s.lab.name} />
          <div className="min-w-0">
            <h1 className="font-display text-[15pt] font-bold tracking-wide text-[#0d7f8e]">{s.lab.name}</h1>
            <p className="text-[8.5pt] italic text-slate-500">{s.lab.tagline}</p>
            <p className="text-[8pt] text-slate-600">{[s.lab.address, s.lab.phone, s.lab.email].filter(Boolean).join(' • ')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11pt] font-semibold uppercase tracking-wider">Laboratory report</p>
          <p className={cn('mt-1 inline-block rounded px-2 py-0.5 text-[8pt] font-bold uppercase', report.status === 'final' ? 'bg-emerald-50 text-emerald-700' : report.status === 'amended' ? 'bg-sky-50 text-sky-700' : report.status === 'interim' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
            {report.status}
          </p>
        </div>
      </header>

      <section className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 text-[8.5pt] sm:grid-cols-3">
        {[
          ['Patient', s.patient.name],
          ['MR No.', s.patient.mrNumber],
          ['Age / Gender', `${s.patient.age ?? '—'} / ${titleCase(s.patient.gender)}`],
          ['Referred by', s.doctorName ?? 'Self'],
          ['Order No.', s.orderNumber],
          ['Report No.', `${report.reportNumber} (v${report.version})`],
          ['Sample(s)', s.samples.map((x) => `${x.sampleNumber} — ${x.sampleType}`).join(', ')],
          ['Collected', formatDateTime(s.samples[0]?.collectedAt)],
          ['Reported', formatDateTime(report.generatedAt)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <span className="block text-[7.5pt] uppercase tracking-wide text-slate-500">{k}</span>
            <span className="block break-words font-semibold">{v}</span>
          </div>
        ))}
      </section>

      <section className="mt-4 space-y-5">
        {[...s.tests].sort((a, b) => a.category.localeCompare(b.category)).map((t, i, all) => (
          <div key={t.resultId} className="print-avoid-break">
            {(i === 0 || all[i - 1].category !== t.category) && (
              <h2 className="mb-2 mt-1 border-b border-slate-800 pb-0.5 text-[11.5pt] font-bold uppercase tracking-wide">Department of {t.category}</h2>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
              <h3 className="text-[10.5pt] font-bold uppercase tracking-wide text-[#0d7f8e]">{t.testName}</h3>
              <span className="text-[7.5pt] text-slate-500">{t.category}{t.amended && <strong className="ml-2 text-sky-700">AMENDED</strong>}</span>
            </div>
            {t.status === 'pending' ? (
              <p className="py-2 text-[8.5pt] italic text-slate-500">Result pending — will be issued after verification.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="mt-1 w-full min-w-[150mm] border-collapse text-[8.8pt]">
                    <thead>
                      <tr className="text-left text-[7.5pt] uppercase tracking-wide text-slate-500">
                        <th className="w-[36%] py-1 font-semibold">Parameter</th>
                        <th className="w-[16%] py-1 font-semibold">Result</th>
                        <th className="w-[8%] py-1 font-semibold">Flag</th>
                        <th className="w-[14%] py-1 font-semibold">Unit</th>
                        <th className="py-1 font-semibold">Reference range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.values.map((v, i) => {
                        const abnormal = v.flag !== 'normal' && v.flag !== 'no_range';
                        return (
                          <tr key={`${v.parameterName}-${i}`} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
                            <td className="py-1 pr-2">{v.parameterName}</td>
                            <td className={cn('tabular py-1 pr-2', abnormal && 'font-bold', v.flag.includes('low') ? 'text-blue-700' : abnormal && 'text-red-700')}>{v.value}</td>
                            <td className={cn('py-1 font-bold', v.flag.includes('low') ? 'text-blue-700' : 'text-red-700')}>{FLAG_META[v.flag]?.short}</td>
                            <td className="py-1 pr-2 text-slate-600">{v.unit}</td>
                            <td className="py-1 text-slate-600">{v.range || <span className="italic text-slate-400">Not established</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {t.comment && <p className="mt-1 text-[8.3pt] italic text-slate-600">Comment: {t.comment}</p>}
                {t.amended && t.amendmentReason && <p className="mt-1 text-[8pt] text-sky-700">Amended — reason: {t.amendmentReason}</p>}
                <p className="mt-1 text-[7.5pt] text-slate-500">Verified by {t.approvedBy} · {formatDateTime(t.approvedAt)}</p>
              </>
            )}
          </div>
        ))}
      </section>

      <p className="mt-4 text-[7.5pt] text-slate-500">Flags: H = high, L = low, HH / LL = critical, A = abnormal. Values are interpreted against reference ranges approved by the laboratory.</p>

      <section className="print-avoid-break mt-10 grid grid-cols-2 gap-10 text-[8.5pt]">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 font-semibold">{s.technicians.join(', ') || '—'}</p>
          <p className="text-slate-500">Laboratory Technologist</p>
        </div>
        <div className="text-right">
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 font-semibold">{s.verifiedBy.join(', ') || '—'}</p>
          <p className="text-slate-500">Pathologist / Authorised Signatory</p>
        </div>
      </section>

      <footer className="print-avoid-break mt-8 flex items-end justify-between gap-4 border-t border-slate-200 pt-3 text-[7.5pt] text-slate-500">
        <div className="min-w-0">
          <p>{s.lab.reportFooter ?? 'This report relates only to the sample(s) received. Results should be interpreted by a qualified clinician in the clinical context.'}</p>
          <p className="mt-1">
            Verify authenticity: <span className="break-all font-mono">{verifyBase}/{report.verificationCode}</span>
          </p>
          <p>
            Verification code <strong className="font-mono">{report.verificationCode}</strong>
          </p>
        </div>
        <QrCode value={`${verifyBase}/${report.verificationCode}`} size={64} className="shrink-0" />
      </footer>
    </article>
  );
}
