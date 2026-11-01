import { cn } from '@/lib/utils';

/**
 * Original vector illustrations (no third-party image licensing). Colours come
 * from theme tokens, so they follow re-branding and light/dark mode.
 */

/** Hero scene: microscope, sample tubes in a rack, a blood-cell cluster and a diagnostic waveform. */
export function LabHeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 320" className={cn('h-auto w-full', className)} role="img" aria-label="Laboratory illustration: microscope and sample tubes">
      <defs>
        <linearGradient id="lh-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--brand-3))" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="lh-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="lh-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--highlight))" />
          <stop offset="100%" stopColor="hsl(0 75% 48%)" />
        </linearGradient>
        <radialGradient id="lh-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="210" cy="170" rx="200" ry="150" fill="url(#lh-halo)" />
      {/* bench */}
      <rect x="20" y="268" width="380" height="10" rx="5" fill="hsl(var(--foreground))" opacity="0.12" />

      {/* microscope */}
      <g className="origin-bottom" transform="translate(70 70)">
        <rect x="10" y="186" width="120" height="14" rx="7" fill="url(#lh-metal)" />
        <rect x="58" y="150" width="20" height="40" rx="4" fill="url(#lh-metal)" />
        <path d="M68 150 C 30 140, 22 90, 48 60" stroke="url(#lh-metal)" strokeWidth="14" fill="none" strokeLinecap="round" />
        <rect x="26" y="126" width="84" height="8" rx="4" fill="hsl(var(--foreground))" opacity="0.7" />
        <g transform="rotate(-28 70 40)">
          <rect x="55" y="-10" width="28" height="90" rx="8" fill="url(#lh-metal)" />
          <rect x="60" y="-26" width="18" height="20" rx="4" fill="hsl(var(--primary))" />
          <rect x="62" y="80" width="14" height="22" rx="3" fill="hsl(var(--foreground))" opacity="0.8" />
        </g>
        <circle cx="96" cy="138" r="10" fill="hsl(var(--primary))" opacity="0.8" />
      </g>

      {/* tube rack */}
      <g transform="translate(220 150)">
        <rect x="0" y="80" width="170" height="38" rx="8" fill="url(#lh-glass)" stroke="hsl(var(--primary) / 0.5)" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${18 + i * 38} 0)`}>
            <rect x="0" y={i % 2 ? 6 : 0} width="20" height={100 - (i % 2 ? 6 : 0)} rx="10" fill="hsl(var(--background))" fillOpacity="0.4" stroke="hsl(var(--foreground) / 0.5)" strokeWidth="1.5" />
            <rect x="2" y={44 + i * 4} width="16" height={52 - i * 4} rx="8" fill={i === 1 ? 'hsl(var(--primary))' : i === 3 ? 'hsl(var(--warning))' : 'url(#lh-liquid)'} opacity="0.85" />
            <rect x="-2" y={i % 2 ? 0 : -6} width="24" height="10" rx="3" fill={['hsl(268 70% 60%)', 'hsl(var(--warning))', 'hsl(var(--primary))', 'hsl(0 0% 70%)'][i]} />
          </g>
        ))}
      </g>

      {/* blood cells */}
      <g transform="translate(330 60)" opacity="0.9">
        {[[0, 0, 18], [30, 18, 13], [8, 34, 11]].map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="hsl(0 70% 52%)" opacity="0.75" />
            <circle cx={x} cy={y} r={r * 0.45} fill="hsl(0 70% 38%)" opacity="0.6" />
          </g>
        ))}
      </g>

      {/* waveform */}
      <path d="M210 70 L240 70 L250 50 L262 96 L274 36 L286 82 L296 70 L320 70" stroke="hsl(var(--primary))" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="320" cy="70" r="4" fill="hsl(var(--primary))" />
    </svg>
  );
}

/** Compact illustration for empty states: a clean test tube with sparkles. */
export function EmptyTubeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={cn('size-20', className)} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="hsl(var(--primary) / 0.08)" />
      <rect x="38" y="14" width="20" height="62" rx="10" fill="hsl(var(--background))" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2" />
      <rect x="34" y="10" width="28" height="9" rx="3" fill="hsl(var(--primary))" />
      <rect x="40.5" y="52" width="15" height="21" rx="7.5" fill="hsl(var(--primary) / 0.35)" />
      <path d="M74 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="hsl(var(--highlight))" />
      <path d="M20 58 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="hsl(var(--brand-3))" />
    </svg>
  );
}
