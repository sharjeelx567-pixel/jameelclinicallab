'use client';

import { BRAND } from '@/constants';
import { cn } from '@/lib/utils';
import { LabLogoMark } from './lab-logo';
import { RoundLogo } from './round-logo';

/** The laboratory's round logo (bundled image). Used where the uploaded logo isn't needed, e.g. loading screens. */
export function LogoMark({ className }: { className?: string }) {
  return <RoundLogo className={className} alt="" />;
}

/** Round logo + lab name, for the app sidebar, header and sign-in page. */
export function Logo({ className, collapsed, inverted }: { className?: string; collapsed?: boolean; inverted?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <LabLogoMark className="size-10 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className={cn('truncate font-display text-[13px] font-bold tracking-wide', inverted ? 'text-white' : 'text-foreground')}>JAMEEL CLINICAL</p>
          <p className={cn('truncate text-[10.5px] font-medium uppercase tracking-[0.14em]', inverted ? 'text-sidebar-muted' : 'text-muted-foreground')}>Laboratory</p>
        </div>
      )}
      <span className="sr-only">{BRAND.name}</span>
    </div>
  );
}
