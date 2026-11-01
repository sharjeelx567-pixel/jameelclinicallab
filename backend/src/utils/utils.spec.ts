import { z } from 'zod';
import { buildSearchTokens, cnic, labDateKey, labDayStart, normalizeSearch, patchOf, pkMobile, text } from './index';

describe('patchOf', () => {
  it('does NOT apply defaults to omitted fields (unlike Zod 4 .partial())', () => {
    const schema = z.object({ enabled: z.boolean().default(false), name: z.string() });
    expect(schema.partial().parse({ name: 'x' })).toEqual({ enabled: false, name: 'x' });
    expect(patchOf(schema).parse({ name: 'x' })).toEqual({ name: 'x' });
  });
});

describe('input sanitisation', () => {
  it('strips control characters and trims', () => {
    expect(text(10).parse('  ab\u0000c ')).toBe('abc');
  });
  it('normalises Pakistani mobile numbers', () => {
    expect(pkMobile.parse('+92 300-1234567')).toBe('03001234567');
    expect(() => pkMobile.parse('12345')).toThrow();
  });
  it('formats CNIC', () => {
    expect(cnic.parse('3520212345671')).toBe('35202-1234567-1');
    expect(() => cnic.parse('123')).toThrow();
  });
});

describe('search tokens', () => {
  it('indexes prefixes of words and compact forms', () => {
    const tokens = buildSearchTokens('Ali Raza', '0300-1234567');
    expect(tokens).toEqual(expect.arrayContaining(['al', 'ali', 'ra', 'raza', '0300', '03001234567']));
    expect(tokens).toContain(normalizeSearch('0300 123'));
  });
});

describe('lab time zone helpers', () => {
  it('computes local day start for Asia/Karachi (UTC+5)', () => {
    const at = new Date('2026-03-10T21:30:00Z'); // 02:30 on 11 Mar in Karachi
    expect(labDateKey('Asia/Karachi', at)).toBe('2026-03-11');
    expect(labDayStart('Asia/Karachi', at).toISOString()).toBe('2026-03-10T19:00:00.000Z');
  });
});
