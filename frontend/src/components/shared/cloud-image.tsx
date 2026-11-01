'use client';

import Image, { type ImageProps } from 'next/image';
import * as React from 'react';
import { cloudinaryLoader, optimizedImageUrl } from '@/lib/cloudinary';
import { cn, initials } from '@/lib/utils';
import type { MediaRef } from '@/types';

/** Optimised Cloudinary image (automatic format, quality and responsive width). */
export function CloudImage({ src, alt, ...props }: Omit<ImageProps, 'loader' | 'src'> & { src: string }) {
  return <Image loader={cloudinaryLoader} src={src} alt={alt} {...props} />;
}

/** Round portrait with initials fallback (staff, doctors). */
export function Avatar({ photo, name, size = 32, className }: { photo?: MediaRef | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [photo?.secureUrl]);
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground', className)} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}>
      {photo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size thumbnail; Cloudinary does the resizing
        <img src={optimizedImageUrl(photo.secureUrl, { width: size * 2, height: size * 2, crop: 'thumb', gravity: 'face' })} alt="" width={size} height={size} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
