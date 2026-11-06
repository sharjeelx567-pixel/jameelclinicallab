import { cn } from '@/lib/utils';

export const BUNDLED_LOGO = '/brand/jcl-logo.png';

/**
 * The one logo shape used everywhere (app, bills, reports, cards, loader):
 * the image inside a white circle with a thin ring, whatever the source's shape.
 */
export function RoundLogo({ src = BUNDLED_LOGO, alt = '', className, onError }: { src?: string; alt?: string; className?: string; onError?: () => void }) {
  return (
    <span className={cn('relative inline-grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset / Cloudinary-resized; must print */}
      <img src={src} alt={alt} className="size-[84%] object-contain" onError={onError} draggable={false} />
    </span>
  );
}
