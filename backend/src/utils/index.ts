import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { C, TransactionContext } from '../database/data-store';

// ─── Input sanitisation helpers (used inside Zod schemas) ────────────────────

/** Trimmed, control-character-free text with a maximum length. */
export const text = (max = 200) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().max(max));

export const requiredText = (max = 200) => text(max).pipe(z.string().min(1, 'Required'));
export const optionalText = (max = 200) => text(max).optional();
export const money = z.number().finite().min(0).max(10_000_000);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const docId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid identifier');

/** Pakistan mobile: 03XXXXXXXXX or +923XXXXXXXXX. Normalised to 03XXXXXXXXX. */
export const pkMobile = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+92|0)3\d{9}$/, 'Enter a valid mobile number, e.g. 03001234567'))
  .transform((s) => (s.startsWith('+92') ? `0${s.slice(3)}` : s));

/** CNIC: 13 digits, stored as XXXXX-XXXXXXX-X. */
export const cnic = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{13}$/, 'CNIC must contain 13 digits'))
  .transform((s) => `${s.slice(0, 5)}-${s.slice(5, 12)}-${s.slice(12)}`);

/**
 * PATCH schema: every field optional and defaults REMOVED. (Zod 4's `.partial()`
 * still applies `.default()` values, which would silently reset omitted fields.)
 */
export function patchOf<S extends z.ZodObject>(schema: S): z.ZodType<Partial<z.output<S>>, Partial<z.input<S>>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const t = field as z.ZodType;
      const inner = t instanceof z.ZodDefault ? (t.unwrap() as z.ZodType) : t;
      return [key, inner.optional()];
    }),
  );
  return z.object(shape) as unknown as z.ZodType<Partial<z.output<S>>, Partial<z.input<S>>>;
}

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(64).optional(),
});

// ─── Search tokens ───────────────────────────────────────────────────────────
// Firestore has no full-text search. We store lowercase prefixes of key fields
// in `searchTokens` and query with `array-contains`. Adequate for MR number,
// names, mobile and CNIC lookups at single-laboratory scale.

export function buildSearchTokens(...values: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = value.toLowerCase().trim();
    const words = normalized.split(/[\s,.-]+/).filter(Boolean);
    const compact = normalized.replace(/[\s-]/g, '');
    for (const word of [...words, compact]) {
      for (let i = 2; i <= Math.min(word.length, 20); i++) tokens.add(word.slice(0, i));
    }
  }
  return [...tokens].slice(0, 300);
}

export const normalizeSearch = (q: string) => q.toLowerCase().trim().replace(/[\s-]/g, '').slice(0, 20);

// ─── Sequences ───────────────────────────────────────────────────────────────

/**
 * Atomically reserves `count` numbers from each counters/{name} within the
 * caller's transaction. All counter READS happen before any WRITE, satisfying
 * Firestore's transaction rule — call this before other tx writes.
 */
export async function reserveSequences<K extends string>(
  tx: TransactionContext,
  request: Record<K, number>,
): Promise<Record<K, number[]>> {
  const names = Object.keys(request) as K[];
  const current = await Promise.all(names.map((n) => tx.get<{ id: string; value: number }>(C.counters, n)));
  const out = {} as Record<K, number[]>;
  names.forEach((name, i) => {
    const start = current[i]?.value ?? 0;
    const count = request[name];
    out[name] = Array.from({ length: count }, (_, k) => start + k + 1);
    if (count > 0) tx.set(C.counters, name, { value: start + count });
  });
  return out;
}

export async function nextSequence(tx: TransactionContext, name: string): Promise<number> {
  return (await reserveSequences(tx, { [name]: 1 }))[name][0];
}

export const pad = (n: number, width = 6) => String(n).padStart(width, '0');

export function yearCode(iso: string): string {
  return iso.slice(2, 4);
}

// ─── Crypto ──────────────────────────────────────────────────────────────────

export const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Unambiguous uppercase code (no 0/O/1/I) for report verification. */
export function verificationCode(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Shallow diff for audit trails. */
export function diff(before: object, after: object): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  for (const key of Object.keys(a)) {
    if (['updatedAt', 'searchTokens'].includes(key)) continue;
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) changes[key] = { from: b[key], to: a[key] };
  }
  return changes;
}

function tzParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** UTC instant at which the local calendar day (in the laboratory's time zone) begins. */
export function labDayStart(timeZone: string, date = new Date()): Date {
  const { y, m, d } = tzParts(timeZone, date);
  const guess = Date.UTC(y, m - 1, d);
  const p = tzParts(timeZone, new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess;
  return new Date(guess - offset);
}

/** Local YYYY-MM-DD for an instant in the laboratory's time zone. */
export function labDateKey(timeZone: string, date: Date): string {
  const { y, m, d } = tzParts(timeZone, date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageInYears(dob: string, at = new Date()): number {
  const birth = new Date(`${dob}T00:00:00Z`);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const m = at.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < birth.getUTCDate())) age--;
  return Math.max(0, age);
}
