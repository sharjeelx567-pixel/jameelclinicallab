'use client';

import { ArrowLeft, CheckCircle2, FileText, Printer, Save, Send, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { FlagBadge, StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/form-controls';
import { RESULT_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { ApiError, errorMessage } from '@/lib/api-client';
import { previewFlag } from '@/lib/flags';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import { ordersService, reportsService, resultsService, samplesService } from '@/services/lab.service';
import type { ResultWorkspace, SampleStatus } from '@/types';

const EDITABLE = new Set(['pending', 'draft', 'correction_requested', 'rejected']);
/** Steps still needed before results can be entered on a sample. */
const STEPS_TO_ACCEPT: Partial<Record<SampleStatus, Array<'collect' | 'receive' | 'accept'>>> = {
  pending_collection: ['collect', 'receive', 'accept'],
  collected: ['receive', 'accept'],
  received: ['accept'],
};

type Values = Record<string, Record<string, string>>; // resultId → parameterId → value

/**
 * Quick results: every test of one order on a single page. "Approve & print"
 * accepts the sample if needed, submits and approves the results (server rules
 * still apply: approver permission, self-verification policy) and prints the report.
 */
export default function OrderResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const detail = useApi(() => ordersService.detail(id), [id]);
  const [spaces, setSpaces] = React.useState<ResultWorkspace[] | null>(null);
  const [values, setValues] = React.useState<Values>({});
  const [comments, setComments] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<null | 'draft' | 'submit' | 'approve'>(null);
  const [step, setStep] = React.useState('');
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const load = React.useCallback(async () => {
    if (!detail.data) return;
    setLoadError(null);
    try {
      const ws = await Promise.all(detail.data.results.map((r) => resultsService.workspace(r.id)));
      setSpaces(ws);
      setValues(Object.fromEntries(ws.map((w) => [w.result.id, Object.fromEntries(w.parameters.map((p) => [p.id, w.result.values.find((v) => v.parameterId === p.id)?.value ?? '']))])));
      setComments(Object.fromEntries(ws.map((w) => [w.result.id, w.result.technicianComment ?? ''])));
    } catch (err) {
      setLoadError(err);
    }
  }, [detail.data]);
  React.useEffect(() => {
    void load();
  }, [load]);

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;
  if (!detail.data || !spaces) return <LoadingRows rows={10} />;
  const { order, patient, samples, reports } = detail.data;
  const latestReport = reports[0];

  const editable = spaces.filter((w) => EDITABLE.has(w.result.status));
  const filled = (w: ResultWorkspace) => w.parameters.every((p) => p.optional || (values[w.result.id]?.[p.id] ?? '').trim() !== '');
  const empty = (w: ResultWorkspace) => w.parameters.every((p) => (values[w.result.id]?.[p.id] ?? '').trim() === '');
  const partial = editable.filter((w) => !filled(w) && !empty(w));
  const ready = editable.filter(filled);
  const submitted = spaces.filter((w) => w.result.status === 'submitted');
  const canApprove = can('results.approve');

  /** Accept the samples of the tests being saved (collect → receive → accept as needed). */
  const ensureSamplesAccepted = async (ws: ResultWorkspace[]) => {
    const ids = new Set(ws.map((w) => w.sample?.id).filter(Boolean) as string[]);
    for (const s of samples.filter((x) => ids.has(x.id))) {
      for (const action of STEPS_TO_ACCEPT[s.status] ?? []) {
        setStep(`Sample ${s.sampleNumber}: ${action}`);
        await samplesService.act(s.id, action, action === 'accept' ? { condition: 'Good' } : {});
      }
    }
  };

  const saveValues = async (ws: ResultWorkspace[], submit: boolean) => {
    for (const w of ws) {
      setStep(`Saving ${w.test.name}`);
      await resultsService.enter(w.result.id, {
        values: w.parameters.map((p) => ({ parameterId: p.id, value: (values[w.result.id]?.[p.id] ?? '').trim() })).filter((v) => v.value !== ''),
        technicianComment: comments[w.result.id]?.trim() || undefined,
        submit,
      });
    }
  };

  /** Blank rows of a test get their default (e.g. Nil, Not Seen) so staff change only abnormal values. */
  const withDefaults = (w: ResultWorkspace, cur: Record<string, string>) =>
    Object.fromEntries(w.parameters.map((p) => [p.id, (cur[p.id] ?? '').trim() === '' ? (p.defaultValue ?? '') : cur[p.id]]));
  const hasDefaults = (w: ResultWorkspace) => w.parameters.some((p) => p.defaultValue);

  const run = async (mode: 'draft' | 'submit' | 'approve') => {
    if (partial.length) return toast.error(`Complete all values for ${partial[0].test.name}, or leave it empty for later`);
    const toSave = mode === 'draft' ? editable.filter((w) => !empty(w)) : ready;
    if (mode !== 'approve' && !toSave.length) return toast.error('Enter at least one result');
    if (mode === 'approve' && !toSave.length && !submitted.length) return toast.error('Enter results first');
    setBusy(mode);
    try {
      await ensureSamplesAccepted(toSave);
      await saveValues(toSave, mode !== 'draft');
      if (mode === 'approve') {
        const toApprove = [...submitted.map((w) => w.result.id), ...toSave.map((w) => w.result.id)];
        for (const rid of toApprove) {
          setStep('Approving results');
          await resultsService.approve(rid);
        }
        setStep('Generating report');
        const report = await reportsService.generate(order.id);
        toast.success(`Report ${report.reportNumber} ready (${report.status})`);
        router.push(`/print/report/${report.id}?auto=1`);
        return;
      }
      toast.success(mode === 'draft' ? 'Saved as draft' : 'Sent for verification');
      await detail.reload();
    } catch (err) {
      const msg = err instanceof ApiError && err.code === 'FORBIDDEN' && /different person/i.test(err.message)
        ? 'You entered these results, so you cannot also approve them. Ask the pathologist to approve, or turn on "Allow self-verification" in Settings → Results & billing.'
        : errorMessage(err);
      toast.error(msg, { duration: 9000 });
      await detail.reload();
    } finally {
      setBusy(null);
      setStep('');
    }
  };

  return (
    <div>
      <Link href={`/orders/${order.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Order {order.orderNumber}</Link>
      <PageHeader
        title={`Results — ${patient?.name ?? order.patientName}`}
        description={`${order.patientMrNumber} · ${patient?.ageYears ?? '—'}Y ${titleCase(patient?.gender ?? '')} · ${order.orderNumber} · ${formatDateTime(order.createdAt)}${order.doctorName ? ` · Dr ${order.doctorName}` : ''}`}
        actions={latestReport && <Button variant="outline" onClick={() => router.push(`/print/report/${latestReport.id}?auto=1`)}><Printer /> Print last report ({latestReport.reportNumber})</Button>}
      />

      <div className="space-y-4 pb-28">
        {spaces.map((w) => {
          const locked = !EDITABLE.has(w.result.status);
          return (
            <Card key={w.result.id} className={cn(locked && 'opacity-90')}>
              <CardHeader>
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">{w.test.name} <span className="text-xs font-normal text-muted-foreground">{w.test.code}</span></CardTitle>
                  <CardDescription>{w.sample ? `${w.sample.sampleNumber} · ${w.sample.sampleType} · sample ${titleCase(w.sample.status)}` : w.test.sampleType}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!locked && hasDefaults(w) && (
                    <Button size="sm" variant="outline" onClick={() => setValues((s) => ({ ...s, [w.result.id]: withDefaults(w, s[w.result.id] ?? {}) }))}>
                      <Wand2 /> Fill normal values
                    </Button>
                  )}
                  <StatusBadge map={RESULT_STATUS} value={w.result.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                  {w.parameters.map((p) => {
                    const v = values[w.result.id]?.[p.id] ?? '';
                    const flag = previewFlag(p.inputType, v, p.approvedRange);
                    const inputId = `v-${w.result.id}-${p.id}`;
                    const range = p.approvedRange ? (p.approvedRange.text ?? [p.approvedRange.low, p.approvedRange.high].filter((x) => x !== undefined).join(' – ')) : 'Range not set';
                    const set = (val: string) =>
                      setValues((s) => {
                        const cur = s[w.result.id] ?? {};
                        // First value typed for this test: fill the other rows with their defaults.
                        const start = w.parameters.every((q) => (cur[q.id] ?? '').trim() === '') ? withDefaults(w, cur) : cur;
                        return { ...s, [w.result.id]: { ...start, [p.id]: val } };
                      });
                    return (
                      <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                        <label htmlFor={inputId} className="min-w-0 text-sm">
                          <span className="font-medium">{p.name}</span> {p.unit && <span className="text-muted-foreground">({p.unit})</span>}
                          {p.optional && <span className="ml-1 text-xs text-muted-foreground">· optional</span>}
                          <span className="block text-xs text-muted-foreground">{range}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          {p.inputType === 'select' ? (
                            <Select id={inputId} value={v} disabled={locked} onChange={(e) => set(e.target.value)}><option value="">—</option>{p.options?.map((o) => <option key={o}>{o}</option>)}</Select>
                          ) : (
                            <Input id={inputId} value={v} disabled={locked} inputMode={p.inputType === 'numeric' ? 'decimal' : 'text'} onChange={(e) => set(e.target.value)} className={cn('tabular', flag && flag !== 'normal' && flag !== 'no_range' && 'border-destructive font-semibold text-destructive')} />
                          )}
                          {flag && flag !== 'normal' && flag !== 'no_range' && <FlagBadge flag={flag} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!locked && (
                  <Textarea rows={1} placeholder="Comment (optional, printed on the report)" value={comments[w.result.id] ?? ''} onChange={(e) => setComments((s) => ({ ...s, [w.result.id]: e.target.value }))} aria-label={`Comment for ${w.test.name}`} />
                )}
                {locked && w.result.status === 'approved' && <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> Approved{w.result.approvedBy ? ` by ${w.result.approvedBy.name}` : ''}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sticky action bar */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(var(--glass-border))] bg-background/85 backdrop-blur-xl lg:left-[17.5rem]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            {busy ? step || 'Working…' : <><Badge tone="primary">{ready.length}</Badge> ready · {editable.length - ready.length} left empty{submitted.length ? ` · ${submitted.length} waiting approval` : ''}</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {can('results.enter') && <Button variant="outline" loading={busy === 'draft'} disabled={!!busy || !editable.length} onClick={() => void run('draft')}><Save /> Save draft</Button>}
            {can('results.enter') && !canApprove && <Button loading={busy === 'submit'} disabled={!!busy || !ready.length} onClick={() => void run('submit')}><Send /> Send for verification</Button>}
            {canApprove && (
              <Button loading={busy === 'approve'} disabled={!!busy || (!ready.length && !submitted.length)} onClick={() => void run('approve')}>
                <FileText /> Approve & print report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
