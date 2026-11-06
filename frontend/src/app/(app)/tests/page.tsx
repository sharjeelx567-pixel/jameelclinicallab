'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { FolderPlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { RangesBulk } from '@/components/laboratory/ranges-bulk';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { catalogService } from '@/services/lab.service';
import type { LabTest } from '@/types';

export default function TestCatalogPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [category, setCategory] = React.useState('');
  const categories = useApi(() => catalogService.categories(), []);
  const state = useApi(() => catalogService.list({ categoryId: category || undefined }), [category]);
  const [newCat, setNewCat] = React.useState<string | null>(null);
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? '—';

  const columns: ColumnDef<LabTest, unknown>[] = [
    { accessorKey: 'code', header: 'Code', cell: ({ getValue }) => <span className="font-mono text-xs font-semibold">{String(getValue())}</span> },
    { accessorKey: 'name', header: 'Test', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.parameters.length} parameter(s)</p></div> },
    { id: 'category', header: 'Category', accessorFn: (t) => catName(t.categoryId) },
    { accessorKey: 'sampleType', header: 'Sample', cell: ({ row }) => <span className="text-sm">{row.original.sampleType}{row.original.containerType && <span className="text-muted-foreground"> · {row.original.containerType}</span>}</span> },
    { accessorKey: 'turnaroundHours', header: 'TAT', cell: ({ getValue }) => `${getValue()} h` },
    { accessorKey: 'price', header: 'Price', cell: ({ getValue }) => <span className="tabular">{formatMoney(getValue() as number)}</span> },
    {
      id: 'ranges',
      header: 'Ranges',
      accessorFn: (t) => t.parameters.flatMap((p) => p.ranges).filter((r) => r.status === 'draft').length,
      cell: ({ row }) => {
        const all = row.original.parameters.flatMap((p) => p.ranges);
        const drafts = all.filter((r) => r.status === 'draft').length;
        if (!all.length) return <Badge tone="outline">None set</Badge>;
        return drafts ? <Badge tone="warning">{drafts} awaiting approval</Badge> : <Badge tone="success">Approved</Badge>;
      },
    },
    { accessorKey: 'active', header: 'Status', cell: ({ getValue }) => (getValue() ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
  ];

  return (
    <div>
      <PageHeader
        title="Test catalogue"
        description="Tests, parameters, prices, reference ranges and analyzer mapping."
        actions={
          can('tests.write') && (
            <>
              <Button variant="outline" onClick={() => setNewCat('')}><FolderPlus /> Category</Button>
              <Button asChild><Link href="/tests/new"><Plus /> New test</Link></Button>
            </>
          )
        }
      />
      <RangesBulk onChanged={() => void state.reload()} />
      <AsyncBoundary state={state}>
        {(tests) => (
          <DataTable
            data={tests}
            columns={columns}
            searchPlaceholder="Filter by name or code…"
            onRowClick={(t) => router.push(`/tests/${t.id}`)}
            toolbar={
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="sm:w-52">
                <option value="">All categories</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            }
            empty={{ title: 'No tests in the catalogue', action: can('tests.write') ? <Button asChild size="sm"><Link href="/tests/new">Add test</Link></Button> : undefined }}
            mobileCard={(t) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.code} · {catName(t.categoryId)} · {t.sampleType}</p>
                </div>
                <span className="tabular shrink-0 text-sm">{formatMoney(t.price)}</span>
              </div>
            )}
          />
        )}
      </AsyncBoundary>

      <Dialog open={newCat !== null} onOpenChange={(o) => !o && setNewCat(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New test category</DialogTitle></DialogHeader>
          <DialogBody>
            <Field label="Category name" htmlFor="cat-name" required><Input id="cat-name" value={newCat ?? ''} onChange={(e) => setNewCat(e.target.value)} autoFocus /></Field>
            {categories.data && <p className="mt-3 text-xs text-muted-foreground">Existing: {categories.data.map((c) => c.name).join(', ')}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCat(null)}>Cancel</Button>
            <Button
              disabled={!newCat?.trim()}
              onClick={async () => {
                try {
                  await catalogService.createCategory({ name: newCat!.trim(), sortOrder: categories.data?.length ?? 0 });
                  toast.success('Category added');
                  setNewCat(null);
                  void categories.reload();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Add category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
