/**
 * Cloudinary delivery helpers. The browser only ever sees the public
 * secure_url returned by our backend; the API key/secret never reach it.
 */

export interface ImageTransform {
  width?: number;
  height?: number;
  crop?: 'limit' | 'fill' | 'fit' | 'thumb';
  /** Face-aware cropping for portraits. */
  gravity?: 'auto' | 'face';
  quality?: number | 'auto';
}

const CLOUDINARY_HOST = 'https://res.cloudinary.com/';
export const isCloudinaryUrl = (url: string) => url.startsWith(CLOUDINARY_HOST) && url.includes('/image/upload/');

/** Adds f_auto (WebP/AVIF where supported), q_auto and sizing to a secure_url. */
export function optimizedImageUrl(secureUrl: string, t: ImageTransform = {}): string {
  if (!isCloudinaryUrl(secureUrl)) return secureUrl;
  const parts = ['f_auto', `q_${t.quality ?? 'auto'}`];
  if (t.width) parts.push(`w_${Math.round(t.width)}`);
  if (t.height) parts.push(`h_${Math.round(t.height)}`);
  if (t.width || t.height) parts.push(`c_${t.crop ?? 'limit'}`);
  if (t.gravity && (t.crop === 'fill' || t.crop === 'thumb')) parts.push(`g_${t.gravity}`);
  return secureUrl.replace('/image/upload/', `/image/upload/${parts.join(',')}/`);
}

/** next/image loader: lets Next pick responsive widths while Cloudinary does the resizing. */
export const cloudinaryLoader = ({ src, width, quality }: { src: string; width: number; quality?: number }) =>
  optimizedImageUrl(src, { width, quality: quality ?? 'auto' });
