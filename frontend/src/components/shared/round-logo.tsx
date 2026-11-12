import { cn } from '@/lib/utils';

/** The laboratory logo already drawn as a full circle (the whole logo fits inside). */
export const BUNDLED_LOGO = '/brand/jcl-logo-round.png';
/** Same logo in solid dark tones: colour logos print pale grey on black-and-white printers. */
export const BUNDLED_LOGO_PRINT = '/brand/jcl-logo-round-print.png';

/**
 * The one logo shape used everywhere (app, bills, reports, cards, loader): a circle.
 * The bundled round logo fills it; any other (uploaded) image is fitted inside whole.
 * `glow` adds an animated, glowing colour ring (screen only, never printed).
 */
export function RoundLogo({ src = BUNDLED_LOGO, alt = '', className, onError, glow }: { src?: string; alt?: string; className?: string; onError?: () => void; glow?: boolean }) {
  const filled = src === BUNDLED_LOGO;
  return (
    <span className={cn('relative inline-grid size-9 shrink-0 place-items-center rounded-full', className)}>
      {glow && <span className="logo-glow-ring pointer-events-none absolute -inset-[3px] rounded-full print:hidden" aria-hidden />}
      <span className={cn('relative grid size-full place-items-center overflow-hidden rounded-full bg-white print:shadow-none', glow ? 'shadow-md' : 'shadow-sm ring-1 ring-slate-200')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset / Cloudinary-resized; must print */}
        <img src={src} alt={alt} className={cn(filled ? 'size-full object-cover' : 'size-[70%] object-contain', filled && 'print:hidden')} onError={onError} draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element -- print-only copy of the static brand asset */}
        {filled && <img src={BUNDLED_LOGO_PRINT} alt="" aria-hidden className="hidden size-full object-cover print:block" draggable={false} />}
      </span>
    </span>
  );
}
