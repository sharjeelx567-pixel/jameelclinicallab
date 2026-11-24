import { cn } from '@/lib/utils';
import { RoundLogo } from './round-logo';

/**
 * The brand mark on loading screens: the round lab logo in a thin brand ring. Scales with `size` (px).
 */
export function BrandSpinner({ size = 176, className }: { size?: number; className?: string }) {
  // Static on purpose: spinning rings, orbiting dots and blur glows slowed down older PCs.
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-[6%] rounded-full bg-gradient-to-br from-primary to-highlight p-[3px]">
        <RoundLogo className="size-full" alt="" />
      </div>
    </div>
  );
}

/** Lab name. */
function BrandTitle({ small }: { small?: boolean }) {
  return (
    <p
      className={cn(
        'text-center font-display font-extrabold text-foreground',
        small ? 'text-sm tracking-[0.16em]' : 'text-lg tracking-[0.18em]',
      )}
    >
      JAMEEL CLINICAL LABORATORY
    </p>
  );
}

function ProgressBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <div className="loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-[hsl(var(--brand-1))] via-[hsl(var(--brand-2))] to-[hsl(var(--highlight))]" />
    </div>
  );
}

/**
 * Loading screen.
 * - `screen`: whole window (sign-in check, print pages)
 * - `page`: inside the app while a page's data loads
 * - `section`: inside a card / panel
 */
export function BrandLoader({ label = 'Loading…', size = 'screen', fullScreen, className }: { label?: string; size?: 'screen' | 'page' | 'section'; fullScreen?: boolean; className?: string }) {
  const s = fullScreen === false && size === 'screen' ? 'page' : size;
  if (s === 'section') {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 py-8', className)} role="status" aria-live="polite" aria-busy>
        <BrandSpinner size={72} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
    );
  }
  return (
    <div className={cn('grid place-items-center', s === 'screen' ? 'min-h-dvh' : 'min-h-[60vh]', className)} role="status" aria-live="polite" aria-busy>
      <div className="flex flex-col items-center gap-6">
        <BrandSpinner size={s === 'screen' ? 176 : 136} />
        <div>
          <BrandTitle small={s === 'page'} />
          <p className="mt-1 text-center text-xs italic text-muted-foreground">Accurate Diagnosis, Better Healthcare</p>
        </div>
        <ProgressBar className={s === 'screen' ? 'w-52' : 'w-44'} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** Small inline spinner in the same style (buttons, uploads, searches). Takes the text colour. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('loader-spin inline-block size-4 shrink-0 rounded-full [background:conic-gradient(from_0deg,transparent_10%,currentColor)]', className)}
      style={{ mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))', WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))' }}
      aria-hidden
    />
  );
}
