'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Search, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { DataTable } from '@/components/shared/data-table';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi, useDebounced } from '@/hooks/use-api';
import { formatDate, titleCase } from '@/lib/utils';
import { patientsService } from '@/services/patients.service';
import type { Patient } from '@/types';

const columns: ColumnDef<Patient, unknown>[] = [
  { accessorKey: 'mrNumber', header: 'MR No.', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.mrNumber}</span> },
  {
    accessorKey: 'name',
    header: 'Patient',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium">{row.original.name}</p>
        {row.original.guardianName && <p className="text-xs text-muted-foreground">{row.original.guardianRelation === 'husband' ? 'W/O' : 'S/D/O'} {row.original.guardianName}</p>}
      </div>
    ),
  },
  { id: 'ageGender', header: 'Age / Sex', accessorFn: (p) => p.ageYears, cell: ({ row }) => `${row.original.ageYears ?? '—'} Y · ${titleCase(row.original.gender)}` },
  { accessorKey: 'mobile', header: 'Mobile', cell: ({ getValue }) => <span className="tabular">{String(getValue())}</span> },
  { accessorKey: 'cnic', header: 'CNIC', cell: ({ getValue }) => <span className="tabular text-muted-foreground">{(getValue() as string) ?? '—'}</span> },
  { accessorKey: 'createdAt', header: 'Registered', cell: ({ getValue }) => formatDate(getValue() as string) },
];

function PatientsList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const [status, setStatus] = React.useState('active');
  const [gender, setGender] = React.useState('');
  const [pages, setPages] = React.useState<Patient[][]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const debounced = useDebounced(q.trim(), 350);
  const state = useApi(() => patientsService.list({ q: debounced || undefined, status, gender: gender || undefined, limit: 50 }), [debounced, status, gender]);

  React.useEffect(() => {
    if (state.data) {
      setPages([state.data.items]);
      setCursor(state.data.nextCursor);
    }
  }, [state.data]);

  const loadMore = async () => {
    if (!cursor) return;
    const next = await patientsService.list({ q: debounced || undefined, status, gender: gender || undefined, limit: 50, cursor });
    setPages((p) => [...p, next.items]);
    setCursor(next.nextCursor);
  };

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search by MR number, name, mobile number or CNIC."
        actions={can('patients.write') && <Button asChild><Link href="/register"><UserPlus /> Register & bill</Link></Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="MR number, name, mobile or CNIC…" className="pl-9" aria-label="Search patients" autoFocus />
          </div>
          <Select value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Gender filter" className="sm:w-36">
            <option value="">All genders</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" className="sm:w-36">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
        </CardContent>
      </Card>
      <AsyncBoundary state={state}>
        {() => (
          <DataTable
            data={pages.flat()}
            columns={columns}
            searchable={false}
            onRowClick={(p) => router.push(`/patients/${p.id}`)}
            empty={{ title: debounced ? 'No patients match your search' : 'No patients registered yet', description: debounced ? 'Try the MR number or mobile number.' : undefined, action: can('patients.write') ? <Button asChild size="sm"><Link href="/patients/new">Register patient</Link></Button> : undefined }}
            footer={cursor && <Button variant="outline" size="sm" onClick={() => void loadMore()}>Load more</Button>}
            mobileCard={(p) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.mrNumber} · {p.ageYears ?? '—'}Y {titleCase(p.gender)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.mobile}</p>
                </div>
                <Users className="size-4 shrink-0 text-muted-foreground" />
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

export default function PatientsPage() {
  return (
    <React.Suspense>
      <PatientsList />
    </React.Suspense>
  );
}
