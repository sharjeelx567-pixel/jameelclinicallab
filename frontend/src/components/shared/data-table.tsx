'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';
import { EmptyState } from './states';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Client-side quick filter across all columns. */
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  toolbar?: React.ReactNode;
  /** Mobile (<md) card renderer. Without it the table scrolls horizontally inside its container. */
  mobileCard?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Reusable table: sorting, quick search, pagination. On small screens either
 * renders cards (mobileCard) or keeps the table in a controlled horizontal
 * scroll container — the page itself never overflows.
 */
export function DataTable<T>({ data, columns, searchable = true, searchPlaceholder = 'Search…', pageSize = 15, onRowClick, empty, toolbar, mobileCard, footer }: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [filter, setFilter] = React.useState('');
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;

  return (
    <div className="min-w-0 space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={searchPlaceholder} className="pl-9" aria-label="Filter rows" />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {total === 0 ? (
        <EmptyState title={empty?.title ?? 'Nothing here yet'} description={filter ? 'No rows match your search.' : empty?.description} action={filter ? undefined : empty?.action} />
      ) : (
        <>
          {mobileCard && (
            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <div
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r.original) : undefined}
                    className={cn('glass rounded-2xl p-4 ', onRowClick && 'cursor-pointer active:bg-muted')}
                  >
                    {mobileCard(r.original)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className={cn('scrollbar-thin overflow-x-auto glass rounded-2xl ', mobileCard && 'hidden md:block')}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const sortable = h.column.getCanSort();
                      const dir = h.column.getIsSorted();
                      return (
                        <th key={h.id} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          {h.isPlaceholder ? null : sortable ? (
                            <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-foreground">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {dir === 'asc' ? <ArrowUp className="size-3" /> : dir === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} onClick={onRowClick ? () => onRowClick(r.original) : undefined} className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-primary/[0.06]')}>
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id} className="px-4 py-3 align-middle">
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(table.getPageCount() > 1 || footer) && (
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing {pageIndex * table.getState().pagination.pageSize + 1}–{Math.min(total, (pageIndex + 1) * table.getState().pagination.pageSize)} of {total}
              </p>
              <div className="flex items-center gap-2">
                {footer}
                {table.getPageCount() > 1 && (
                  <>
                    <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
                      <ChevronLeft />
                    </Button>
                    <span className="tabular text-xs text-muted-foreground">
                      {pageIndex + 1} / {table.getPageCount()}
                    </span>
                    <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
