'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { LogoMark } from '@/components/shared/logo';
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
      <div className="grid min-h-dvh place-items-center" aria-busy>
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <LogoMark className="size-12 animate-pulse" />
          Loading secure workspace…
        </div>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
