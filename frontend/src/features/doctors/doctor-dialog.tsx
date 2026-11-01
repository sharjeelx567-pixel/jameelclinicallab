'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { ApiError, errorMessage } from '@/lib/api-client';
import { doctorsService } from '@/services/patients.service';
import type { Doctor } from '@/types';

export function DoctorDialog({ doctor, open, onOpenChange, onSaved }: { doctor?: Doctor; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const empty = { name: '', specialization: '', qualification: '', phone: '', email: '', clinic: '', address: '', commissionType: 'none', commissionValue: '0', status: 'active' };
  const [f, setF] = React.useState(empty);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doctor
        ? { name: doctor.name, specialization: doctor.specialization ?? '', qualification: doctor.qualification ?? '', phone: doctor.phone ?? '', email: doctor.email ?? '', clinic: doctor.clinic ?? '', address: doctor.address ?? '', commissionType: doctor.commission?.type ?? 'none', commissionValue: String(doctor.commission?.value ?? 0), status: doctor.status }
        : empty,
    );
  }, [open, doctor]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Enter the doctor name';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Invalid email';
    if (f.commissionType === 'percent' && Number(f.commissionValue) > 100) e.commissionValue = 'Max 100%';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = {
      name: f.name.trim(),
      specialization: f.specialization || undefined,
      qualification: f.qualification || undefined,
      phone: f.phone || undefined,
      email: f.email || undefined,
      clinic: f.clinic || undefined,
      address: f.address || undefined,
      commission: { type: f.commissionType as 'none' | 'percent' | 'fixed', value: Number(f.commissionValue) || 0 },
      status: f.status as Doctor['status'],
    };
    try {
      if (doctor) await doctorsService.update(doctor.id, body);
      else await doctorsService.create(body);
      toast.success(doctor ? 'Doctor updated' : 'Doctor added');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{doctor ? 'Edit doctor' : 'Add referring doctor'}</DialogTitle></DialogHeader>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="d-name" required error={errors.name}><Input id="d-name" value={f.name} onChange={set('name')} /></Field>
          <Field label="Specialization" htmlFor="d-spec"><Input id="d-spec" value={f.specialization} onChange={set('specialization')} /></Field>
          <Field label="Qualification" htmlFor="d-qual"><Input id="d-qual" value={f.qualification} onChange={set('qualification')} placeholder="MBBS, FCPS…" /></Field>
          <Field label="Contact number" htmlFor="d-phone"><Input id="d-phone" type="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email" htmlFor="d-email" error={errors.email}><Input id="d-email" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Clinic / hospital" htmlFor="d-clinic"><Input id="d-clinic" value={f.clinic} onChange={set('clinic')} /></Field>
          <Field label="Address" htmlFor="d-address" className="sm:col-span-2"><Textarea id="d-address" rows={2} value={f.address} onChange={set('address')} /></Field>
          <Field label="Commission" htmlFor="d-ctype">
            <Select id="d-ctype" value={f.commissionType} onChange={set('commissionType')}>
              <option value="none">None</option><option value="percent">Percent of billed</option><option value="fixed">Fixed per order</option>
            </Select>
          </Field>
          {f.commissionType !== 'none' && <Field label={f.commissionType === 'percent' ? 'Percent' : 'Amount (PKR)'} htmlFor="d-cval" error={errors.commissionValue}><Input id="d-cval" type="number" min={0} value={f.commissionValue} onChange={set('commissionValue')} /></Field>}
          <Field label="Status" htmlFor="d-status"><Select id="d-status" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={saving} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
