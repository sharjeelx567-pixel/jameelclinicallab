'use client';

import { AlertTriangle, ArrowLeft, Cpu, FilePen, Info, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { NormalValueButton } from '@/components/laboratory/normal-value-dialog';
import { ResultContext } from '@/components/laboratory/result-context';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { FlagBadge, SourceBadge, StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { RESULT_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { ApiError, errorMessage } from '@/lib/api-client';
import { previewFlag, rangeText } from '@/lib/flags';
import { cn, formatDateTime } from '@/lib/utils';
import { resultsService } from '@/services/lab.service';

const EDITABLE = ['pending', 'draft', 'correction_requested', 'rejected'];

export default function ResultEntryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const state = useApi(() => resultsService.workspace(id), [id]);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [comment, setComment] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<'draft' | 'submit' | null>(null);
  const [amending, setAmending] = React.useState(false);

  // After changing a normal value the page reloads the ranges but keeps what was typed.
  const keepTyped = React.useRef(false);
  React.useEffect(() => {
    if (!state.data) return;
    if (keepTyped.current) {
      keepTyped.current = false;
      return;
    }
    const saved = state.data.result.values;
    // A test opened for the first time starts with its default values (e.g. Nil, Not Seen).
    setValues(
      saved.length
        ? Object.fromEntries(saved.map((v) => [v.parameterId, v.value]))
        : Object.fromEntries(state.data.parameters.filter((p) => p.defaultValue).map((p) => [p.id, p.defaultValue!])),
    );
    setComment(state.data.result.technicianComment ?? '');
  }, [state.data]);

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const ws = state.data;
  const r = ws.result;
  const editable = EDITABLE.includes(r.status) && can('results.enter');
  const sampleReady = !!ws.sample && ['accepted', 'processing', 'completed'].includes(ws.sample.status);
  const anyCritical = ws.parameters.some((p) => {
    const f = previewFlag(p.inputType, values[p.id] ?? '', p.approvedRange);
    return f === 'critical_low' || f === 'critical_high';
  });

  const save = async (submit: boolean) => {
    setSaving(submit ? 'submit' : 'draft');
    setFieldErrors({});
    try {
      const res = await resultsService.enter(id, {
        values: ws.parameters.map((p) => ({ parameterId: p.id, value: (values[p.id] ?? '').trim() })),
        technicianComment: comment.trim() || undefined,
        submit,
      });
      toast.success(submit ? 'Submitted for verification' : 'Draft saved');
      if (submit) router.push('/results');
      else state.setData({ ...ws, result: res });
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <Link href="/results" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Result entry</Link>
      <PageHeader
        title={`${ws.test.name}`}
        badge={<><StatusBadge map={RESULT_STATUS} value={r.status} />{r.version > 1 && <Badge tone="warning">Version {r.version}</Badge>}</>}
        description={`${ws.patient.name} · ${ws.patient.mrNumber} · ${ws.order.orderNumber}`}
        actions={r.status === 'approved' && can('results.amend') && <Button variant="outline" onClick={() => setAmending(true)}><FilePen /> Amend result</Button>}
      />

      {r.rejection && EDITABLE.includes(r.status) && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div><p className="font-medium">Returned by {r.rejection.by.name} on {formatDateTime(r.rejection.at)}</p><p>{r.rejection.reason}</p></div>
        </div>
      )}
      {r.amendment && r.status !== 'approved' && (
        <div className="mb-4 rounded-xl border border-info/30 bg-info-soft p-4 text-sm">
          Amendment of version {r.amendment.previousVersion} opened by {r.amendment.by.name}: {r.amendment.reason}
        </div>
      )}
      {editable && !sampleReady && (
        <div role="alert" className="mb-4 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          The sample has not been accepted in the laboratory yet ({ws.sample?.status.replace('_', ' ') ?? 'no sample'}). Results can be entered once it is accepted.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Parameters</CardTitle>
            {r.hasAnalyzerValues && <Badge tone="info"><Cpu className="size-3" /> Contains analyzer-imported values</Badge>}
          </CardHeader>
          <CardContent className="space-y-1">
            {ws.test.processingInstructions && <p className="mb-3 flex gap-2 rounded-lg bg-muted p-3 text-xs"><Info className="size-4 shrink-0" />{ws.test.processingInstructions}</p>}
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span>Parameter</span><span>Result</span><span>Approved range</span><span className="w-28 text-right">Flag</span>
            </div>
            {ws.parameters.map((p) => {
              const value = values[p.id] ?? '';
              const flag = previewFlag(p.inputType, value, p.approvedRange);
              const stored = r.values.find((v) => v.parameterId === p.id);
              const critical = flag === 'critical_low' || flag === 'critical_high';
              const inputId = `param-${p.id}`;
              return (
                <div key={p.id} className={cn('grid grid-cols-1 gap-2 rounded-lg border border-transparent p-2 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center md:gap-3', critical && 'border-destructive/40 bg-destructive-soft/50')}>
                  <label htmlFor={inputId} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium">
                    <span className="break-words">{p.name}</span>
                    {p.unit && <span className="whitespace-nowrap font-normal text-muted-foreground">({p.unit})</span>}
                    {p.optional && <span className="text-xs font-normal text-muted-foreground">· optional</span>}
                    {stored && <SourceBadge source={stored.source} />}
                  </label>
                  <div>
                    {p.inputType === 'select' ? (
                      <Select id={inputId} value={value} disabled={!editable || !sampleReady} onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))} aria-invalid={!!fieldErrors[p.id]}>
                        <option value="">—</option>
                        {p.options?.map((o) => <option key={o}>{o}</option>)}
                      </Select>
                    ) : (
                      <Input
                        id={inputId}
                        value={value}
                        disabled={!editable || !sampleReady}
                        inputMode={p.inputType === 'numeric' ? 'decimal' : 'text'}
                        onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                        className={cn('tabular', critical && 'border-destructive font-semibold text-destructive')}
                        aria-invalid={!!fieldErrors[p.id]}
                      />
                    )}
                    {fieldErrors[p.id] && <p className="mt-1 text-xs text-destructive">{fieldErrors[p.id]}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="md:hidden">Range: </span>
                    {p.approvedRange ? <span className="whitespace-pre-line">{rangeText(p.approvedRange, p.unit)}</span> : <span title="No approved reference range for this patient's age/gender">Not set{p.hasDraftRanges && ' (draft pending approval)'}</span>}
                    <NormalValueButton className="-ml-1.5 flex" testId={ws.test.id} param={p} onSaved={() => { keepTyped.current = true; void state.reload(); }} />
                  </p>
                  <div className="md:w-28 md:text-right">{flag && <FlagBadge flag={flag} />}</div>
                </div>
              );
            })}
            {anyCritical && (
              <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-destructive-soft p-3 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" /> Critical value — confirm the result (repeat if required by lab protocol) before submitting. The approver will be alerted.
              </p>
            )}
            <Field label="Technician comment" htmlFor="tech-comment" className="pt-4">
              <Textarea id="tech-comment" value={comment} onChange={(e) => setComment(e.target.value)} disabled={!editable} maxLength={1000} />
            </Field>
            <p className="pt-2 text-xs text-muted-foreground">Flags shown while typing are a preview. The server computes the final flag from the approved reference range when you save.</p>
          </CardContent>
          {editable && (
            <CardFooter>
              <Button variant="outline" loading={saving === 'draft'} disabled={!!saving || !sampleReady} onClick={() => void save(false)}><Save /> Save draft</Button>
              <Button loading={saving === 'submit'} disabled={!!saving || !sampleReady} onClick={() => void save(true)}><Send /> Submit for verification</Button>
            </CardFooter>
          )}
        </Card>
        <ResultContext ws={ws} />
      </div>

      <ConfirmDialog
        open={amending}
        onOpenChange={setAmending}
        title="Amend an approved result?"
        description="The approved version is preserved. Issued reports for this order will be marked superseded until the amended result is re-verified and a new report is generated."
        confirmLabel="Open amendment"
        reasonLabel="Amendment reason"
        onConfirm={async (reason) => {
          try {
            await resultsService.amend(id, reason);
            toast.success('Amendment opened — enter corrected values');
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
