'use client';

import { HeartHandshake, Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { panelsService } from '@/services/patients.service';

export default function PanelsPage() {
  const { can } = useAuth();
  const state = useApi(() => panelsService.list(), []);
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: '', type: 'insurance', contactPerson: '', phone: '', email: '', discountPercent: '0', creditLimit: '' });
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (f.name.trim().length < 2) return toast.error('Enter the panel name');
    const pct = Number(f.discountPercent);
    if (!(pct >= 0 && pct <= 100)) return toast.error('Discount must be between 0 and 100%');
    setSaving(true);
    try {
      await panelsService.create({ name: f.name.trim(), type: f.type as 'insurance' | 'corporate', contactPerson: f.contactPerson || undefined, phone: f.phone || undefined, email: f.email || undefined, discountPercent: pct, creditLimit: f.creditLimit ? Number(f.creditLimit) : undefined, rates: {}, active: true });
      toast.success('Panel created');
      setOpen(false);
      void state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Insurance & corporate panels" description="Panel rates override catalogue prices on orders billed to the panel." actions={can('panels.write') && <Button onClick={() => setOpen(true)}><Plus /> Add panel</Button>} />
      <AsyncBoundary state={state} empty={(d) => (!d.length ? <EmptyState icon={HeartHandshake} title="No panels configured" /> : null)}>
        {(panels) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {panels.map((p) => (
              <Link key={p.id} href={`/panels/${p.id}`}>
                <Card className="h-full p-5 transition hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    {p.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                  </div>
                  <p className="mt-1 text-sm capitalize text-muted-foreground">{p.type}</p>
                  <CardContent className="mt-3 space-y-1 p-0 text-sm">
                    <p>Default discount: <strong>{p.discountPercent}%</strong></p>
                    <p>Negotiated rates: <strong>{Object.keys(p.rates).length}</strong> tests</p>
                    {p.creditLimit !== undefined && <p>Credit limit: <strong>{formatMoney(p.creditLimit)}</strong></p>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </AsyncBoundary>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Add panel</DialogTitle></DialogHeader>
          <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="pn" required className="sm:col-span-2"><Input id="pn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Type" htmlFor="pt"><Select id="pt" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="insurance">Insurance</option><option value="corporate">Corporate</option></Select></Field>
            <Field label="Default discount %" htmlFor="pd"><Input id="pd" type="number" min={0} max={100} value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value })} /></Field>
            <Field label="Contact person" htmlFor="pc"><Input id="pc" value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="pp"><Input id="pp" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Email" htmlFor="pe"><Input id="pe" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Credit limit (PKR)" htmlFor="pl"><Input id="pl" type="number" min={0} value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} /></Field>
          </DialogBody>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
