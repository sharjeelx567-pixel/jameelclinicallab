'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { BrandLoader } from '@/components/shared/brand-loader';
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
      <BrandLoader className="bg-white" />
    );
  return <div className="print-root min-h-dvh bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">{children}</div>;
}
