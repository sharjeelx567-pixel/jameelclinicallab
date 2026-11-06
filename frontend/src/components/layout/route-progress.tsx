'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * Thin animated gradient bar at the top of the window while moving between pages.
 * Starts when an internal link is clicked; completes when the new route renders.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = React.useState<'idle' | 'loading' | 'done'>('idle');

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith('/print/')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState('loading');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  React.useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    const t = setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 450);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (state === 'idle') return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]" aria-hidden>
      <div
        className={
          'route-progress h-full rounded-r-full bg-gradient-to-r from-[hsl(var(--brand-1))] via-[hsl(var(--brand-2))] to-[hsl(var(--highlight))] shadow-[0_0_12px_hsl(var(--primary))] ' +
          (state === 'loading' ? 'route-progress-run' : 'route-progress-done')
        }
      />
    </div>
  );
}
