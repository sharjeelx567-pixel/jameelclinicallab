'use client';

import * as React from 'react';
import { LogoMark } from '@/components/shared/logo';
import { optimizedImageUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { settingsService } from '@/services/admin.service';
import type { MediaRef } from '@/types';

let logoPromise: Promise<MediaRef | null> | null = null;
export const BUNDLED_LOGO = '/brand/jcl-logo.png';

/** The laboratory logo: the one uploaded in Settings (Cloudinary), else the bundled logo file. */
export function LabLogoMark({ className, alt = '' }: { className?: string; alt?: string }) {
  const [logo, setLogo] = React.useState<MediaRef | null>(null);
  const [failed, setFailed] = React.useState<false | 'uploaded' | 'all'>(false);
  React.useEffect(() => {
    logoPromise ??= settingsService.reference().then((r) => r.logo ?? null, () => {
      logoPromise = null;
      return null;
    });
    let live = true;
    void logoPromise.then((l) => live && setLogo(l));
    return () => {
      live = false;
    };
  }, []);
  if (failed === 'all') return <LogoMark className={className} />;
  // Uploaded logo (Settings) wins; otherwise the laboratory logo shipped with the app.
  const src = logo && !failed ? optimizedImageUrl(logo.secureUrl, { width: 320, height: 320, crop: 'fit' }) : BUNDLED_LOGO;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- printed documents; Cloudinary resizes
    <img src={src} alt={alt} className={cn('size-9 object-contain', className)} onError={() => setFailed(src === BUNDLED_LOGO ? 'all' : 'uploaded')} />
  );
}
