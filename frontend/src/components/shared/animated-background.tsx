import { themeConfig } from '@/theme/config';
import { cn } from '@/lib/utils';

/**
 * Decorative page backdrop: drifting gradient orbs, a faded scientific grid and
 * faint molecule / DNA line-art. Pure CSS (transform-only animation), pointer-
 * events disabled, and hidden from assistive tech. Orbs use radial gradients —
 * not blur filters — so it stays cheap on low-end devices. On small screens
 * and with prefers-reduced-motion the animation stops.
 */
export function AnimatedBackground({ variant = 'app', className }: { variant?: 'app' | 'auth'; className?: string }) {
  if (!themeConfig.animatedBackground) return null;
  const orb = (color: string, extra: string) => (
    <div
      className={cn('absolute rounded-full', extra)}
      style={{ background: `radial-gradient(circle at center, hsl(var(${color}) / var(--bg-orb-opacity)) 0%, transparent 65%)` }}
    />
  );
  return (
    <div aria-hidden className={cn('no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
      {orb('--bg-orb-1', 'left-[-15vw] top-[-20vh] size-[70vw] max-md:animate-none md:animate-orb-1')}
      {orb('--bg-orb-2', 'right-[-20vw] top-[10vh] size-[60vw] max-md:animate-none md:animate-orb-2')}
      {variant === 'auth' && orb('--bg-orb-3', 'bottom-[-30vh] left-[20vw] size-[60vw] max-md:animate-none md:animate-orb-2')}

      {/* scientific grid, faded towards the edges */}
      <svg className="absolute inset-0 size-full" style={{ opacity: 'var(--bg-grid-opacity)' }}>
        <defs>
          <pattern id="jcl-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0H0V44" fill="none" stroke="hsl(var(--primary) / 0.10)" strokeWidth="1" />
          </pattern>
          <radialGradient id="jcl-grid-fade" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="jcl-grid-mask"><rect width="100%" height="100%" fill="url(#jcl-grid-fade)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#jcl-grid)" mask="url(#jcl-grid-mask)" />
      </svg>

      {/* molecule + DNA line art: login screen only — in the app it showed through glass cards and looked like overlapping content */}
      <svg className={cn('absolute right-[4vw] top-[14vh] hidden w-[260px] opacity-[0.25] lg:animate-float', variant === 'auth' && 'lg:block')} viewBox="0 0 200 160" fill="none">
        <g stroke="hsl(var(--primary))" strokeWidth="1.2">
          <path d="M30 80 L80 50 L130 80 L130 130 M80 50 L80 10 M130 80 L180 55" />
        </g>
        {[[30, 80], [80, 50], [130, 80], [130, 130], [80, 10], [180, 55]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 6 : 8} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        ))}
      </svg>
      <svg className={cn('absolute bottom-[6vh] left-[3vw] hidden h-[300px] opacity-[0.18]', variant === 'auth' && 'xl:block')} viewBox="0 0 60 300" fill="none">
        <path d="M10 0 C 50 37, 50 75, 10 112 C -30 150, 50 187, 10 225 C -30 262, 50 300, 10 300" stroke="hsl(var(--brand-3))" strokeWidth="1.4" />
        <path d="M50 0 C 10 37, 10 75, 50 112 C 90 150, 10 187, 50 225 C 90 262, 10 300, 50 300" stroke="hsl(var(--primary))" strokeWidth="1.4" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} x1="14" x2="46" y1={12 + i * 24} y2={12 + i * 24} stroke="hsl(var(--primary) / 0.6)" strokeWidth="1" />)}
      </svg>
    </div>
  );
}
