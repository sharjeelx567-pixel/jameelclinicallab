'use client';

import { AlertTriangle, Ban, FileCheck2, FileText, FlaskConical, Printer, Receipt, RotateCcw, Tags, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { OrderReceipt, SampleLabels } from '@/components/laboratory/print-templates';
import { SampleActions } from '@/components/laboratory/sample-actions';
import { Barcode } from '@/components/shared/codes';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { PaymentDialog } from '@/components/shared/payment-dialog';
import { DetailList, ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ORDER_STATUS, PRIORITY, REPORT_STATUS, RESULT_STATUS, SAMPLE_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, formatMoney, titleCase } from '@/lib/utils';
import { settingsService } from '@/services/admin.service';
import { ordersService, reportsService, samplesService } from '@/services/lab.service';

type PrintMode = 'receipt' | 'labels' | null;

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => ordersService.detail(id), [id]);
  const ref = useApi(() => settingsService.reference(), []);
  const [printMode, setPrintMode] = React.useState<PrintMode>(null);
  const [payMode, setPayMode] = React.useState<'payment' | 'refund' | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const print = (mode: Exclude<PrintMode, null>) => {
    flushSync(() => setPrintMode(mode));
    window.print();
    setPrintMode(null);
  };

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const { order: o, patient, samples, results, payments, reports } = state.data;
  const cancelled = o.status === 'cancelled';
  const approvedCount = results.filter((r) => r.status === 'approved').length;
  const currentReport = reports.find((r) => r.status !== 'superseded');
  const netPaid = o.billing.paid - o.billing.refunded;
  const liveSamples = samples.filter((s) => s.status !== 'rejected');

  const printLabels = async () => {
    print('labels');
    await Promise.all(liveSamples.map((s) => samplesService.labelPrinted(s.id).catch(() => undefined)));
  };

  return (
    <div>
      <div className="hidden print:block">
        {printMode === 'receipt' && <OrderReceipt order={o} payments={payments} patient={patient} />}
        {printMode === 'labels' && <SampleLabels samples={liveSamples} order={o} widthMm={ref.data?.barcode.labelWidthMm} heightMm={ref.data?.barcode.labelHeightMm} />}
      </div>

      <div className="no-print">
        <PageHeader
          title={o.orderNumber}
          badge={<><StatusBadge map={ORDER_STATUS} value={o.status} /><StatusBadge map={PRIORITY} value={o.priority} /></>}
          description={
            <span>
              <Link href={`/patients/${o.patientId}`} className="font-medium text-foreground hover:text-primary">{o.patientName}</Link> · {o.patientMrNumber}
              {patient && ` · ${patient.ageYears ?? '—'}Y ${titleCase(patient.gender)}`} · {formatDateTime(o.createdAt)}
            </span>
          }
          actions={
            <>
              <Button variant="outline" onClick={() => print('receipt')}><Printer /> Receipt</Button>
              {can('samples.read') && liveSamples.length > 0 && <Button variant="outline" onClick={() => void printLabels()}><Tags /> Labels</Button>}
              {can('billing.collect') && !cancelled && o.billing.balance > 0 && <Button onClick={() => setPayMode('payment')}><Wallet /> Record payment</Button>}
              {can('orders.cancel') && !cancelled && o.status !== 'completed' && <Button variant="ghost" onClick={() => setCancelling(true)}><Ban /> Cancel</Button>}
            </>
          }
        />

        {o.cancellation && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Cancelled {formatDateTime(o.cancellation.at)} by {o.cancellation.by.name}</p>
              <p className="text-muted-foreground">{o.cancellation.reason}</p>
              {netPaid > 0 && <p className="mt-1 font-medium">Refund due: {formatMoney(netPaid)} — record it under Billing.</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="min-w-0 space-y-6 xl:col-span-2">
            <Card>
              <CardHeader><CardTitle>Samples</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {samples.map((s) => (
                  <div key={s.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="hidden overflow-hidden sm:block"><Barcode value={s.sampleNumber} height={26} width={1.1} fontSize={9} /></div>
                      <div className="min-w-0">
                        <p className="font-medium">{s.sampleType}{s.containerType && <span className="text-sm font-normal text-muted-foreground"> · {s.containerType}</span>}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.sampleNumber} · {o.items.filter((i) => s.testIds.includes(i.testId)).map((i) => i.testCode).join(', ')}
                          {s.collectedAt && ` · collected ${formatDateTime(s.collectedAt)} by ${s.collectedBy?.name}`}
                        </p>
                        {s.rejectionReason && <p className="text-xs text-destructive">Rejected: {s.rejectionReason}</p>}
                        {s.condition && s.condition !== 'Good' && <p className="text-xs text-warning">Condition: {s.condition}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge map={SAMPLE_STATUS} value={s.status} />
                      {!cancelled && <SampleActions sample={s} onChanged={state.reload} />}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <span className="text-sm text-muted-foreground">{approvedCount}/{results.length} verified</span>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {results.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{r.testName} <span className="text-xs text-muted-foreground">{r.testCode}{r.version > 1 && ` · v${r.version}`}</span></p>
                        {r.hasCritical && <Badge tone="danger" className="mt-1"><AlertTriangle className="size-3" /> Critical value</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge map={RESULT_STATUS} value={r.status} />
                        {can('results.enter') && ['pending', 'draft', 'correction_requested', 'rejected'].includes(r.status) && !cancelled && (
                          <Button asChild size="sm" variant="outline"><Link href={`/results/${r.id}`}><FlaskConical /> Enter</Link></Button>
                        )}
                        {can('results.approve') && r.status === 'submitted' && (
                          <Button asChild size="sm"><Link href={`/verification?result=${r.id}`}>Verify</Link></Button>
                        )}
                        {r.status === 'approved' && can('results.read') && (
                          <Button asChild size="sm" variant="ghost"><Link href={`/results/${r.id}`}>View</Link></Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reports</CardTitle>
                {can('reports.generate') && approvedCount > 0 && !cancelled && (!currentReport || currentReport.status === 'interim') && (
                  <Button
                    size="sm"
                    loading={generating}
                    onClick={async () => {
                      setGenerating(true);
                      try {
                        const r = await reportsService.generate(o.id);
                        toast.success(`${titleCase(r.status)} report ${r.reportNumber} generated`);
                        void state.reload();
                      } catch (err) {
                        toast.error(errorMessage(err));
                      } finally {
                        setGenerating(false);
                      }
                    }}
                  >
                    <FileCheck2 /> {approvedCount < results.length ? 'Generate interim report' : 'Generate final report'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!reports.length ? (
                  <p className="text-sm text-muted-foreground">{approvedCount ? 'Verified results are ready to report.' : 'Reports can be generated after at least one result is verified.'}</p>
                ) : (
                  <ul className="divide-y">
                    {reports.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <p className="font-medium">{r.reportNumber} · v{r.version}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(r.generatedAt)} by {r.generatedBy.name} · printed {r.printCount}×</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge map={REPORT_STATUS} value={r.status} />
                          <Button asChild size="sm" variant="outline"><Link href={`/reports/${r.id}`}><FileText /> Open</Link></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                {can('billing.read') && <Button asChild variant="ghost" size="sm"><Link href={`/billing/invoice/${o.id}`}><Receipt /> Invoice</Link></Button>}
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{formatMoney(o.billing.subtotal)}</span></div>
                {o.billing.collectionFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Collection fee</span><span className="tabular">{formatMoney(o.billing.collectionFee)}</span></div>}
                {o.billing.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount <span className="text-xs">({o.billing.discountReason})</span></span><span className="tabular">−{formatMoney(o.billing.discountAmount)}</span></div>}
                <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular">{formatMoney(o.billing.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid (net)</span><span className="tabular">{formatMoney(netPaid)}</span></div>
                <div className="flex justify-between text-base font-semibold"><span>Balance</span><span className={`tabular ${o.billing.balance > 0 ? 'text-destructive' : 'text-success'}`}>{formatMoney(o.billing.balance)}</span></div>
                {payments.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t pt-3 text-xs">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="min-w-0 break-words">{p.receiptNumber} · {titleCase(p.method)} · {formatDateTime(p.recordedAt)}</span>
                        <span className={`tabular ${p.type === 'refund' ? 'text-destructive' : ''}`}>{p.type === 'refund' ? '−' : ''}{formatMoney(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {can('billing.refund') && netPaid > 0 && (
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setPayMode('refund')}><RotateCcw /> Record refund</Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent>
                <DetailList className="sm:grid-cols-1" items={[['Referring doctor', o.doctorName ?? 'Self'], ['Clinical notes', o.clinicalNotes], ['Created by', o.createdBy.name]]} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
              <CardContent>
                <ol className="relative space-y-3 border-l pl-5">
                  {[...o.statusHistory].reverse().map((h, i) => (
                    <li key={`${h.at}-${i}`} className="relative">
                      <span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                      <p className="text-sm font-medium">{ORDER_STATUS[h.status]?.label ?? h.status}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(h.at)} · {h.by.name}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {payMode && (
        <PaymentDialog open onOpenChange={(v) => !v && setPayMode(null)} orderId={o.id} orderNumber={o.orderNumber} mode={payMode} limit={payMode === 'payment' ? o.billing.balance : netPaid} onDone={state.reload} />
      )}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this order?"
        description="Samples and results will no longer be processed. Orders with verified results cannot be cancelled. Any money received must be refunded separately."
        destructive
        confirmLabel="Cancel order"
        reasonLabel="Cancellation reason"
        onConfirm={async (reason) => {
          try {
            await ordersService.cancel(o.id, reason);
            toast.success('Order cancelled');
            void state.reload();
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}
