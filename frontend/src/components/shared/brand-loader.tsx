import { cn } from '@/lib/utils';
import { RoundLogo } from './round-logo';

const RING =
  '[background:conic-gradient(from_0deg,hsl(var(--brand-1)),hsl(var(--brand-2)),hsl(var(--highlight)),transparent_70%,hsl(var(--brand-1)))]';

/**
 * The brand spinner: round lab logo floating inside a spinning gradient ring, a
 * counter-rotating dashed ring, orbiting "cells" and a soft glow. Scales with `size` (px).
 * Animations stop automatically for users who prefer reduced motion.
 */
export function BrandSpinner({ size = 176, className }: { size?: number; className?: string }) {
  const ring = Math.max(2, Math.round(size / 60));
  const dots = [
    { cls: 'loader-orbit-1', d: size * 0.07, color: 'hsl(var(--highlight))' },
    { cls: 'loader-orbit-2', d: size * 0.058, color: 'hsl(var(--brand-2))' },
    { cls: 'loader-orbit-3', d: size * 0.045, color: '#f87171' },
  ];
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} aria-hidden>
      <div className="loader-pulse absolute inset-[5%] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.45),transparent_70%)] blur-xl" />
      <div
        className={cn('loader-spin absolute inset-0 rounded-full', RING)}
        style={{ mask: `radial-gradient(farthest-side, transparent calc(100% - ${ring + 1}px), #000 calc(100% - ${ring}px))`, WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${ring + 1}px), #000 calc(100% - ${ring}px))` }}
      />
      <div className="loader-spin-rev absolute inset-[7%] rounded-full border-dashed border-primary/40" style={{ borderWidth: Math.max(1, ring - 1) }} />
      {dots.map((o) => (
        <div key={o.cls} className={cn('absolute inset-0', o.cls)}>
          <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: o.d, height: o.d, background: o.color, boxShadow: `0 0 ${o.d * 1.5}px ${o.color}` }} />
        </div>
      ))}
      <div className="loader-float absolute inset-[14%]">
        <RoundLogo className="size-full shadow-xl ring-2 ring-white/70" alt="" />
      </div>
    </div>
  );
}

/** Lab name with a moving shimmer. */
function BrandTitle({ small }: { small?: boolean }) {
  return (
    <p
      className={cn(
        'loader-shimmer bg-[linear-gradient(90deg,hsl(var(--foreground))_0%,hsl(var(--primary))_45%,hsl(var(--highlight))_55%,hsl(var(--foreground))_100%)] bg-[length:250%_100%] bg-clip-text text-center font-display font-extrabold text-transparent',
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
        <span className="loader-shimmer bg-[linear-gradient(90deg,hsl(var(--muted-foreground))_0%,hsl(var(--primary))_50%,hsl(var(--muted-foreground))_100%)] bg-[length:250%_100%] bg-clip-text text-xs font-medium text-transparent">{label}</span>
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
