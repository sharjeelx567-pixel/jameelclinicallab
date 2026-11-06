import { cn } from '@/lib/utils';
import { RoundLogo } from './round-logo';

/**
 * Animated loading screen: the round laboratory logo floating inside a spinning
 * gradient ring, a counter-rotating dashed ring, orbiting "cells", a soft pulse,
 * the lab name with a shimmer and an indeterminate progress bar.
 * Animations stop automatically for users who prefer reduced motion.
 */
export function BrandLoader({ label = 'Loading…', fullScreen = true, className }: { label?: string; fullScreen?: boolean; className?: string }) {
  return (
    <div className={cn('grid place-items-center', fullScreen ? 'min-h-dvh' : 'min-h-[60vh]', className)} role="status" aria-live="polite" aria-busy>
      <div className="flex flex-col items-center gap-6">
        <div className="relative size-44">
          {/* glow */}
          <div className="loader-pulse absolute inset-2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.45),transparent_70%)] blur-xl" aria-hidden />
          {/* gradient ring */}
          <div
            className="loader-spin absolute inset-0 rounded-full p-[3px] [background:conic-gradient(from_0deg,hsl(var(--brand-1)),hsl(var(--brand-2)),hsl(var(--highlight)),transparent_70%,hsl(var(--brand-1)))] [mask:radial-gradient(farthest-side,transparent_calc(100%-4px),#000_calc(100%-3px))]"
            aria-hidden
          />
          {/* dashed counter ring */}
          <div className="loader-spin-rev absolute inset-3 rounded-full border-2 border-dashed border-primary/40" aria-hidden />
          {/* orbiting cells */}
          {[
            { cls: 'loader-orbit-1', dot: 'size-3 bg-[hsl(var(--highlight))]' },
            { cls: 'loader-orbit-2', dot: 'size-2.5 bg-[hsl(var(--brand-2))]' },
            { cls: 'loader-orbit-3', dot: 'size-2 bg-red-400' },
          ].map((o) => (
            <div key={o.cls} className={cn('absolute inset-0', o.cls)} aria-hidden>
              <span className={cn('absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor]', o.dot)} />
            </div>
          ))}
          {/* logo */}
          <div className="loader-float absolute inset-6">
            <RoundLogo className="size-full shadow-xl ring-2 ring-white/70" alt="JAMEEL CLINICAL LABORATORY" />
          </div>
        </div>
        <div className="text-center">
          <p className="loader-shimmer bg-[linear-gradient(90deg,hsl(var(--foreground))_0%,hsl(var(--primary))_45%,hsl(var(--highlight))_55%,hsl(var(--foreground))_100%)] bg-[length:250%_100%] bg-clip-text font-display text-lg font-extrabold tracking-[0.18em] text-transparent">
            JAMEEL CLINICAL LABORATORY
          </p>
          <p className="mt-1 text-xs italic text-muted-foreground">Accurate Diagnosis, Better Healthcare</p>
        </div>
        <div className="h-1 w-52 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-[hsl(var(--brand-1))] via-[hsl(var(--brand-2))] to-[hsl(var(--highlight))]" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
