import { BRAND } from '@/constants';
import { cn } from '@/lib/utils';

/** Brand mark: a stylised flask with a check — precision + verification. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-9', className)} aria-hidden>
      <rect width="40" height="40" rx="11" className="fill-primary" />
      <path d="M16 9h8M17.5 9v8.2L11.6 27.6A3 3 0 0 0 14.2 32h11.6a3 3 0 0 0 2.6-4.4L22.5 17.2V9" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.8 25.4l2.6 2.5 5.6-5.4" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, collapsed, inverted }: { className?: string; collapsed?: boolean; inverted?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark className="shrink-0" />
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
