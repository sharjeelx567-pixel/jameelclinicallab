'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { PROVINCES } from '@/constants';
import { useApi } from '@/hooks/use-api';
import { ApiError } from '@/lib/api-client';
import { settingsService } from '@/services/admin.service';
import { doctorsService, panelsService, type PatientInput } from '@/services/patients.service';
import type { Patient } from '@/types';

const optional = (s: z.ZodType<string>) => z.union([s, z.literal('')]).optional();
const mobile = z.string().trim().regex(/^(\+92|0)3\d{2}[-\s]?\d{7}$/, 'Enter a valid mobile number, e.g. 0300-1234567');

export const patientSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the patient name').max(100),
    guardianName: optional(z.string().trim().max(100)),
    guardianRelation: z.enum(['father', 'husband', 'other', '']).optional(),
    dateOfBirth: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    ageYears: z.union([z.coerce.number().int().min(0, 'Invalid age').max(130, 'Invalid age'), z.literal('')]).optional(),
    gender: z.enum(['male', 'female', 'other'], { message: 'Select gender' }),
    mobile,
    alternateMobile: z.union([mobile, z.literal('')]).optional(),
    cnic: optional(z.string().trim().regex(/^\d{5}-?\d{7}-?\d$/, 'CNIC format: 12345-1234567-1')),
    email: optional(z.email('Invalid email')),
    province: z.string().optional(),
    division: z.string().max(60).optional(),
    district: z.string().max(60).optional(),
    tehsil: z.string().max(60).optional(),
    unionCouncil: z.string().max(80).optional(),
    addressLine: z.string().max(300).optional(),
    referringDoctorId: z.string().optional(),
    branchId: z.string().optional(),
    collectionCenterId: z.string().optional(),
    sampleCollectionLocation: z.string().max(120).optional(),
    panelId: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => !!v.dateOfBirth || (v.ageYears !== undefined && v.ageYears !== ''), { message: 'Enter date of birth or age', path: ['ageYears'] })
  .refine((v) => !v.dateOfBirth || new Date(v.dateOfBirth) <= new Date(), { message: 'Date of birth cannot be in the future', path: ['dateOfBirth'] });

export type PatientFormValues = z.input<typeof patientSchema>;

const blank = (v?: string) => (v ? v : undefined);

export function toPatientInput(v: z.output<typeof patientSchema>): PatientInput {
  return {
    name: v.name,
    guardianName: blank(v.guardianName),
    guardianRelation: v.guardianRelation ? v.guardianRelation : undefined,
    dateOfBirth: blank(v.dateOfBirth),
    ageYears: v.dateOfBirth || v.ageYears === '' || v.ageYears === undefined ? undefined : Number(v.ageYears),
    gender: v.gender,
    mobile: v.mobile,
    alternateMobile: blank(v.alternateMobile),
    cnic: blank(v.cnic),
    email: blank(v.email),
    address: { province: blank(v.province), division: blank(v.division), district: blank(v.district), tehsil: blank(v.tehsil), unionCouncil: blank(v.unionCouncil), line: blank(v.addressLine) },
    referringDoctorId: blank(v.referringDoctorId),
    branchId: blank(v.branchId),
    collectionCenterId: blank(v.collectionCenterId),
    sampleCollectionLocation: blank(v.sampleCollectionLocation),
    panelId: blank(v.panelId),
    category: blank(v.category),
    notes: blank(v.notes),
  };
}

export function fromPatient(p: Patient): PatientFormValues {
  return {
    name: p.name,
    guardianName: p.guardianName ?? '',
    guardianRelation: p.guardianRelation ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    ageYears: p.dateOfBirth ? '' : (p.ageYears ?? ''),
    gender: p.gender,
    mobile: p.mobile,
    alternateMobile: p.alternateMobile ?? '',
    cnic: p.cnic ?? '',
    email: p.email ?? '',
    province: p.address.province ?? '',
    division: p.address.division ?? '',
    district: p.address.district ?? '',
    tehsil: p.address.tehsil ?? '',
    unionCouncil: p.address.unionCouncil ?? '',
    addressLine: p.address.line ?? '',
    referringDoctorId: p.referringDoctorId ?? '',
    branchId: p.branchId ?? '',
    collectionCenterId: p.collectionCenterId ?? '',
    sampleCollectionLocation: p.sampleCollectionLocation ?? '',
    panelId: p.panelId ?? '',
    category: p.category ?? '',
    notes: p.notes ?? '',
  };
}

const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3';

interface Props {
  defaultValues?: PatientFormValues;
  submitLabel: string;
  onSubmit: (input: PatientInput) => Promise<void>;
  onCancel?: () => void;
}

export function PatientForm({ defaultValues, submitLabel, onSubmit, onCancel }: Props) {
  const form = useForm<PatientFormValues, unknown, z.output<typeof patientSchema>>({
    resolver: zodResolver(patientSchema),
    defaultValues: defaultValues ?? { gender: undefined as never, mobile: '', name: '', branchId: 'main' },
    mode: 'onBlur',
  });
  const { register, formState, handleSubmit, setError, watch } = form;
  const e = formState.errors;
  const ref = useApi(() => settingsService.reference(), []);
  const doctors = useApi(() => doctorsService.list({ status: 'active' }), []);
  const panels = useApi(() => panelsService.list().catch(() => []), []);
  const dob = watch('dateOfBirth');

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toPatientInput(values));
    } catch (err) {
      // Map server-side field errors back onto the form.
      if (err instanceof ApiError) {
        const fields = err.fieldErrors;
        const map: Record<string, keyof PatientFormValues> = { 'address.line': 'addressLine', 'address.district': 'district' };
        Object.entries(fields).forEach(([path, message]) => setError((map[path] ?? path) as keyof PatientFormValues, { message }));
      }
      throw err;
    }
  });

  return (
    <form noValidate onSubmit={(ev) => void submit(ev).catch(() => undefined)} className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Personal details</CardTitle>
            <CardDescription>MR number is generated automatically. CNIC is optional and never used as the record identifier.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className={grid}>
          <Field label="Patient name" htmlFor="name" required error={e.name?.message} className="sm:col-span-2 xl:col-span-1">
            <Input id="name" autoComplete="off" {...register('name')} />
          </Field>
          <Field label="Father / husband name" htmlFor="guardianName" error={e.guardianName?.message}>
            <Input id="guardianName" {...register('guardianName')} />
          </Field>
          <Field label="Relation" htmlFor="guardianRelation">
            <Select id="guardianRelation" {...register('guardianRelation')}>
              <option value="">—</option>
              <option value="father">Father</option>
              <option value="husband">Husband</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Gender" htmlFor="gender" required error={e.gender?.message}>
            <Select id="gender" {...register('gender')}>
              <option value="">Select…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth" error={e.dateOfBirth?.message} hint="Or enter age">
            <Input id="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} {...register('dateOfBirth')} />
          </Field>
          <Field label="Age (years)" htmlFor="ageYears" required={!dob} error={e.ageYears?.message}>
            <Input id="ageYears" type="number" inputMode="numeric" min={0} max={130} disabled={!!dob} {...register('ageYears')} />
          </Field>
          <Field label="CNIC" htmlFor="cnic" error={e.cnic?.message}>
            <Input id="cnic" inputMode="numeric" placeholder="12345-1234567-1" {...register('cnic')} />
          </Field>
          <Field label="Patient category" htmlFor="category">
            <Select id="category" {...register('category')}>
              <option value="">—</option>
              {ref.data?.patientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact & address</CardTitle></CardHeader>
        <CardContent className={grid}>
          <Field label="Mobile number" htmlFor="mobile" required error={e.mobile?.message}>
            <Input id="mobile" type="tel" inputMode="tel" placeholder="0300-1234567" {...register('mobile')} />
          </Field>
          <Field label="Alternate mobile" htmlFor="alternateMobile" error={e.alternateMobile?.message}>
            <Input id="alternateMobile" type="tel" inputMode="tel" {...register('alternateMobile')} />
          </Field>
          <Field label="Email" htmlFor="email" error={e.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
          <Field label="Province" htmlFor="province">
            <Select id="province" {...register('province')}>
              <option value="">—</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Division" htmlFor="division"><Input id="division" {...register('division')} /></Field>
          <Field label="District" htmlFor="district"><Input id="district" {...register('district')} /></Field>
          <Field label="Tehsil" htmlFor="tehsil"><Input id="tehsil" {...register('tehsil')} /></Field>
          <Field label="Union council / union name" htmlFor="unionCouncil"><Input id="unionCouncil" {...register('unionCouncil')} /></Field>
          <Field label="Complete address" htmlFor="addressLine" className="sm:col-span-2 xl:col-span-3">
            <Textarea id="addressLine" rows={2} {...register('addressLine')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Referral & registration</CardTitle></CardHeader>
        <CardContent className={grid}>
          <Field label="Referring doctor" htmlFor="referringDoctorId">
            <Select id="referringDoctorId" {...register('referringDoctorId')}>
              <option value="">Self / walk-in</option>
              {doctors.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}{d.clinic ? ` — ${d.clinic}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Branch" htmlFor="branchId">
            <Select id="branchId" {...register('branchId')}>
              {ref.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Collection centre" htmlFor="collectionCenterId">
            <Select id="collectionCenterId" {...register('collectionCenterId')}>
              <option value="">—</option>
              {ref.data?.collectionCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Sample collection location" htmlFor="sampleCollectionLocation">
            <Input id="sampleCollectionLocation" placeholder="e.g. Main lab, ward, home" {...register('sampleCollectionLocation')} />
          </Field>
          <Field label="Insurance / panel" htmlFor="panelId">
            <Select id="panelId" {...register('panelId')}>
              <option value="">Private (no panel)</option>
              {panels.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 xl:col-span-3">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={formState.isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
