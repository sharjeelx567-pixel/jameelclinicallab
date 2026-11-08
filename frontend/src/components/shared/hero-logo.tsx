import { cn } from '@/lib/utils';
import { BUNDLED_LOGO } from '@/components/shared/round-logo';

/**
 * Large animated lab logo for the dashboard hero: floating round logo with a
 * spinning rainbow glow ring, pulsing halo, orbiting dots and soft sparkles.
 * Pure CSS (see globals.css "Hero logo"), so it costs nothing at runtime.
 */
export function HeroLogo({ className }: { className?: string }) {
  return (
    <div className={cn('hero-logo relative mx-auto aspect-square w-full max-w-[18rem]', className)} aria-hidden>
      {/* soft coloured glow behind everything */}
      <div className="hero-logo-aura absolute inset-[6%] rounded-full" />

      {/* orbit rings with travelling dots */}
      <div className="hero-orbit hero-orbit-1 absolute inset-[2%] rounded-full">
        <span className="hero-orbit-dot bg-sky-400" />
      </div>
      <div className="hero-orbit hero-orbit-2 absolute inset-[-6%] rounded-full">
        <span className="hero-orbit-dot bg-violet-400" />
      </div>
      <div className="hero-orbit hero-orbit-3 absolute inset-[10%] rounded-full">
        <span className="hero-orbit-dot bg-emerald-400" />
      </div>

      {/* sparkles */}
      {[...Array(8)].map((_, i) => (
        <span key={i} className="hero-sparkle" style={{ ['--i' as string]: i }} />
      ))}

      {/* the floating logo */}
      <div className="hero-logo-float absolute inset-[18%]">
        <div className="logo-glow-ring absolute -inset-[5px] rounded-full" />
        <div className="relative size-full overflow-hidden rounded-full bg-white shadow-2xl">
          <img src={BUNDLED_LOGO} alt="" className="size-full object-cover" draggable={false} />
          <span className="hero-logo-shine pointer-events-none absolute inset-0" />
        </div>
      </div>
    </div>
  );
}
