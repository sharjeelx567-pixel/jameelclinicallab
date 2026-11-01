'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { DataTable } from '@/components/shared/data-table';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Select } from '@/components/ui/form-controls';
import { REPORT_STATUS } from '@/constants';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/utils';
import { reportsService } from '@/services/lab.service';
import type { ReportListItem } from '@/types';

const columns: ColumnDef<ReportListItem, unknown>[] = [
  { accessorKey: 'reportNumber', header: 'Report', cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.reportNumber} · v{row.original.version}</span> },
  { accessorKey: 'patientName', header: 'Patient', cell: ({ row }) => <div><p className="font-medium">{row.original.patientName}</p><p className="text-xs text-muted-foreground">{row.original.mrNumber}</p></div> },
  { accessorKey: 'orderNumber', header: 'Order' },
  { accessorKey: 'testCount', header: 'Tests' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge map={REPORT_STATUS} value={String(getValue())} /> },
  { accessorKey: 'printCount', header: 'Prints' },
  { accessorKey: 'generatedAt', header: 'Generated', cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.generatedAt)} · {row.original.generatedBy.name}</span> },
];

export default function ReportsPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState('');
  const state = useApi(() => reportsService.list({ status: status || undefined, limit: 100 }), [status]);
  return (
    <div>
      <PageHeader title="Reports" description="Reports are generated only from verified results. Every print and download is recorded." />
      <AsyncBoundary state={state}>
        {(d) => (
          <DataTable
            data={d.items}
            columns={columns}
            searchPlaceholder="Filter by patient, report or order…"
            onRowClick={(r) => router.push(`/reports/${r.id}`)}
            toolbar={
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-44">
                <option value="">All statuses</option>
                {Object.entries(REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            }
            empty={{ title: 'No reports yet', description: 'Generate a report from an order once its results are verified.' }}
            mobileCard={(r) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{r.patientName}</p>
                  <p className="text-xs text-muted-foreground">{r.reportNumber} v{r.version} · {formatDateTime(r.generatedAt)}</p>
                </div>
                <StatusBadge map={REPORT_STATUS} value={r.status} />
              </div>
            )}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}
