'use client';

import { ArrowLeft, Download, Printer, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ReportDocument } from '@/components/reports/report-document';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { reportsService } from '@/services/lab.service';

const waitForImages = () =>
  Promise.race([
    Promise.all(Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; })))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

/** Report on its own page: just the A4 document with logo. ?auto=1 prints as soon as it has loaded. Every print is recorded. */
export default function PrintReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const params = useSearchParams();
  const state = useApi(() => reportsService.get(reportId), [reportId]);
  const started = React.useRef(false);
  const { user } = useAuth();
  const verifyBase = typeof window !== 'undefined' ? `${window.location.origin}/verify` : '/verify';

  const print = React.useCallback(async () => {
    try {
      await reportsService.recordBrowserPrint(reportId); // print history (who / when / copy number)
    } catch (err) {
      return toast.error(errorMessage(err));
    }
    await waitForImages();
    window.print();
  }, [reportId]);

  React.useEffect(() => {
    if (!state.data || params.get('auto') !== '1' || started.current) return;
    started.current = true;
    const t = setTimeout(() => void print(), 200);
    return () => clearTimeout(t);
  }, [state.data, params, print]);

  React.useEffect(() => {
    if (state.data) document.title = `Report ${state.data.reportNumber} — ${state.data.snapshot.patient.name}`;
  }, [state.data]);

  const download = async () => {
    try {
      const blob = await reportsService.pdf(reportId);
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

  return (
    <div className="mx-auto max-w-[230mm] px-3 py-4 print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={state.data ? `/reports/${reportId}` : '/reports'} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" /> Back</Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50" onClick={() => void download()} disabled={!state.data}><Download /> Download PDF</Button>
          <Button onClick={() => void print()} disabled={!state.data}><Printer /> Print report</Button>
        </div>
      </div>
      {state.error ? (
        <div className="no-print rounded-xl border border-red-200 bg-white p-6 text-center text-sm">
          <p className="font-semibold text-red-700">The report could not be loaded.</p>
          <p className="mt-1 text-slate-600">{errorMessage(state.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void state.reload()}><RefreshCw /> Try again</Button>
        </div>
      ) : !state.data ? (
        <div className="mx-auto h-[270mm] max-w-[210mm] animate-pulse rounded bg-white" aria-busy />
      ) : (
        <ReportDocument report={state.data} verifyBase={verifyBase} printedBy={user?.displayName} />
      )}
    </div>
  );
}
