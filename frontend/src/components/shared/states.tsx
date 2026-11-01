'use client';

import { AlertTriangle, Lock, RefreshCw, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { EmptyTubeIllustration } from './illustrations';

export function PageHeader({ title, description, actions, badge }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-[1.65rem]">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-background/30 px-6 py-12 text-center backdrop-blur-sm', className)}>
      {Icon ? (
        <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-brand-3/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-6" aria-hidden />
        </div>
      ) : (
        <EmptyTubeIllustration className="mb-2" />
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const Icon = forbidden ? Lock : AlertTriangle;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive-soft/40 px-6 py-10 text-center', className)}>
      <Icon className="mb-3 size-8 text-destructive" aria-hidden />
      <p className="font-medium">{forbidden ? 'Access restricted' : 'Could not load this information'}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {forbidden ? 'Your role does not have permission to view this. Contact a laboratory administrator if you need access.' : error instanceof Error ? error.message : 'Unexpected error'}
      </p>
      {onRetry && !forbidden && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

/** Renders loading / error / content consistently. */
export function AsyncBoundary<T>({ state, children, loading, empty }: { state: { data: T | undefined; error: unknown; loading: boolean; reload: () => void }; children: (data: T) => React.ReactNode; loading?: React.ReactNode; empty?: (data: T) => React.ReactNode | null }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <>{loading ?? <LoadingRows />}</>;
  const e = empty?.(state.data);
  if (e) return <>{e}</>;
  return <>{children(state.data)}</>;
}

export function DetailList({ items, className }: { items: Array<[string, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm">{v === undefined || v === null || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}
