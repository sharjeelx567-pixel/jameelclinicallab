import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, type UploadApiErrorResponse, type UploadApiResponse } from 'cloudinary';
import { AppError } from '../../common/errors';
import { getEnv } from '../../config/env';

export interface ProviderUpload {
  publicId: string;
  secureUrl: string;
  version: number;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Image host abstraction. The production implementation is Cloudinary; tests
 * substitute a double. There is deliberately no "local fallback": when the
 * provider is not configured, uploads fail with MEDIA_NOT_CONFIGURED.
 */
export abstract class MediaProvider {
  abstract readonly configured: boolean;
  abstract readonly cloudName: string | undefined;
  abstract upload(buffer: Buffer, folder: string): Promise<ProviderUpload>;
  /** Idempotent: deleting an asset that no longer exists is not an error. */
  abstract destroy(publicId: string): Promise<void>;
}

const notConfigured = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'MEDIA_NOT_CONFIGURED',
    'Image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the server.',
  );

function providerError(err: unknown): AppError {
  const e = err as Partial<UploadApiErrorResponse> & { error?: { http_code?: number; message?: string } };
  const status = e.http_code ?? e.error?.http_code;
  const message = e.message ?? e.error?.message ?? 'unknown error';
  if (status === 401 || status === 403)
    return new AppError(HttpStatus.BAD_GATEWAY, 'MEDIA_PROVIDER_AUTH', 'Cloudinary rejected the server credentials. Check the Cloudinary settings in backend/.env.');
  if (status === 420 || status === 429)
    return new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'MEDIA_QUOTA', 'The Cloudinary plan limit has been reached. Try again later or review the plan usage.');
  return new AppError(HttpStatus.BAD_GATEWAY, 'MEDIA_PROVIDER_ERROR', `Image upload service error: ${message}`);
}

@Injectable()
export class CloudinaryProvider extends MediaProvider {
  private readonly logger = new Logger('Cloudinary');
  readonly configured: boolean;
  readonly cloudName: string | undefined;

  constructor() {
    super();
    const env = getEnv();
    this.cloudName = env.CLOUDINARY_CLOUD_NAME || undefined;
    this.configured = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    if (this.configured)
      cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  }

  upload(buffer: Buffer, folder: string): Promise<ProviderUpload> {
    if (!this.configured) return Promise.reject(notConfigured());
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          type: 'upload',
          unique_filename: true,
          use_filename: false,
          overwrite: false,
          allowed_formats: ['jpg', 'png', 'webp'],
          // Incoming transformation: cap stored size to save plan credits.
          transformation: [{ width: 2400, height: 2400, crop: 'limit' }],
        },
        (err?: UploadApiErrorResponse, res?: UploadApiResponse) => {
          if (err || !res) return reject(providerError(err));
          resolve({ publicId: res.public_id, secureUrl: res.secure_url, version: res.version, format: res.format, width: res.width, height: res.height, bytes: res.bytes });
        },
      );
      stream.end(buffer);
    });
  }

  async destroy(publicId: string): Promise<void> {
    if (!this.configured) throw notConfigured();
    let res: { result?: string };
    try {
      res = (await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })) as { result?: string };
    } catch (err) {
      throw providerError(err);
    }
    if (res.result !== 'ok' && res.result !== 'not found') {
      this.logger.warn(`destroy ${publicId}: ${res.result}`);
      throw new AppError(HttpStatus.BAD_GATEWAY, 'MEDIA_PROVIDER_ERROR', `Could not delete the image from Cloudinary (${res.result ?? 'no result'})`);
    }
  }
}

/** Inserts a Cloudinary delivery transformation into a secure_url. */
export function transformUrl(secureUrl: string, transformation: string): string {
  return secureUrl.replace('/image/upload/', `/image/upload/${transformation}/`);
}
