import { cn } from '@/lib/utils';
import type { Analyzer } from '@/types';

/**
 * Visual link status. ONLY a live analyzer whose bridge reported "connected"
 * gets the animated pulse. Demo mode is a static dashed ring labelled DEMO —
 * never animated, so it can't be mistaken for real connectivity.
 */
export function ConnectionIndicator({ analyzer, size = 'md' }: { analyzer: Pick<Analyzer, 'mode' | 'connectionState'>; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'size-2.5' : 'size-3.5';
  if (analyzer.mode === 'demo') {
    return (
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning" title="Demo mode — no real analyzer connection">
        <span className={cn('rounded-full border-2 border-dashed border-warning', size === 'sm' ? 'size-3' : 'size-4')} />
        Demo
      </span>
    );
  }
  const map = {
    connected: { color: 'bg-success', label: 'Live link', text: 'text-success' },
    disconnected: { color: 'bg-warning', label: 'Disconnected', text: 'text-warning' },
    error: { color: 'bg-destructive', label: 'Error', text: 'text-destructive' },
    never_connected: { color: 'bg-muted-foreground/50', label: 'Never connected', text: 'text-muted-foreground' },
  } as const;
  const s = map[analyzer.connectionState];
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-semibold', s.text)}>
      <span className="relative inline-flex">
        {analyzer.connectionState === 'connected' && <span className={cn('absolute inset-0 rounded-full animate-live-ping', s.color)} />}
        <span className={cn('relative rounded-full', dim, s.color)} />
      </span>
      {s.label}
    </span>
  );
}
