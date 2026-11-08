'use client';

import { BadgeCheck, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { ApiError, errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { analyzersService } from '@/services/admin.service';
import { catalogService } from '@/services/lab.service';
import type { LabTest, ReferenceRange, TestParameter } from '@/types';

type RangeDraft = Omit<ReferenceRange, 'id' | 'status'> & { id?: string; status?: ReferenceRange['status'] };
type ParamDraft = Omit<TestParameter, 'id' | 'ranges'> & { id?: string; key: string; ranges: RangeDraft[] };

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const str = (v?: number) => (v === undefined ? '' : String(v));
let keySeq = 0;
const newParam = (): ParamDraft => ({ key: `p${++keySeq}`, name: '', inputType: 'numeric', decimals: 1, ranges: [], sortOrder: 0 });

export function TestEditor({ test }: { test?: LabTest }) {
  const router = useRouter();
  const { can } = useAuth();
  const editable = can('tests.write');
  const categories = useApi(() => catalogService.categories(), []);
  const analyzers = useApi(can('analyzers.read') ? () => analyzersService.list() : null, []);
  const [form, setForm] = React.useState({
    name: test?.name ?? '',
    code: test?.code ?? '',
    categoryId: test?.categoryId ?? '',
    description: test?.description ?? '',
    sampleType: test?.sampleType ?? '',
    containerType: test?.containerType ?? '',
    sampleVolume: test?.sampleVolume ?? '',
    collectionInstructions: test?.collectionInstructions ?? '',
    processingInstructions: test?.processingInstructions ?? '',
    turnaroundHours: str(test?.turnaroundHours ?? 24),
    price: str(test?.price ?? 0),
    discountEligible: test?.discountEligible ?? true,
    active: test?.active ?? true,
  });
  const [params, setParams] = React.useState<ParamDraft[]>(() => (test?.parameters.length ? test.parameters.map((p) => ({ ...p, key: p.id })) : [newParam()]));
  const [mappings, setMappings] = React.useState(test?.analyzerMappings ?? []);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const updateParam = (key: string, patch: Partial<ParamDraft>) => setParams((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const updateRange = (key: string, i: number, patch: Partial<RangeDraft>) =>
    setParams((ps) => ps.map((p) => (p.key === key ? { ...p, ranges: p.ranges.map((r, j) => (j === i ? { ...r, ...patch, status: undefined } : r)) } : p)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Enter the test name';
    if (!/^[A-Za-z0-9-]{1,20}$/.test(form.code.trim())) e.code = 'Letters, numbers and dashes only';
    if (!form.categoryId) e.categoryId = 'Select a category';
    if (!form.sampleType.trim()) e.sampleType = 'Enter the sample type';
    if (!(Number(form.price) >= 0)) e.price = 'Enter a valid price';
    if (!(Number(form.turnaroundHours) >= 0)) e.turnaroundHours = 'Enter turnaround time in hours';
    params.forEach((p, i) => {
      if (!p.name.trim()) e[`param-${p.key}`] = `Parameter ${i + 1} needs a name`;
      if (p.inputType === 'select' && !p.options?.filter(Boolean).length) e[`param-${p.key}`] = `${p.name || `Parameter ${i + 1}`}: add options`;
      p.ranges.forEach((r) => {
        if (r.low !== undefined && r.high !== undefined && r.low > r.high) e[`param-${p.key}`] = `${p.name}: lower limit exceeds upper limit`;
      });
    });
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return toast.error('Please fix the highlighted fields');
    setSaving(true);
    const body = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim(),
      price: Number(form.price),
      turnaroundHours: Number(form.turnaroundHours),
      description: form.description || undefined,
      containerType: form.containerType || undefined,
      sampleVolume: form.sampleVolume || undefined,
      collectionInstructions: form.collectionInstructions || undefined,
      processingInstructions: form.processingInstructions || undefined,
      parameters: params.map(({ key: _k, ...p }, i) => ({ ...p, unit: p.unit || undefined, code: p.code || undefined, defaultValue: p.defaultValue?.trim() || undefined, optional: p.optional || undefined, sortOrder: i, options: p.inputType === 'select' ? p.options?.filter(Boolean) : undefined, ranges: p.ranges.map(({ status: _s, approvedBy: _a, approvedAt: _t, ...r }) => ({ ...r, text: r.text?.trim() || undefined })) })),
      analyzerMappings: mappings.filter((m) => m.analyzerId && m.analyzerTestCode),
    };
    try {
      const saved = test ? await catalogService.update(test.id, body) : await catalogService.create(body);
      toast.success(test ? 'Test updated. Edited ranges return to draft until re-approved.' : 'Test created');
      if (!test) router.replace(`/tests/${saved.id}`);
      else router.refresh();
      setParams(saved.parameters.map((p) => ({ ...p, key: p.id })));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const approve = async (p: ParamDraft, r: RangeDraft) => {
    if (!test || !p.id || !r.id) return;
    try {
      const updated = await catalogService.approveRange(test.id, p.id, r.id);
      setParams(updated.parameters.map((x) => ({ ...x, key: x.id })));
      toast.success('Reference range approved');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Test details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Test name" htmlFor="t-name" required error={errors.name} className="sm:col-span-2"><Input id="t-name" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={!editable} /></Field>
          <Field label="Short code" htmlFor="t-code" required error={errors.code}><Input id="t-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} disabled={!editable} className="font-mono" /></Field>
          <Field label="Category" htmlFor="t-cat" required error={errors.categoryId}>
            <Select id="t-cat" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} disabled={!editable}>
              <option value="">Select…</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Sample type" htmlFor="t-st" required error={errors.sampleType}><Input id="t-st" value={form.sampleType} onChange={(e) => set('sampleType', e.target.value)} disabled={!editable} placeholder="Serum, whole blood, urine…" /></Field>
          <Field label="Container" htmlFor="t-ct"><Input id="t-ct" value={form.containerType} onChange={(e) => set('containerType', e.target.value)} disabled={!editable} placeholder="EDTA, gel, fluoride…" /></Field>
          <Field label="Required volume" htmlFor="t-vol"><Input id="t-vol" value={form.sampleVolume} onChange={(e) => set('sampleVolume', e.target.value)} disabled={!editable} /></Field>
          <Field label="Turnaround (hours)" htmlFor="t-tat" required error={errors.turnaroundHours}><Input id="t-tat" type="number" min={0} value={form.turnaroundHours} onChange={(e) => set('turnaroundHours', e.target.value)} disabled={!editable} /></Field>
          <Field label="Price (PKR)" htmlFor="t-price" required error={errors.price}><Input id="t-price" type="number" min={0} value={form.price} onChange={(e) => set('price', e.target.value)} disabled={!editable} /></Field>
          <div className="flex items-center gap-6 sm:col-span-2 xl:col-span-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => set('active', v)} disabled={!editable} /> Active</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.discountEligible} onCheckedChange={(v) => set('discountEligible', v)} disabled={!editable} /> Discount eligible</label>
          </div>
          <Field label="Description" htmlFor="t-desc" className="sm:col-span-2 xl:col-span-4"><Textarea id="t-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={!editable} /></Field>
          <Field label="Collection instructions" htmlFor="t-ci" className="sm:col-span-2"><Textarea id="t-ci" rows={2} value={form.collectionInstructions} onChange={(e) => set('collectionInstructions', e.target.value)} disabled={!editable} /></Field>
          <Field label="Processing instructions" htmlFor="t-pi" className="sm:col-span-2"><Textarea id="t-pi" rows={2} value={form.processingInstructions} onChange={(e) => set('processingInstructions', e.target.value)} disabled={!editable} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Parameters & reference ranges</CardTitle>
            <CardDescription className="flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              Reference ranges and critical limits must be entered from the laboratory&apos;s validated documentation and approved by a qualified professional. Suggested values are created as drafts only. Draft ranges are not used for flagging or printing until approved.
            </CardDescription>
          </div>
          {editable && <Button size="sm" variant="outline" onClick={() => setParams((p) => [...p, newParam()])}><Plus /> Add parameter</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          {params.map((p, idx) => (
            <div key={p.key} className="rounded-xl border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(11rem,1.3fr)_minmax(0,0.7fr)_auto]">
                <Field label={`Parameter ${idx + 1}`} htmlFor={`pn-${p.key}`} error={errors[`param-${p.key}`]}><Input id={`pn-${p.key}`} value={p.name} onChange={(e) => updateParam(p.key, { name: e.target.value })} disabled={!editable} /></Field>
                <Field label="Unit" htmlFor={`pu-${p.key}`}><Input id={`pu-${p.key}`} value={p.unit ?? ''} onChange={(e) => updateParam(p.key, { unit: e.target.value })} disabled={!editable} /></Field>
                <Field label="Result type" htmlFor={`pt-${p.key}`}>
                  <Select id={`pt-${p.key}`} value={p.inputType} onChange={(e) => updateParam(p.key, { inputType: e.target.value as ParamDraft['inputType'] })} disabled={!editable}>
                    <option value="numeric">Quantitative (number)</option>
                    <option value="select">Qualitative (options)</option>
                    <option value="text">Free text</option>
                  </Select>
                </Field>
                {p.inputType === 'numeric' ? (
                  <Field label="Decimals" htmlFor={`pd-${p.key}`}><Input id={`pd-${p.key}`} type="number" min={0} max={6} value={str(p.decimals)} onChange={(e) => updateParam(p.key, { decimals: num(e.target.value) })} disabled={!editable} /></Field>
                ) : (
                  <Field label="Analyzer code" htmlFor={`pc-${p.key}`}><Input id={`pc-${p.key}`} value={p.code ?? ''} onChange={(e) => updateParam(p.key, { code: e.target.value })} disabled={!editable} /></Field>
                )}
                {editable && params.length > 1 && (
                  <Button variant="ghost" size="icon" className="self-end text-destructive" onClick={() => setParams((ps) => ps.filter((x) => x.key !== p.key))} aria-label={`Remove ${p.name || 'parameter'}`}><Trash2 /></Button>
                )}
              </div>
              {p.inputType === 'select' && (
                <Field label="Options (comma separated)" htmlFor={`po-${p.key}`} className="mt-3">
                  <Input id={`po-${p.key}`} value={(p.options ?? []).join(', ')} onChange={(e) => updateParam(p.key, { options: e.target.value.split(',').map((s) => s.trim()) })} disabled={!editable} placeholder="Reactive, Non-reactive" />
                </Field>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Default value (pre-filled at result entry)" htmlFor={`pv-${p.key}`} hint="e.g. Nil or Not Seen. Staff then change only abnormal values.">
                  {p.inputType === 'select' ? (
                    <Select id={`pv-${p.key}`} value={p.defaultValue ?? ''} onChange={(e) => updateParam(p.key, { defaultValue: e.target.value || undefined })} disabled={!editable}>
                      <option value="">No default</option>
                      {(p.options ?? []).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input id={`pv-${p.key}`} value={p.defaultValue ?? ''} onChange={(e) => updateParam(p.key, { defaultValue: e.target.value })} disabled={!editable} maxLength={60} />
                  )}
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={!!p.optional} onCheckedChange={(v) => updateParam(p.key, { optional: v || undefined })} disabled={!editable} aria-label="Optional row" /> Optional (may be left empty)</label>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference ranges</p>
                {!p.ranges.length && <p className="mb-2 text-sm text-muted-foreground">No range configured — results will print without a range and be flagged &ldquo;no range&rdquo;.</p>}
                <div className="space-y-2">
                  {p.ranges.map((r, i) => (
                    <div key={r.id ?? i} className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-4 xl:grid-cols-[110px_repeat(6,minmax(0,1fr))_auto]">
                      <Select value={r.gender} onChange={(e) => updateRange(p.key, i, { gender: e.target.value as RangeDraft['gender'] })} disabled={!editable} aria-label="Gender">
                        <option value="any">Any sex</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                      </Select>
                      <Input placeholder="Age from" type="number" value={str(r.ageMinYears)} onChange={(e) => updateRange(p.key, i, { ageMinYears: num(e.target.value) })} disabled={!editable} aria-label="Minimum age (years)" />
                      <Input placeholder="Age to" type="number" value={str(r.ageMaxYears)} onChange={(e) => updateRange(p.key, i, { ageMaxYears: num(e.target.value) })} disabled={!editable} aria-label="Maximum age (years)" />
                      {p.inputType === 'numeric' ? (
                        <>
                          <Input placeholder="Lower" type="number" value={str(r.low)} onChange={(e) => updateRange(p.key, i, { low: num(e.target.value) })} disabled={!editable} aria-label="Lower limit" />
                          <Input placeholder="Upper" type="number" value={str(r.high)} onChange={(e) => updateRange(p.key, i, { high: num(e.target.value) })} disabled={!editable} aria-label="Upper limit" />
                          <Input placeholder="Critical low" type="number" value={str(r.criticalLow)} onChange={(e) => updateRange(p.key, i, { criticalLow: num(e.target.value) })} disabled={!editable} aria-label="Critical low" />
                          <Input placeholder="Critical high" type="number" value={str(r.criticalHigh)} onChange={(e) => updateRange(p.key, i, { criticalHigh: num(e.target.value) })} disabled={!editable} aria-label="Critical high" />
                        </>
                      ) : (
                        <div className="col-span-2 hidden sm:col-span-4 xl:col-span-4 xl:block" />
                      )}
                      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-4 xl:col-span-1">
                        {r.status === 'approved' ? (
                          <Badge tone="success" title={r.approvedBy && `${r.approvedBy.name}, ${formatDateTime(r.approvedAt)}`}><BadgeCheck className="size-3" /> Approved</Badge>
                        ) : r.status === 'draft' ? (
                          can('tests.approveRanges') ? <Button size="sm" variant="success" onClick={() => void approve(p, r)}>Approve</Button> : <Badge tone="warning">Draft</Badge>
                        ) : (
                          <Badge tone="outline">Unsaved</Badge>
                        )}
                        {editable && <Button size="icon-sm" variant="ghost" onClick={() => updateParam(p.key, { ranges: p.ranges.filter((_, j) => j !== i) })} aria-label="Remove range"><Trash2 /></Button>}
                      </div>
                      <Textarea
                        rows={Math.max(2, Math.min(8, (r.text ?? '').split('\n').length))}
                        className="col-span-full min-h-0"
                        placeholder={p.inputType === 'numeric'
                          ? 'Normal value text printed on the report (optional), one line each, e.g.\nPrediabetes 5.7-6.4%\nDiabetes Mellitus >= 6.5%'
                          : 'Normal / expected result, e.g. Non-Reactive (several lines allowed)'}
                        value={r.text ?? ''}
                        onChange={(e) => updateRange(p.key, i, { text: e.target.value })}
                        disabled={!editable}
                        maxLength={600}
                        aria-label="Normal value text"
                      />
                    </div>
                  ))}
                </div>
                {editable && <Button size="sm" variant="ghost" className="mt-2" onClick={() => updateParam(p.key, { ranges: [...p.ranges, { gender: 'any' }] })}><Plus /> Add range</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {can('analyzers.read') && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Analyzer mapping</CardTitle>
              <CardDescription>Map analyzer result codes to this test&apos;s parameters. Codes must come from the analyzer&apos;s host-interface documentation.</CardDescription>
            </div>
            {editable && <Button size="sm" variant="outline" onClick={() => setMappings((m) => [...m, { analyzerId: '', analyzerTestCode: '', parameterCodes: {} }])}><Plus /> Add mapping</Button>}
          </CardHeader>
          <CardContent className="space-y-3">
            {!mappings.length && <p className="text-sm text-muted-foreground">Not mapped to any analyzer.</p>}
            {mappings.map((m, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Select value={m.analyzerId} onChange={(e) => setMappings((ms) => ms.map((x, j) => (j === i ? { ...x, analyzerId: e.target.value } : x)))} disabled={!editable} aria-label="Analyzer">
                    <option value="">Select analyzer…</option>
                    {analyzers.data?.map((a) => <option key={a.id} value={a.id}>{a.name}{a.mode === 'demo' ? ' (DEMO)' : ''}</option>)}
                  </Select>
                  <Input placeholder="Analyzer test code" value={m.analyzerTestCode} onChange={(e) => setMappings((ms) => ms.map((x, j) => (j === i ? { ...x, analyzerTestCode: e.target.value } : x)))} disabled={!editable} aria-label="Analyzer test code" />
                  {editable && <Button size="icon" variant="ghost" onClick={() => setMappings((ms) => ms.filter((_, j) => j !== i))} aria-label="Remove mapping"><Trash2 /></Button>}
                </div>
                {params.length > 1 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {params.filter((p) => p.id).map((p) => {
                      const code = Object.entries(m.parameterCodes).find(([, pid]) => pid === p.id)?.[0] ?? '';
                      return (
                        <label key={p.key} className="flex items-center gap-2 text-sm">
                          <span className="w-32 shrink-0 truncate text-muted-foreground">{p.name}</span>
                          <Input
                            value={code}
                            placeholder="code"
                            disabled={!editable}
                            onChange={(e) =>
                              setMappings((ms) =>
                                ms.map((x, j) => {
                                  if (j !== i) return x;
                                  const next = Object.fromEntries(Object.entries(x.parameterCodes).filter(([, pid]) => pid !== p.id));
                                  if (e.target.value.trim()) next[e.target.value.trim()] = p.id!;
                                  return { ...x, parameterCodes: next };
                                }),
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editable && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => router.push('/tests')}>Cancel</Button>
          <Button loading={saving} onClick={() => void save()}>{test ? 'Save changes' : 'Create test'}</Button>
        </div>
      )}
    </div>
  );
}
