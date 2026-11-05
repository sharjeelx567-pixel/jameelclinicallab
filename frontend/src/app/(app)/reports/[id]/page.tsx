'use client';

import { AlertTriangle, ArrowLeft, Download, History, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ReportDocument } from '@/components/reports/report-document';
import { ErrorState, LoadingRows } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { REPORT_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { settingsService } from '@/services/admin.service';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/utils';
import { reportsService } from '@/services/lab.service';

export default function ReportPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => reportsService.get(id), [id]);
  const letterhead = useApi(() => settingsService.reference(), []);
  const [downloading, setDownloading] = React.useState(false);
  const [showPrints, setShowPrints] = React.useState(false);
  const prints = useApi(showPrints ? () => reportsService.prints(id) : null, [showPrints, id]);
  const verifyBase = typeof window !== 'undefined' ? `${window.location.origin}/verify` : '/verify';

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={10} />;
  const r = state.data;

  // Prints on the separate print page (report only, with logo); that page records the print.
  const browserPrint = async () => {
    window.open(`/print/report/${r.id}?auto=1`, '_blank', 'noopener');
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const blob = await reportsService.pdf(r.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.reportNumber}-v${r.version}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      void state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`/orders/${r.orderId}`} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Order</Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">{r.reportNumber} <span className="text-base font-normal text-muted-foreground">v{r.version}</span> <StatusBadge map={REPORT_STATUS} value={r.status} /></h1>
          <p className="text-sm text-muted-foreground">Generated {formatDateTime(r.generatedAt)} by {r.generatedBy.name} · printed {r.printCount}×</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setShowPrints(true)}><History /> Print history</Button>
          {can('reports.print') && r.status !== 'superseded' && (
            <>
              <Button variant="outline" onClick={() => void browserPrint()}><Printer /> Print</Button>
              <Button loading={downloading} onClick={() => void downloadPdf()}><Download /> Download PDF</Button>
            </>
          )}
        </div>
      </div>

      {r.status === 'superseded' && (
        <div role="alert" className="no-print mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          <p>This report has been superseded by an amendment. It is kept for the record and cannot be printed. Open the order to view or generate the current report.</p>
        </div>
      )}
      {r.status === 'interim' && (
        <p className="no-print mb-4 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">Interim report — some tests are still pending verification and are marked as pending.</p>
      )}

      <div className="-mx-4 overflow-x-auto bg-muted/40 px-4 py-6 sm:mx-0 sm:rounded-xl print:m-0 print:bg-transparent print:p-0">
        <ReportDocument report={r} verifyBase={verifyBase} current={letterhead.data ? { signatories: letterhead.data.reportSignatories, phone: letterhead.data.phone, address: letterhead.data.address } : undefined} />
      </div>

      <Dialog open={showPrints} onOpenChange={setShowPrints}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Print & download history</DialogTitle></DialogHeader>
          <DialogBody>
            {!prints.data ? (
              <LoadingRows rows={3} />
            ) : !prints.data.length ? (
              <p className="text-sm text-muted-foreground">Not printed yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {prints.data.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-2">
                    <span>Copy {p.copy} · {titleCase(p.channel)}</span>
                    <span className="text-muted-foreground">{p.by.name} · {formatDateTime(p.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
