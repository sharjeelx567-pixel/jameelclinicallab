'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { BrandLoader } from '@/components/shared/brand-loader';
import { NAV } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';

/** Client-side route guard (UX only — every API call is authorised by the backend). */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const required = React.useMemo(() => NAV.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.permission, [pathname]);

  React.useEffect(() => {
    if (status === 'unauthenticated') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && required && !can(required)) router.replace('/unauthorized');
  }, [status, required, can, router, pathname]);

  if (status !== 'authenticated' || (required && !can(required))) {
    return (
      <BrandLoader label="Loading secure workspace…" />
    );
  }
  return <AppShell>{children}</AppShell>;
}
