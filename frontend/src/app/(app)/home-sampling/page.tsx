'use client';

import { CalendarClock, Home, MapPin, Phone, Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { HOME_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { homeSamplingService, usersService } from '@/services/admin.service';
import { catalogService } from '@/services/lab.service';
import type { HomeSamplingRequest } from '@/types';

const NEXT: Record<string, string[]> = { requested: ['scheduled', 'cancelled'], scheduled: ['cancelled'], assigned: ['en_route', 'cancelled'], en_route: ['collected', 'cancelled'] };

function NewRequestDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const idem = useIdempotencyKey();
  const tests = useApi(open ? () => catalogService.list({ active: 'true' }) : null, [open]);
  const [f, setF] = React.useState({ patientName: '', mobile: '', address: '', scheduledFor: '', fee: '0', notes: '' });
  const [testIds, setTestIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const save = async () => {
    if (f.patientName.trim().length < 2 || !/^(\+92|0)3\d{2}-?\d{7}$/.test(f.mobile.trim()) || f.address.trim().length < 5) return toast.error('Enter name, a valid mobile number and the full address');
    setSaving(true);
    try {
      await homeSamplingService.create({ patientName: f.patientName.trim(), mobile: f.mobile.trim(), address: f.address.trim(), requestedTestIds: testIds, scheduledFor: f.scheduledFor ? new Date(f.scheduledFor).toISOString() : undefined, fee: Number(f.fee) || 0, notes: f.notes || undefined }, idem.key());
      idem.reset();
      toast.success('Home sampling request created');
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>New home sampling request</DialogTitle></DialogHeader>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Patient name" htmlFor="hs-n" required><Input id="hs-n" value={f.patientName} onChange={(e) => setF({ ...f, patientName: e.target.value })} /></Field>
          <Field label="Mobile" htmlFor="hs-m" required><Input id="hs-m" type="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="0300-1234567" /></Field>
          <Field label="Address" htmlFor="hs-a" required className="sm:col-span-2"><Textarea id="hs-a" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Preferred time" htmlFor="hs-t"><Input id="hs-t" type="datetime-local" value={f.scheduledFor} onChange={(e) => setF({ ...f, scheduledFor: e.target.value })} /></Field>
          <Field label="Collection fee (PKR)" htmlFor="hs-f"><Input id="hs-f" type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Requested tests</p>
            <div className="scrollbar-thin grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
              {tests.data?.map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <Checkbox checked={testIds.includes(t.id)} onCheckedChange={(v) => setTestIds((ids) => (v ? [...ids, t.id] : ids.filter((x) => x !== t.id)))} /> {t.name}
                </label>
              ))}
            </div>
          </div>
          <Field label="Notes" htmlFor="hs-notes" className="sm:col-span-2"><Textarea id="hs-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Create request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ r, staff, onChanged }: { r: HomeSamplingRequest; staff: Array<{ id: string; displayName: string }>; onChanged: () => void }) {
  const { can } = useAuth();
  const update = async (body: Parameters<typeof homeSamplingService.update>[1]) => {
    try {
      await homeSamplingService.update(r.id, body);
      toast.success('Request updated');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const editable = can('homeSampling.write') && !['collected', 'cancelled'].includes(r.status);
  return (
    <li className="glass rounded-2xl p-4 ">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{r.patientName} <span className="font-mono text-xs text-muted-foreground">{r.requestNumber}</span></p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="size-3" />{r.mobile}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{r.address}</span>
            {r.scheduledFor && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{formatDateTime(r.scheduledFor)}</span>}
          </p>
          <p className="mt-1 text-xs">{r.requestedTestIds.length} test(s) · fee {formatMoney(r.fee)}{r.collectorName && ` · collector ${r.collectorName}`}</p>
        </div>
        <StatusBadge map={HOME_STATUS} value={r.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && (
          <Select className="h-8 w-48 text-xs" value={r.collectorId ?? ''} onChange={(e) => e.target.value && void update({ collectorId: e.target.value })} aria-label="Assign collector">
            <option value="">Assign collector…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </Select>
        )}
        {editable && NEXT[r.status]?.map((s) => (
          <Button key={s} size="sm" variant={s === 'cancelled' ? 'ghost' : 'outline'} onClick={() => void update({ status: s })}>{HOME_STATUS[s].label}</Button>
        ))}
        {r.status === 'collected' && !r.orderId && can('orders.create') && <Button size="sm" asChild><Link href={`/orders/new?homeSamplingRequestId=${r.id}${r.patientId ? `&patientId=${r.patientId}` : ''}`}>Create order</Link></Button>}
        {r.orderId && <Button size="sm" variant="ghost" asChild><Link href={`/orders/${r.orderId}`}>View order</Link></Button>}
      </div>
    </li>
  );
}

export default function HomeSamplingPage() {
  const { can } = useAuth();
  const [status, setStatus] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const state = useApi(() => homeSamplingService.list(status || undefined), [status]);
  const staff = useApi(can('users.read') ? () => usersService.list() : null, []);
  return (
    <div>
      <PageHeader title="Home sampling" description="Requests, scheduling, collector assignment and tracking." actions={can('homeSampling.write') && <Button onClick={() => setOpen(true)}><Plus /> New request</Button>} />
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="">All</TabsTrigger>
          {Object.entries(HOME_STATUS).map(([k, v]) => <TabsTrigger key={k} value={k}>{v.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="mt-4">
        <AsyncBoundary state={state} empty={(d) => (!d.length ? <EmptyState icon={Home} title="No home sampling requests" /> : null)}>
          {(items) => <ul className="space-y-3">{items.map((r) => <RequestCard key={r.id} r={r} staff={(staff.data ?? []).filter((s) => s.status === 'active')} onChanged={state.reload} />)}</ul>}
        </AsyncBoundary>
      </div>
      <NewRequestDialog open={open} onOpenChange={setOpen} onDone={state.reload} />
    </div>
  );
}
