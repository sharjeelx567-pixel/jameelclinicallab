'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronDown, Plus, Printer, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PatientPicker } from '@/components/patients/patient-picker';
import { patientSchema, toPatientInput, type PatientFormValues } from '@/components/patients/patient-form';
import { PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form-controls';
import { Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PAYMENT_METHODS, PROVINCES } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { ApiError, errorMessage } from '@/lib/api-client';
import { cn, formatMoney, titleCase } from '@/lib/utils';
import { settingsService } from '@/services/admin.service';
import { catalogService, ordersService, type CatalogTest } from '@/services/lab.service';
import { doctorsService, patientsService } from '@/services/patients.service';
import type { DuplicateCandidate, Patient, PaymentMethod } from '@/types';

const reportTime = (t: CatalogTest) => t.reportingTime ? titleCase(t.reportingTime.toLowerCase()) : t.turnaroundHours <= 12 ? 'Same day' : `${Math.round(t.turnaroundHours / 24)} day(s)`;

/**
 * Front-desk registration: patient details and tests on one screen. Saving
 * registers the patient (or uses the selected one), creates the order with the
 * server-calculated bill, records any payment, and opens the printable bill.
 */
export default function RegisterAndBillPage() {
  const router = useRouter();
  const { can } = useAuth();
  const patientIdem = useIdempotencyKey();
  const orderIdem = useIdempotencyKey();

  const catalog = useApi(() => catalogService.index(), []);
  const reference = useApi(() => settingsService.reference(), []);
  const doctors = useApi(() => doctorsService.list({ status: 'active', limit: 100 }), []);

  const [mode, setMode] = React.useState<'new' | 'existing'>('new');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [existing, setExisting] = React.useState<Patient | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState('');
  const [department, setDepartment] = React.useState('');
  const [doctorId, setDoctorId] = React.useState('');
  const [discount, setDiscount] = React.useState('');
  const [discountReason, setDiscountReason] = React.useState('');
  const [paid, setPaid] = React.useState('');
  const [paidTouched, setPaidTouched] = React.useState(false);
  const [method, setMethod] = React.useState<PaymentMethod>('cash');
  const [reference_, setReference] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [dupes, setDupes] = React.useState<{ candidates: DuplicateCandidate[]; input: ReturnType<typeof toPatientInput> } | null>(null);

  const form = useForm<PatientFormValues, unknown, z.output<typeof patientSchema>>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: '', guardianRelation: '', guardianName: '', ageYears: '', gender: undefined as never, mobile: '', cnic: '', addressLine: '', collectionCenterId: '',
      dateOfBirth: '', alternateMobile: '', email: '', category: '', branchId: '', sampleCollectionLocation: '', province: '', district: '', tehsil: '', unionCouncil: '', notes: '',
    },
  });
  const { register, formState: { errors } } = form;

  const tests = React.useMemo(() => catalog.data?.tests ?? [], [catalog.data]);
  const byId = React.useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);
  const deptName = React.useMemo(() => new Map((catalog.data?.categories ?? []).map((c) => [c.id, c.name])), [catalog.data]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !department) return [];
    return tests
      .filter((t) => t.active && (!department || t.categoryId === department) && (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase() === q || t.code.toLowerCase().startsWith(q)))
      .sort((a, b) => Number(b.code.toLowerCase() === q) - Number(a.code.toLowerCase() === q) || a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [tests, query, department]);

  const chosen = selected.map((id) => byId.get(id)).filter((t): t is CatalogTest => !!t);
  const subtotal = chosen.reduce((s, t) => s + t.price, 0);
  const eligible = chosen.filter((t) => t.discountEligible).reduce((s, t) => s + t.price, 0);
  const maxDiscount = Math.floor((eligible * (reference.data?.maxDiscountPercent ?? 0)) / 100);
  const discountN = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountN);
  const paidN = paidTouched ? Number(paid) || 0 : total; // default: full payment at the counter
  const balance = Math.max(0, total - paidN);

  const add = (id: string) => {
    setSelected((s) => (s.includes(id) ? s : [...s, id]));
    setQuery('');
  };
  const remove = (id: string) => setSelected((s) => s.filter((x) => x !== id));

  const problems: string[] = [];
  if (mode === 'existing' && !existing) problems.push('Select the patient');
  if (!chosen.length) problems.push('Add at least one test');
  if (discountN > 0 && !can('orders.discount')) problems.push('You are not allowed to give discounts');
  if (discountN > maxDiscount) problems.push(`Discount cannot exceed ${formatMoney(maxDiscount)} (${reference.data?.maxDiscountPercent ?? 0}% of eligible tests)`);
  if (discountN > 0 && discountReason.trim().length < 3) problems.push('Enter a reason for the discount');
  if (paidN > total) problems.push('Paid amount is more than the bill');
  if (paidN > 0 && (method === 'card' || method === 'bank_transfer') && !reference_.trim()) problems.push('Enter the card / transfer reference');

  const createOrder = async (patient: Patient) => {
    const order = await ordersService.create(
      {
        patientId: patient.id,
        testIds: selected,
        doctorId: doctorId || patient.referringDoctorId || undefined,
        priority: 'routine',
        discount: discountN > 0 ? { amount: discountN, reason: discountReason.trim() } : undefined,
        advancePayment: paidN > 0 ? { amount: paidN, method, reference: reference_.trim() || undefined } : undefined,
      },
      orderIdem.key(),
    );
    orderIdem.reset();
    toast.success(`Registered — ${patient.mrNumber} · ${order.orderNumber}`);
    router.push(`/billing/invoice/${order.id}?print=1`);
  };

  /** Patient saved but the order failed: keep using that patient so a retry never registers them twice. */
  const keepPatient = (patient: Patient) => {
    setExisting(patient);
    setMode('existing');
  };

  const registerPatient = async (input: ReturnType<typeof toPatientInput>, confirmNotDuplicate = false) => {
    const patient = await patientsService.create({ ...input, ...(confirmNotDuplicate ? { confirmNotDuplicate: true } : {}) }, patientIdem.key());
    patientIdem.reset();
    keepPatient(patient);
    return patient;
  };

  const save = async () => {
    if (problems.length) return toast.error(problems[0]);
    setSaving(true);
    try {
      if (mode === 'existing' && existing) return await createOrder(existing);
      const valid = await form.trigger();
      if (!valid) {
        if (errors.dateOfBirth || errors.alternateMobile || errors.email || form.formState.errors.dateOfBirth || form.formState.errors.alternateMobile || form.formState.errors.email) setMoreOpen(true);
        return toast.error('Check the patient details');
      }
      const input = toPatientInput(patientSchema.parse(form.getValues()));
      let patient: Patient;
      try {
        patient = await registerPatient(input);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'DUPLICATE_SUSPECTED') {
          setDupes({ candidates: err.details as DuplicateCandidate[], input });
          return;
        }
        throw err;
      }
      await createOrder(patient);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resolveDuplicate = async (choice: { existingId?: string; createNew?: boolean }) => {
    if (!dupes) return;
    setSaving(true);
    try {
      const patient = choice.existingId ? await patientsService.get(choice.existingId) : await registerPatient(dupes.input, true);
      setDupes(null);
      keepPatient(patient);
      await createOrder(patient);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Register & bill" description="Patient details and tests on one screen. Saving registers the patient, creates the order and prints the bill." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          {/* 1. Patient */}
          <Card>
            <CardHeader>
              <div><CardTitle>1. Patient</CardTitle><CardDescription>New patient, or search an existing one by MR no., name, mobile or CNIC.</CardDescription></div>
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'new' | 'existing')}>
                <TabsList>
                  <TabsTrigger value="new"><UserPlus className="mr-1.5 size-4" />New</TabsTrigger>
                  <TabsTrigger value="existing"><Users className="mr-1.5 size-4" />Existing</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {mode === 'existing' ? (
                <PatientPicker value={existing} onChange={setExisting} />
              ) : (
                <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                  <Field label="Patient name" htmlFor="r-name" required error={errors.name?.message} className="sm:col-span-2 lg:col-span-3"><Input id="r-name" autoFocus {...register('name')} /></Field>
                  <Field label="Father / husband name" htmlFor="r-guard" className="lg:col-span-3"><Input id="r-guard" {...register('guardianName')} /></Field>
                  <Field label="Relation" htmlFor="r-rel" className="lg:col-span-2">
                    <Select id="r-rel" {...register('guardianRelation')}><option value="">—</option><option value="father">Father</option><option value="husband">Husband</option><option value="other">Other</option></Select>
                  </Field>
                  <Field label="Age (years)" htmlFor="r-age" required error={errors.ageYears?.message} className="lg:col-span-2"><Input id="r-age" type="number" inputMode="numeric" min={0} max={130} {...register('ageYears')} /></Field>
                  <Field label="Gender" htmlFor="r-gender" required error={errors.gender?.message} className="lg:col-span-2">
                    <Select id="r-gender" {...register('gender')} defaultValue=""><option value="" disabled>Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
                  </Field>
                  <Field label="Mobile" htmlFor="r-mobile" required error={errors.mobile?.message} className="lg:col-span-3"><Input id="r-mobile" inputMode="tel" placeholder="0300-1234567" {...register('mobile')} /></Field>
                  <Field label="CNIC" htmlFor="r-cnic" error={errors.cnic?.message} className="lg:col-span-3"><Input id="r-cnic" placeholder="12345-1234567-1" {...register('cnic')} /></Field>
                  <Field label="Collection centre" htmlFor="r-centre" className="lg:col-span-3">
                    <Select id="r-centre" {...register('collectionCenterId')}><option value="">Main laboratory</option>{reference.data?.collectionCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                  </Field>
                  <Field label="Address" htmlFor="r-addr" className="lg:col-span-3"><Input id="r-addr" {...register('addressLine')} /></Field>
                  <div className="sm:col-span-2 lg:col-span-6">
                    <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" aria-expanded={moreOpen}>
                      <ChevronDown className={cn('size-4 transition-transform', moreOpen && 'rotate-180')} /> {moreOpen ? 'Hide' : 'More'} patient details (optional)
                    </button>
                  </div>
                  {moreOpen && (
                    <>
                      <Field label="Date of birth" htmlFor="r-dob" hint="Or enter age" error={errors.dateOfBirth?.message} className="lg:col-span-2"><Input id="r-dob" type="date" max={new Date().toISOString().slice(0, 10)} {...register('dateOfBirth')} /></Field>
                      <Field label="Alternate mobile" htmlFor="r-alt" error={errors.alternateMobile?.message} className="lg:col-span-2"><Input id="r-alt" inputMode="tel" {...register('alternateMobile')} /></Field>
                      <Field label="Email" htmlFor="r-email" error={errors.email?.message} className="lg:col-span-2"><Input id="r-email" type="email" {...register('email')} /></Field>
                      <Field label="Patient category" htmlFor="r-cat" className="lg:col-span-2">
                        <Select id="r-cat" {...register('category')}><option value="">—</option>{reference.data?.patientCategories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                      </Field>
                      <Field label="Branch" htmlFor="r-branch" className="lg:col-span-2">
                        <Select id="r-branch" {...register('branchId')}><option value="">—</option>{reference.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
                      </Field>
                      <Field label="Sample collection location" htmlFor="r-loc" className="lg:col-span-2"><Input id="r-loc" placeholder="e.g. Lab, Home, Ward 3" {...register('sampleCollectionLocation')} /></Field>
                      <Field label="Province" htmlFor="r-prov" className="lg:col-span-2">
                        <Select id="r-prov" {...register('province')}><option value="">—</option>{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
                      </Field>
                      <Field label="District" htmlFor="r-dist" className="lg:col-span-2"><Input id="r-dist" {...register('district')} /></Field>
                      <Field label="Tehsil" htmlFor="r-teh" className="lg:col-span-2"><Input id="r-teh" {...register('tehsil')} /></Field>
                      <Field label="Union council" htmlFor="r-uc" className="lg:col-span-3"><Input id="r-uc" {...register('unionCouncil')} /></Field>
                      <Field label="Notes" htmlFor="r-notes" className="lg:col-span-3"><Input id="r-notes" {...register('notes')} /></Field>
                    </>
                  )}
                  <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Advised by (doctor)" htmlFor="r-doc">
                  <Select id="r-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Self</option>{doctors.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}{d.clinic ? ` — ${d.clinic}` : ''}</option>)}</Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* 2. Tests */}
          <Card>
            <CardHeader>
              <div><CardTitle>2. Tests</CardTitle><CardDescription>Type a test name or code and press Enter to add the first match.</CardDescription></div>
              <Badge tone="primary">{chosen.length} selected</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (matches[0]) add(matches[0].id);
                      }
                    }}
                    placeholder={catalog.data ? `Search ${tests.filter((t) => t.active).length} tests — e.g. CBC, TSH, 1300` : 'Loading tests…'}
                    className="pl-9"
                    aria-label="Search tests"
                  />
                </div>
                <div className="shrink-0 sm:w-56"><Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
                  <option value="">All departments</option>
                  {catalog.data?.categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select></div>
              </div>

              {catalog.loading && !catalog.data ? <Skeleton className="h-24" /> : catalog.error ? <p className="text-sm text-destructive">{errorMessage(catalog.error)}</p> : null}

              {matches.length > 0 && (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border" aria-label="Matching tests">
                  {matches.map((t) => {
                    const on = selected.includes(t.id);
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => (on ? remove(t.id) : add(t.id))} className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted', on && 'bg-primary/10')}>
                          <span className={cn('grid size-5 shrink-0 place-items-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{on ? <Check className="size-3.5" /> : <Plus className="size-3.5 text-muted-foreground" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium">{t.name}</span>
                            <span className="block text-xs text-muted-foreground">{t.code} · {deptName.get(t.categoryId)} · {t.sampleType} · {reportTime(t)}</span>
                          </span>
                          <span className="tabular shrink-0 font-semibold">{formatMoney(t.price)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {chosen.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Test</th><th className="px-3 py-2">Sample</th><th className="px-3 py-2">Report</th><th className="px-3 py-2 text-right">Rate</th><th className="w-10" /></tr>
                    </thead>
                    <tbody className="divide-y">
                      {chosen.map((t, i) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2"><span className="font-medium">{t.name}</span> <span className="text-xs text-muted-foreground">{t.code}</span></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{t.sampleType}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{reportTime(t)}</td>
                          <td className="tabular px-3 py-2 text-right font-semibold">{formatMoney(t.price)}</td>
                          <td className="px-1"><Button size="icon-sm" variant="ghost" onClick={() => remove(t.id)} aria-label={`Remove ${t.name}`}><Trash2 /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !matches.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No tests added yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3. Bill */}
        <div className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader><div><CardTitle>3. Bill</CardTitle><CardDescription>Final amounts are confirmed by the server when you save.</CardDescription></div></CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Total ({chosen.length} tests)</dt><dd className="tabular font-semibold">{formatMoney(subtotal)}</dd></div>
                {discountN > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular">−{formatMoney(discountN)}</dd></div>}
                <div className="flex justify-between border-t pt-1.5 text-base"><dt className="font-semibold">To be paid</dt><dd className="tabular font-bold">{formatMoney(total)}</dd></div>
              </dl>

              {can('orders.discount') && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Discount" htmlFor="r-disc" hint={`Max ${formatMoney(maxDiscount)}`}><Input id="r-disc" type="number" min={0} max={maxDiscount} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
                  <Field label="Reason" htmlFor="r-disc-r"><Input id="r-disc-r" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} disabled={!discountN} /></Field>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Paid now" htmlFor="r-paid"><Input id="r-paid" type="number" min={0} inputMode="numeric" value={paidTouched ? paid : String(total)} onChange={(e) => { setPaidTouched(true); setPaid(e.target.value); }} /></Field>
                <Field label="Method" htmlFor="r-method">
                  <Select id="r-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.filter((m) => m.value !== 'panel').map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
                </Field>
              </div>
              {(method === 'card' || method === 'bank_transfer') && paidN > 0 && (
                <Field label="Card / transfer reference" htmlFor="r-ref" required><Input id="r-ref" value={reference_} onChange={(e) => setReference(e.target.value)} /></Field>
              )}
              <div className="flex justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm"><span>Balance after payment</span><span className={cn('tabular font-bold', balance > 0 && 'text-destructive')}>{formatMoney(balance)}</span></div>

              {problems.length > 0 && chosen.length > 0 && <p className="text-xs text-destructive" role="alert">{problems[0]}</p>}
              <Button className="w-full" size="lg" loading={saving} disabled={!chosen.length} onClick={() => void save()}><Printer /> Save & print bill</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!dupes} onOpenChange={(o) => !o && setDupes(null)}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Possible existing patient</DialogTitle><DialogDescription>A patient with similar details is already registered. Use the existing record to keep their history together.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-2">
            {dupes?.candidates.map((c) => (
              <button key={c.id} type="button" disabled={saving} onClick={() => void resolveDuplicate({ existingId: c.id })} className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm hover:bg-muted">
                <span className="min-w-0"><span className="block font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">{c.mrNumber} · {c.mobile}</span></span>
                <span className="text-xs font-medium text-primary">Use this patient</span>
              </button>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupes(null)}>Back</Button>
            <Button variant="secondary" loading={saving} onClick={() => void resolveDuplicate({ createNew: true })}>Register as a new patient</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
