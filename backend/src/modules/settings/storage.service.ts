import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppError, badRequest } from '../../common/errors';
import { FirebaseService } from '../../firebase/firebase.service';

export interface UploadedBinary {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Magic-number check so a renamed executable can't be uploaded as an image/PDF. */
export function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/**
 * Firebase Storage uploads. Files are private (no public URLs); the API serves
 * them only to authorised users. If no bucket is configured, uploads are
 * reported as not configured rather than silently stored elsewhere.
 */
@Injectable()
export class StorageService {
  constructor(private readonly firebase: FirebaseService) {}

  async upload(file: UploadedBinary | undefined, folder: string, allowed: string[]): Promise<string> {
    if (!file) throw badRequest('FILE_REQUIRED', 'Please choose a file to upload');
    const detected = sniff(file.buffer);
    if (!detected || !allowed.includes(detected) || detected !== file.mimetype)
      throw badRequest('FILE_TYPE', `Allowed file types: ${allowed.join(', ')}`);

    const bucket = this.firebase.bucket;
    if (!bucket)
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'STORAGE_NOT_CONFIGURED', 'File storage is not configured (FIREBASE_STORAGE_BUCKET).');

    const path = `${folder}/${Date.now()}-${randomBytes(6).toString('hex')}.${EXT[detected]}`;
    await bucket.file(path).save(file.buffer, { contentType: detected, resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
    return path;
  }

  async download(path: string): Promise<Buffer> {
    const bucket = this.firebase.bucket;
    if (!bucket) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'STORAGE_NOT_CONFIGURED', 'File storage is not configured.');
    const [buf] = await bucket.file(path).download();
    return buf;
  }
}
