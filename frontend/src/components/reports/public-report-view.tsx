'use client';

import { BadgeCheck, Clock, Download, Printer, ShieldX, TriangleAlert, Wallet } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ReportDocument } from '@/components/reports/report-document';
import { BrandLoader } from '@/components/shared/brand-loader';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import type { PublicReportResult } from '@/services/lab.service';
import type { Report } from '@/types';

/** A plain card for the cases where the report itself is not shown. */
function Notice({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto mb-3 grid size-14 place-items-center rounded-full ${tone}`}>{icon}</div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}

/**
 * Opened by scanning a QR code (on the report or on the bill). Shows the whole report with
 * a download button — but only when the bill is fully paid (checked on the server).
 */
export function PublicReportView({ load, pdf }: { load: () => Promise<PublicReportResult>; pdf: () => Promise<Blob> }) {
  const state = useApi(load, []);
  const verifyBase = typeof window !== 'undefined' ? `${window.location.origin}/verify` : '/verify';
  // On a phone the A4 report (210 mm ≈ 794 px) is shrunk to the screen width so it reads like a page.
  const [zoom, setZoom] = React.useState(1);
  React.useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 24) / 794));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const download = async () => {
    try {
      const blob = await pdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.data?.reportNumber ?? 'report'}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (state.error)
    return (
      <Notice icon={<TriangleAlert className="size-7" />} tone="bg-amber-100 text-amber-700" title="Could not open the report">
        <p>{errorMessage(state.error)}</p>
        <Button className="mt-2" variant="outline" onClick={() => void state.reload()}>Try again</Button>
      </Notice>
    );
  if (!state.data) return <BrandLoader className="bg-white" label="Opening report…" />;
  const r = state.data;

  if (r.valid && r.access === 'not_ready')
    return (
      <Notice icon={<Clock className="size-7" />} tone="bg-sky-100 text-sky-700" title="Report not ready yet">
        <p className="flex items-center justify-center gap-1.5 font-medium text-emerald-700"><BadgeCheck className="size-4" /> Your bill {r.orderNumber} is registered with {r.laboratory}.</p>
        <p>Your report is still being prepared. Please scan this code again later. Reports are shown once the bill is fully paid.</p>
      </Notice>
    );

  if (!r.valid)
    return (
      <Notice icon={<ShieldX className="size-7" />} tone="bg-red-100 text-red-700" title="Report not found">
        <p>No report or bill matches this QR code. The document may not be genuine — please contact the laboratory.</p>
      </Notice>
    );

  const facts = (
    <p className="text-xs text-slate-500">
      Report {r.reportNumber} · {r.patientInitials} · {formatDateTime(r.generatedAt)}
    </p>
  );

  if (r.access === 'payment_pending')
    return (
      <Notice icon={<Wallet className="size-7" />} tone="bg-amber-100 text-amber-700" title="Payment pending">
        <p className="flex items-center justify-center gap-1.5 font-medium text-emerald-700"><BadgeCheck className="size-4" /> This is a genuine report of {r.laboratory}.</p>
        <p>Your report is ready, but a balance is still due on your bill. Please clear the payment at the laboratory to view and download the report.</p>
        {facts}
      </Notice>
    );

  if (r.access === 'superseded')
    return (
      <Notice icon={<TriangleAlert className="size-7" />} tone="bg-amber-100 text-amber-700" title="Report replaced">
        <p>This report was genuine but has been replaced by a corrected version. Please get the new report from the laboratory.</p>
        {facts}
      </Notice>
    );

  if (r.access !== 'released' || !r.report)
    return (
      <Notice icon={<TriangleAlert className="size-7" />} tone="bg-amber-100 text-amber-700" title="Report not available">
        <p>This report cannot be shown online. Please contact the laboratory.</p>
        {facts}
      </Notice>
    );

  const report = { ...r.report, orderId: '', patientId: '', generatedBy: { uid: '', name: '', role: 'system' }, printCount: 0 } as Report;
  return (
    <div className="mx-auto max-w-[230mm] px-3 py-4 print:max-w-none print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><BadgeCheck className="size-4" /> Genuine report of {r.laboratory}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void download()}><Download /> Download PDF</Button>
          <Button variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>
      <div style={{ zoom }} className="print:![zoom:1]">
        <ReportDocument report={report} verifyBase={verifyBase} />
      </div>
    </div>
  );
}
