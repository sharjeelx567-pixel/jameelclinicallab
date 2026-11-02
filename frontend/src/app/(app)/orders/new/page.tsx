'use client';

import { Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { PatientPicker } from '@/components/patients/patient-picker';
import { PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/misc';
import { PAYMENT_METHODS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { errorMessage } from '@/lib/api-client';
import { cn, formatMoney } from '@/lib/utils';
import { homeSamplingService } from '@/services/admin.service';
import { catalogService, ordersService, type OrderQuote } from '@/services/lab.service';
import { doctorsService, patientsService } from '@/services/patients.service';
import type { Patient, PaymentMethod, Priority } from '@/types';

function NewOrderForm() {
  const router = useRouter();
  const idem = useIdempotencyKey();
  const params = useSearchParams();
  const { can } = useAuth();
  const [patient, setPatient] = React.useState<Patient | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [category, setCategory] = React.useState('');
  const [testFilter, setTestFilter] = React.useState('');
  const [doctorId, setDoctorId] = React.useState('');
  const [privateBilling, setPrivateBilling] = React.useState(false);
  const [priority, setPriority] = React.useState<Priority>('routine');
  const [notes, setNotes] = React.useState('');
  const [discount, setDiscount] = React.useState('');
  const [discountReason, setDiscountReason] = React.useState('');
  const [advance, setAdvance] = React.useState('');
  const [method, setMethod] = React.useState<PaymentMethod>('cash');
  const [reference, setReference] = React.useState('');
  const [quote, setQuote] = React.useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);
  const homeRequestId = params.get('homeSamplingRequestId') ?? undefined;

  const tests = useApi(() => catalogService.list({ active: 'true' }), []);
  const categories = useApi(() => catalogService.categories(), []);
  const doctors = useApi(() => doctorsService.list({ status: 'active' }), []);
  const home = useApi(homeRequestId ? () => homeSamplingService.list() : null, [homeRequestId]);
  const homeRequest = home.data?.find((h) => h.id === homeRequestId);

  React.useEffect(() => {
    const pid = params.get('patientId');
    if (pid) patientsService.get(pid).then(setPatient).catch(() => undefined);
  }, [params]);

  React.useEffect(() => {
    if (homeRequest?.requestedTestIds.length) setSelected((s) => (s.length ? s : homeRequest.requestedTestIds));
  }, [homeRequest]);

  React.useEffect(() => {
    if (patient?.referringDoctorId) setDoctorId(patient.referringDoctorId);
  }, [patient]);

  // Server-side price calculation — the browser never decides prices.
  React.useEffect(() => {
    if (!patient || !selected.length) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    ordersService
      .quote({ patientId: patient.id, testIds: selected, panelId: privateBilling ? null : undefined })
      .then((q) => !cancelled && (setQuote(q), setQuoteError(undefined)))
      .catch((e) => !cancelled && setQuoteError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [patient, selected, privateBilling]);

  const visibleTests = (tests.data ?? []).filter((t) => (!category || t.categoryId === category) && (!testFilter || `${t.name} ${t.code}`.toLowerCase().includes(testFilter.toLowerCase())));
  const fee = homeRequest?.fee ?? 0;
  const discountN = Number(discount) || 0;
  const total = quote ? Math.max(0, quote.subtotal + fee - discountN) : 0;
  const advanceN = Number(advance) || 0;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const problems: string[] = [];
  if (!patient) problems.push('Select a patient');
  if (!selected.length) problems.push('Select at least one test');
  if (quote && discountN > quote.maxDiscount) problems.push(`Discount cannot exceed ${formatMoney(quote.maxDiscount)}`);
  if (discountN > 0 && discountReason.trim().length < 3) problems.push('Enter a reason for the discount');
  if (advanceN > total) problems.push('Advance payment exceeds payable amount');
  if (advanceN > 0 && method !== 'cash' && method !== 'panel' && !reference.trim()) problems.push('Enter the payment reference');

  const submit = async () => {
    if (problems.length || !patient) return;
    setSubmitting(true);
    try {
      const order = await ordersService.create({
        patientId: patient.id,
        testIds: selected,
        doctorId: doctorId || undefined,
        panelId: privateBilling ? null : undefined,
        priority,
        clinicalNotes: notes.trim() || undefined,
        discount: discountN > 0 ? { amount: discountN, reason: discountReason.trim() } : undefined,
        advancePayment: advanceN > 0 ? { amount: advanceN, method, reference: reference.trim() || undefined } : undefined,
        homeSamplingRequestId: homeRequestId,
      }, idem.key());
      idem.reset();
      toast.success(`Order ${order.orderNumber} created`);
      router.push(`/orders/${order.id}?created=1`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New laboratory order" description="Prices, panel rates and discount limits are calculated by the server." badge={homeRequest && <Badge tone="info">Home sampling {homeRequest.requestNumber}</Badge>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle>1. Patient</CardTitle></CardHeader>
            <CardContent><PatientPicker value={patient} onChange={setPatient} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>2. Tests</CardTitle>
                <CardDescription>{selected.length} selected</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={testFilter} onChange={(e) => setTestFilter(e.target.value)} placeholder="Filter tests by name or code" aria-label="Filter tests" />
                <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                  <option value="">All categories</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              {tests.loading ? (
                <Skeleton className="h-40" />
              ) : (
                <ul className="scrollbar-thin grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                  {visibleTests.map((t) => {
                    const on = selected.includes(t.id);
                    return (
                      <li key={t.id}>
                        <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition', on ? 'border-primary bg-primary-soft/50' : 'hover:bg-muted/60')}>
                          <Checkbox checked={on} onCheckedChange={() => toggle(t.id)} className="mt-0.5" aria-label={t.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{t.name}</span>
                            <span className="block text-xs text-muted-foreground">{t.code} · {t.sampleType}{t.containerType ? ` · ${t.containerType}` : ''} · TAT {t.turnaroundHours}h</span>
                          </span>
                          <span className="tabular shrink-0 text-sm">{formatMoney(t.price)}</span>
                        </label>
                      </li>
                    );
                  })}
                  {!visibleTests.length && <li className="col-span-full py-6 text-center text-sm text-muted-foreground">No active tests match.</li>}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Clinical details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Referring doctor" htmlFor="doctor">
                <Select id="doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">Self / walk-in</option>
                  {doctors.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="priority">
                <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </Select>
              </Field>
              <Field label="Clinical notes" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Relevant history, medication, fasting status…" maxLength={1000} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader><CardTitle>Billing summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {patient?.panelId && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={privateBilling} onCheckedChange={(v) => setPrivateBilling(v === true)} /> Bill privately (ignore patient&apos;s panel)
                </label>
              )}
              {quote?.panel && !privateBilling && <Badge tone="primary">Panel: {quote.panel.name}</Badge>}
              {quoteError && <p className="text-sm text-destructive">{quoteError}</p>}
              <ul className="space-y-1.5 text-sm">
                {quote?.lines.map((l) => (
                  <li key={l.testId} className="flex justify-between gap-2">
                    <span className="truncate">{l.name}</span>
                    <span className="tabular shrink-0">
                      {l.unitPrice !== l.catalogPrice && <span className="mr-1 text-xs text-muted-foreground line-through">{formatMoney(l.catalogPrice)}</span>}
                      {formatMoney(l.unitPrice)}
                    </span>
                  </li>
                ))}
                {!quote && <li className="text-muted-foreground">Select a patient and tests.</li>}
              </ul>
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{formatMoney(quote?.subtotal ?? 0)}</span></div>
                {fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Home collection fee</span><span className="tabular">{formatMoney(fee)}</span></div>}
                {discountN > 0 && <div className="flex justify-between text-success"><span>Discount</span><span className="tabular">−{formatMoney(discountN)}</span></div>}
                <div className="flex justify-between text-base font-semibold"><span>Payable</span><span className="tabular">{formatMoney(total)}</span></div>
              </div>

              {can('orders.discount') && (
                <div className="grid grid-cols-1 gap-3 border-t pt-3">
                  <Field label="Discount (PKR)" htmlFor="discount" hint={quote ? `Max ${formatMoney(quote.maxDiscount)} on eligible tests` : undefined}>
                    <Input id="discount" type="number" min={0} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </Field>
                  {discountN > 0 && (
                    <Field label="Discount reason" htmlFor="discountReason" required>
                      <Input id="discountReason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} maxLength={200} />
                    </Field>
                  )}
                </div>
              )}

              {can('billing.collect') && (
                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Field label="Advance payment (PKR)" htmlFor="advance">
                    <Input id="advance" type="number" min={0} inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} />
                  </Field>
                  {advanceN > 0 && (
                    <>
                      <Field label="Method" htmlFor="method">
                        <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </Select>
                      </Field>
                      {method !== 'cash' && (
                        <Field label="Reference" htmlFor="ref"><Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
                      )}
                    </>
                  )}
                  <div className="flex justify-between text-sm sm:col-span-2 xl:col-span-1">
                    <span className="text-muted-foreground">Remaining balance</span>
                    <span className="tabular font-medium">{formatMoney(Math.max(0, total - advanceN))}</span>
                  </div>
                </div>
              )}

              {problems.length > 0 && patient && selected.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-warning-soft p-3 text-xs text-warning">
                  {problems.map((p) => <li key={p}>• {p}</li>)}
                </ul>
              )}
              <Button className="w-full" size="lg" disabled={problems.length > 0} loading={submitting} onClick={() => void submit()}>
                <Check /> Create order
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <React.Suspense>
      <NewOrderForm />
    </React.Suspense>
  );
}
