'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { PatientForm } from '@/components/patients/patient-form';
import { PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError, errorMessage } from '@/lib/api-client';
import { patientsService, type PatientInput } from '@/services/patients.service';
import type { DuplicateCandidate } from '@/types';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';

export default function NewPatientPage() {
  const router = useRouter();
  const idem = useIdempotencyKey();
  const [dupes, setDupes] = React.useState<{ candidates: DuplicateCandidate[]; input: PatientInput } | null>(null);
  const [forcing, setForcing] = React.useState(false);

  const done = (id: string, mr: string) => {
    toast.success(`Patient registered — MR ${mr}`);
    router.push(`/patients/${id}?registered=1`);
  };

  return (
    <div>
      <PageHeader title="Register patient" description="Complete the patient's demographics. Required fields are marked *." />
      <PatientForm
        submitLabel="Register patient"
        onCancel={() => router.back()}
        onSubmit={async (input) => {
          try {
            const p = await patientsService.create(input, idem.key());
            idem.reset();
            done(p.id, p.mrNumber);
          } catch (err) {
            if (err instanceof ApiError && err.code === 'DUPLICATE_SUSPECTED') {
              setDupes({ candidates: err.details as DuplicateCandidate[], input });
              return;
            }
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />

      <Dialog open={!!dupes} onOpenChange={(o) => !o && setDupes(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-warning" /> Possible duplicate patient</DialogTitle>
            <DialogDescription>These existing records match the CNIC or mobile number and name. Open the existing record instead of creating a duplicate, unless this is a different person.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="space-y-2">
              {dupes?.candidates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.mrNumber} · {c.mobile}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.reason === 'same_cnic' ? 'danger' : 'warning'}>{c.reason === 'same_cnic' ? 'Same CNIC' : 'Same mobile & name'}</Badge>
                    <Button asChild size="sm" variant="outline"><Link href={`/patients/${c.id}`}>Open</Link></Button>
                  </div>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupes(null)}>Go back</Button>
            <Button
              variant="secondary"
              loading={forcing}
              onClick={async () => {
                if (!dupes) return;
                setForcing(true);
                try {
                  const p = await patientsService.create({ ...dupes.input, confirmNotDuplicate: true }, idem.key());
                  idem.reset();
                  done(p.id, p.mrNumber);
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setForcing(false);
                }
              }}
            >
              Different person — register anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
