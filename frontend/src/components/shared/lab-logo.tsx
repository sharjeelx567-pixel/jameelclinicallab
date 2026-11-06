'use client';

import * as React from 'react';
import { BUNDLED_LOGO, RoundLogo } from '@/components/shared/round-logo';
import { useAuth } from '@/features/auth/auth-provider';
import { optimizedImageUrl } from '@/lib/cloudinary';
import { settingsService } from '@/services/admin.service';
import type { MediaRef } from '@/types';

let logoPromise: Promise<MediaRef | null> | null = null;
export { BUNDLED_LOGO };

/** The laboratory logo: the one uploaded in Settings (Cloudinary), else the bundled logo file. */
export function LabLogoMark({ className, alt = '' }: { className?: string; alt?: string }) {
  const [logo, setLogo] = React.useState<MediaRef | null>(null);
  const [failed, setFailed] = React.useState<false | 'uploaded' | 'all'>(false);
  const { status } = useAuth();
  React.useEffect(() => {
    if (status !== 'authenticated') return; // sign-in page: bundled logo, no API call
    logoPromise ??= settingsService.reference().then((r) => r.logo ?? null, () => {
      logoPromise = null;
      return null;
    });
    let live = true;
    void logoPromise.then((l) => live && setLogo(l));
    return () => {
      live = false;
    };
  }, [status]);
  // Uploaded logo (Settings) wins; otherwise the laboratory logo shipped with the app.
  const src = logo && !failed ? optimizedImageUrl(logo.secureUrl, { width: 320, height: 320, crop: 'fit' }) : BUNDLED_LOGO;
  return <RoundLogo src={src} alt={alt} className={className} onError={() => setFailed(src === BUNDLED_LOGO ? 'all' : 'uploaded')} />;
}
