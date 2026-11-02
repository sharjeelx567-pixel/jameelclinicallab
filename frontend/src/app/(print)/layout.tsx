'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { LogoMark } from '@/components/shared/logo';
import { useAuth } from '@/features/auth/auth-provider';

/**
 * Print-only pages: signed-in staff only, but no sidebar, header, banners or
 * animated background — the printed page contains just the document.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated')
    return (
      <div className="grid min-h-dvh place-items-center bg-white text-sm text-slate-500" aria-busy>
        <div className="flex flex-col items-center gap-3"><LogoMark className="size-12 animate-pulse" />Loading…</div>
      </div>
    );
  return <div className="print-root min-h-dvh bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">{children}</div>;
}
