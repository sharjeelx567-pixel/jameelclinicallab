/**
 * LIVE Cloudinary check — performs a real upload, optimised delivery and delete
 * using the credentials in backend/.env. Nothing is simulated.
 *
 *   npm run test:cloudinary
 *
 * It uploads one small generated test image (no patient data) to
 * <prefix>/website/illustrations, then deletes it again.
 */
import 'reflect-metadata';
import { deflateSync } from 'node:zlib';
import { loadDotEnv } from '../config/load-dotenv';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A real 64×64 RGB PNG (blue→teal gradient). */
function testPng(): Buffer {
  const size = 64;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) row.set([20, 120 + x * 2, 200 + Math.floor(y / 2)], 1 + x * 3);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

async function run() {
  loadDotEnv();
  const { getEnv } = await import('../config/env');
  const { CloudinaryProvider, transformUrl } = await import('../modules/media/media-provider');
  const { v2: cloudinary } = await import('cloudinary');

  const provider = new CloudinaryProvider();
  if (!provider.configured) {
    console.error('✗ Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env');
    process.exit(2);
  }
  const step = (s: string) => process.stdout.write(`✓ ${s}\n`);

  await cloudinary.api.ping();
  step(`credentials accepted for cloud "${provider.cloudName}"`);

  const prefix = getEnv().CLOUDINARY_FOLDER_PREFIX.replace(/^\/+|\/+$/g, '');
  const folder = prefix ? `${prefix}/website/illustrations` : 'website/illustrations';
  const up = await provider.upload(testPng(), folder);
  step(`uploaded ${up.publicId} (${up.width}x${up.height} ${up.format}, ${up.bytes} bytes)`);
  if (!up.secureUrl.startsWith('https://res.cloudinary.com/')) throw new Error(`unexpected secure_url ${up.secureUrl}`);

  try {
    const optimised = transformUrl(up.secureUrl, 'f_auto,q_auto,w_32,c_limit');
    const res = await fetch(optimised, { headers: { Accept: 'image/webp,image/*' } });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw new Error(`delivery failed: HTTP ${res.status} ${res.headers.get('content-type')}`);
    step(`optimised delivery OK (${res.headers.get('content-type')}, ${(await res.arrayBuffer()).byteLength} bytes)`);
  } finally {
    await provider.destroy(up.publicId);
  }

  const gone = await cloudinary.api.resource(up.publicId).then(
    () => false,
    (e: { error?: { http_code?: number } }) => e.error?.http_code === 404,
  );
  if (!gone) throw new Error('asset still exists after delete');
  step('deleted again and confirmed removed');
  process.stdout.write('\nCloudinary integration: COMPLETED AND TESTED against the live account.\n');
}

run().catch((err: unknown) => {
  const e = err as { message?: string; error?: { message?: string; http_code?: number } };
  console.error(`✗ ${e.message ?? e.error?.message ?? String(err)}${e.error?.http_code ? ` (HTTP ${e.error.http_code})` : ''}`);
  process.exit(1);
});
