'use client';

import * as React from 'react';
import { LogoMark } from '@/components/shared/logo';
import { optimizedImageUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { settingsService } from '@/services/admin.service';
import type { MediaRef } from '@/types';

let logoPromise: Promise<MediaRef | null> | null = null;

/** The laboratory's uploaded logo (Cloudinary), or the built-in mark when none is set. */
export function LabLogoMark({ className }: { className?: string }) {
  const [logo, setLogo] = React.useState<MediaRef | null>(null);
  const [failed, setFailed] = React.useState(false);
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
  if (!logo || failed) return <LogoMark className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- printed documents; Cloudinary resizes
    <img src={optimizedImageUrl(logo.secureUrl, { width: 240, height: 240, crop: 'fit' })} alt="" className={cn('size-9 object-contain', className)} onError={() => setFailed(true)} />
  );
}
