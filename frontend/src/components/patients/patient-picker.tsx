'use client';

import { Search, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { useApi, useDebounced } from '@/hooks/use-api';
import { titleCase } from '@/lib/utils';
import { patientsService } from '@/services/patients.service';
import type { Patient } from '@/types';
import { Spinner } from '@/components/shared/brand-loader';

/** Find an existing patient by MR number, name, mobile or CNIC. */
export function PatientPicker({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const [q, setQ] = React.useState('');
  const debounced = useDebounced(q.trim(), 300);
  const results = useApi(debounced.length >= 2 ? () => patientsService.list({ q: debounced, limit: 8 }) : null, [debounced]);
  if (value)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-primary-soft/40 p-3">
        <div className="min-w-0">
          <p className="font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground">{value.mrNumber} · {value.ageYears ?? '—'}Y {titleCase(value.gender)} · {value.mobile}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}><X /> Change</Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search MR number, name, mobile or CNIC" className="pl-9" aria-label="Find patient" autoFocus />
      </div>
      {results.loading && debounced.length >= 2 && <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground"><Spinner className="text-primary" /> Searching…</p>}
      {results.data && (
        <ul className="divide-y rounded-lg border">
          {results.data.items.length === 0 && (
            <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm text-muted-foreground">
              No patient found.
              <Button asChild size="sm" variant="outline"><Link href="/patients/new"><UserPlus /> Register new patient</Link></Button>
            </li>
          )}
          {results.data.items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted">
                <span className="min-w-0">
                  <span className="block break-words font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.mrNumber} · {p.mobile}</span>
                </span>
                <span className="text-xs text-muted-foreground">{p.ageYears ?? '—'}Y {p.gender[0].toUpperCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
