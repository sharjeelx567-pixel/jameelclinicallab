import { describe, expect, it } from 'vitest';
import { cloudinaryLoader, optimizedImageUrl } from '@/lib/cloudinary';

const URL = 'https://res.cloudinary.com/demo/image/upload/v1712/laboratory/gallery/abc.png';

describe('optimizedImageUrl', () => {
  it('adds automatic format and quality', () => {
    expect(optimizedImageUrl(URL)).toBe('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1712/laboratory/gallery/abc.png');
  });

  it('adds sizing, crop and face gravity for portraits', () => {
    expect(optimizedImageUrl(URL, { width: 64, height: 64, crop: 'thumb', gravity: 'face' })).toContain('/upload/f_auto,q_auto,w_64,h_64,c_thumb,g_face/v1712/');
  });

  it('leaves non-Cloudinary URLs untouched', () => {
    expect(optimizedImageUrl('/images/local.png', { width: 10 })).toBe('/images/local.png');
  });

  it('works as a next/image loader', () => {
    expect(cloudinaryLoader({ src: URL, width: 640 })).toContain('/upload/f_auto,q_auto,w_640,c_limit/');
  });
});
