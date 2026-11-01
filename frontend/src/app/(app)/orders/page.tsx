'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { DataTable } from '@/components/shared/data-table';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-controls';
import { ORDER_STATUS, PRIORITY } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi, useDebounced } from '@/hooks/use-api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { ordersService } from '@/services/lab.service';
import type { Order } from '@/types';

const columns: ColumnDef<Order, unknown>[] = [
  { accessorKey: 'orderNumber', header: 'Order', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.orderNumber}</span> },
  {
    accessorKey: 'patientName',
    header: 'Patient',
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.patientName}</p>
        <p className="text-xs text-muted-foreground">{row.original.patientMrNumber}</p>
      </div>
    ),
  },
  { id: 'tests', header: 'Tests', accessorFn: (o) => o.items.map((i) => i.testCode).join(', '), cell: ({ getValue }) => <span className="line-clamp-2 max-w-[16rem] text-xs">{String(getValue())}</span> },
  { accessorKey: 'priority', header: 'Priority', cell: ({ getValue }) => <StatusBadge map={PRIORITY} value={String(getValue())} /> },
  { id: 'total', header: 'Total', accessorFn: (o) => o.billing.total, cell: ({ row }) => <span className="tabular">{formatMoney(row.original.billing.total)}</span> },
  { id: 'balance', header: 'Balance', accessorFn: (o) => o.billing.balance, cell: ({ row }) => <span className={`tabular ${row.original.billing.balance > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{formatMoney(row.original.billing.balance)}</span> },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge map={ORDER_STATUS} value={String(getValue())} /> },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
];

export default function OrdersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [from, setFrom] = React.useState('');
  const debounced = useDebounced(q.trim(), 350);
  const state = useApi(
    () => ordersService.list({ status: status || undefined, q: debounced || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, limit: 100 }),
    [status, debounced, from],
  );

  return (
    <div>
      <PageHeader title="Laboratory orders" description="Track every order from registration to report." actions={can('orders.create') && <Button asChild><Link href="/orders/new"><Plus /> New order</Link></Button>} />
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, patient name or MR…" aria-label="Search orders" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Created from date" />
        </CardContent>
      </Card>
      <AsyncBoundary state={state}>
        {(data) => (
          <DataTable
            data={data.items}
            columns={columns}
            searchable={false}
            onRowClick={(o) => router.push(`/orders/${o.id}`)}
            empty={{ title: 'No orders found', action: can('orders.create') ? <Button asChild size="sm"><Link href="/orders/new">Create order</Link></Button> : undefined }}
            mobileCard={(o) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{o.patientName}</p>
                    <p className="text-xs text-muted-foreground">{o.orderNumber} · {formatDateTime(o.createdAt)}</p>
                  </div>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                </div>
                <p className="truncate text-xs text-muted-foreground">{o.items.map((i) => i.testCode).join(', ')}</p>
                <div className="flex justify-between text-sm">
                  <span className="tabular">{formatMoney(o.billing.total)}</span>
                  {o.billing.balance > 0 && <span className="tabular font-medium text-destructive">Due {formatMoney(o.billing.balance)}</span>}
                </div>
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
