'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { DataTable } from '@/components/shared/data-table';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { DoctorDialog } from '@/features/doctors/doctor-dialog';
import { doctorsService } from '@/services/patients.service';
import type { Doctor } from '@/types';

const columns: ColumnDef<Doctor, unknown>[] = [
  { accessorKey: 'name', header: 'Doctor', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{[row.original.qualification, row.original.specialization].filter(Boolean).join(' · ')}</p></div> },
  { accessorKey: 'clinic', header: 'Clinic / hospital' },
  { accessorKey: 'phone', header: 'Contact' },
  { id: 'commission', header: 'Commission', accessorFn: (d) => d.commission?.type ?? 'none', cell: ({ row }) => (row.original.commission?.type === 'percent' ? `${row.original.commission.value}%` : row.original.commission?.type === 'fixed' ? `PKR ${row.original.commission.value}/order` : '—') },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => (getValue() === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
];

export default function DoctorsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const state = useApi(() => doctorsService.list(), []);
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <PageHeader title="Referring doctors" description="Doctors, referral history and doctor-wise statistics." actions={can('doctors.write') && <Button onClick={() => setOpen(true)}><Plus /> Add doctor</Button>} />
      <AsyncBoundary state={state}>
        {(d) => (
          <DataTable
            data={d.items}
            columns={columns}
            onRowClick={(doc) => router.push(`/doctors/${doc.id}`)}
            empty={{ title: 'No doctors added', action: can('doctors.write') ? <Button size="sm" onClick={() => setOpen(true)}>Add doctor</Button> : undefined }}
            mobileCard={(doc) => (
              <div>
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">{[doc.specialization, doc.clinic, doc.phone].filter(Boolean).join(' · ')}</p>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
      <DoctorDialog open={open} onOpenChange={setOpen} onSaved={state.reload} />
    </div>
  );
}
