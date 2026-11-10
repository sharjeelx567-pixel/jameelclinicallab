'use client';

import { AlertTriangle, CheckCircle2, ClipboardCheck, Cpu, RotateCcw, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { NormalValueButton } from '@/components/laboratory/normal-value-dialog';
import { ResultContext } from '@/components/laboratory/result-context';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { FlagBadge, SourceBadge, StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form-controls';
import { PRIORITY } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { rangeText } from '@/lib/flags';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { resultsService } from '@/services/lab.service';

function Reviewer({ id, onDone }: { id: string; onDone: () => void }) {
  const { user } = useAuth();
  const state = useApi(() => resultsService.workspace(id), [id]);
  const [comment, setComment] = React.useState('');
  const [rejectKind, setRejectKind] = React.useState<'correction_requested' | 'rejected' | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={6} />;
  const ws = state.data;
  const r = ws.result;
  const self = r.enteredBy?.uid === user?.uid;

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setPending(true);
    try {
      await fn();
      toast.success(msg);
      setRejectKind(null);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_340px]">
      <Card className={cn('min-w-0', r.hasCritical && 'border-destructive/40')}>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>{ws.test.name} <span className="text-sm font-normal text-muted-foreground">{ws.test.code}{r.version > 1 && ` · amendment v${r.version}`}</span></CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{ws.patient.name} · {ws.patient.mrNumber} · {ws.order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">Entered by {r.enteredBy?.name} · submitted {formatDateTime(r.submittedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.hasCritical && <Badge tone="danger"><AlertTriangle className="size-3" /> Critical</Badge>}
            {r.hasAnalyzerValues && <Badge tone="info"><Cpu className="size-3" /> Analyzer-imported</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {r.amendment && <p className="mb-3 rounded-lg bg-info-soft p-3 text-sm">Amendment reason: {r.amendment.reason}</p>}
          <div className="scrollbar-thin overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Parameter</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Range</th><th className="px-3 py-2">Flag</th><th className="px-3 py-2">Source</th></tr>
              </thead>
              <tbody className="divide-y">
                {r.values.map((v) => (
                  <tr key={v.parameterId} className={cn(v.flag.startsWith('critical') && 'bg-destructive-soft/60')}>
                    <td className="px-3 py-2 font-medium">{v.parameterName}</td>
                    <td className={cn('tabular px-3 py-2', v.flag !== 'normal' && v.flag !== 'no_range' && 'font-semibold')}>{v.value} {v.unit}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="whitespace-pre-line">{rangeText(v.referenceRange, v.unit) || 'Not set'}</span>
                      {(() => {
                        const p = ws.parameters.find((x) => x.id === v.parameterId);
                        return p && <NormalValueButton className="-ml-1.5 mt-0.5 flex" testId={ws.test.id} param={p} onSaved={state.reload} />;
                      })()}
                    </td>
                    <td className="px-3 py-2"><FlagBadge flag={v.flag} /></td>
                    <td className="px-3 py-2"><SourceBadge source={v.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.technicianComment && <p className="mt-3 rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Technician comment:</span> {r.technicianComment}</p>}
          <Field label="Authorised comment (printed on report)" htmlFor="approver-comment" className="mt-4">
            <Textarea id="approver-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          </Field>
          {self && <p role="alert" className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">You entered this result. Independent verification by another approver is required.</p>}
        </CardContent>
        <CardFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => setRejectKind('correction_requested')} disabled={pending}><RotateCcw /> Request correction</Button>
          <Button variant="outline" onClick={() => setRejectKind('rejected')} disabled={pending} className="text-destructive"><XCircle /> Reject (re-test)</Button>
          <Button variant="success" loading={pending} disabled={self} onClick={() => void act(() => resultsService.approve(id, comment.trim() || undefined), `${ws.test.code} approved`)}>
            <CheckCircle2 /> Approve
          </Button>
        </CardFooter>
      </Card>
      <ResultContext ws={ws} />

      <Dialog open={!!rejectKind} onOpenChange={(o) => !o && setRejectKind(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{rejectKind === 'rejected' ? 'Reject result — re-test required' : 'Request correction'}</DialogTitle>
            <DialogDescription>The result returns to the technician with your reason.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason" htmlFor="rej-reason" required><Textarea id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectKind(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3} loading={pending} onClick={() => rejectKind && void act(() => resultsService.reject(id, reason.trim(), rejectKind), 'Result returned to technician')}>Send back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VerificationQueue() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('result');
  const queue = useApi(() => resultsService.list({ status: 'submitted', limit: 100 }), [], { refreshMs: 30_000 });
  const items = (queue.data?.items ?? []).sort((a, b) => Number(b.hasCritical) - Number(a.hasCritical) || (b.priority === 'stat' ? 1 : 0) - (a.priority === 'stat' ? 1 : 0));
  const select = (id: string | null) => router.replace(id ? `/verification?result=${id}` : '/verification', { scroll: false });

  return (
    <div>
      <PageHeader title="Result verification" description="Review and approve submitted results. Analyzer-imported values are never approved automatically." badge={queue.data && <Badge tone="primary">{items.length} pending</Badge>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <div className={cn('min-w-0', selected && 'hidden lg:block')}>
          {queue.error ? (
            <ErrorState error={queue.error} onRetry={queue.reload} />
          ) : !queue.data ? (
            <LoadingRows />
          ) : !items.length ? (
            <EmptyState icon={ClipboardCheck} title="All caught up" description="No results are awaiting verification." />
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.id}>
                  <button onClick={() => select(r.id)} className={cn('w-full glass rounded-2xl p-3 text-left  transition hover:shadow-elevated', selected === r.id && 'border-primary ring-1 ring-primary')}>
                    <p className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="truncate">{r.testName}</span>
                      {r.hasCritical && <AlertTriangle className="size-4 shrink-0 text-destructive" aria-label="Critical" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.patientName} · {r.orderNumber}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(r.submittedAt)}</span>
                      {r.priority && r.priority !== 'routine' && <StatusBadge map={PRIORITY} value={r.priority} />}
                    </div>
                  </button>
                  <Link href={`/orders/${r.orderId}/results`} className="mt-1 inline-block px-3 text-xs font-medium text-primary hover:underline">All tests of this patient · approve & print →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          {selected ? (
            <>
              <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={() => select(null)}>← Back to queue</Button>
              <Reviewer key={selected} id={selected} onDone={() => { select(null); void queue.reload(); }} />
            </>
          ) : (
            items.length > 0 && <EmptyState className="hidden lg:flex" icon={ClipboardCheck} title="Select a result to review" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerificationPage() {
  return (
    <React.Suspense>
      <VerificationQueue />
    </React.Suspense>
  );
}
