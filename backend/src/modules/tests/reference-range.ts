import type { Gender, ReferenceRange, ResultFlag, TestParameter } from '../../common/entities';

/**
 * Picks the APPROVED reference range that applies to a patient. Draft ranges are
 * never used. If several match, the most specific (gender-specific, narrowest
 * age band) wins. Returns undefined when none is configured — the result is then
 * flagged `no_range` and printed without a range, never with an invented one.
 */
export function selectRange(param: TestParameter, gender: Gender, ageYears: number | undefined): ReferenceRange | undefined {
  const candidates = param.ranges.filter((r) => {
    if (r.status !== 'approved') return false;
    if (r.gender !== 'any' && r.gender !== gender) return false;
    if (ageYears === undefined) return r.ageMinYears === undefined && r.ageMaxYears === undefined;
    if (r.ageMinYears !== undefined && ageYears < r.ageMinYears) return false;
    if (r.ageMaxYears !== undefined && ageYears > r.ageMaxYears) return false;
    return true;
  });
  const span = (r: ReferenceRange) => (r.ageMaxYears ?? 200) - (r.ageMinYears ?? 0);
  return candidates.sort((a, b) => {
    const g = Number(b.gender !== 'any') - Number(a.gender !== 'any');
    return g !== 0 ? g : span(a) - span(b);
  })[0];
}

export function flagValue(param: TestParameter, value: string, range: ReferenceRange | undefined): { flag: ResultFlag; numericValue?: number } {
  if (param.inputType === 'numeric') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return { flag: 'abnormal' };
    if (!range) return { flag: 'no_range', numericValue };
    if (range.criticalLow !== undefined && numericValue <= range.criticalLow) return { flag: 'critical_low', numericValue };
    if (range.criticalHigh !== undefined && numericValue >= range.criticalHigh) return { flag: 'critical_high', numericValue };
    if (range.low !== undefined && numericValue < range.low) return { flag: 'low', numericValue };
    if (range.high !== undefined && numericValue > range.high) return { flag: 'high', numericValue };
    return { flag: 'normal', numericValue };
  }
  if (!range?.text) return { flag: 'no_range' };
  return { flag: textMatchesNormal(value, range.text) ? 'normal' : 'abnormal' };
}

export function formatRange(range: { low?: number; high?: number; text?: string } | undefined, unit?: string): string {
  if (!range) return '';
  if (range.text) return range.text;
  const u = unit ? ` ${unit}` : '';
  // ASCII-only: this string is printed with standard (WinAnsi) PDF fonts.
  if (range.low !== undefined && range.high !== undefined) return `${range.low} - ${range.high}${u}`;
  if (range.low !== undefined) return `>= ${range.low}${u}`;
  if (range.high !== undefined) return `<= ${range.high}${u}`;
  return '';
}

export const isCritical = (f: ResultFlag) => f === 'critical_low' || f === 'critical_high';

const ABSENT = new Set(['nil', 'none', 'notseen', 'absent', 'negative', 'notdetected', '0']);
const canon = (s: string) => s.trim().toLowerCase().replace(/[\s.]+/g, '');
const countRange = (s: string): [number, number] | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*$/i.exec(s) ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
};

/**
 * Text results against a text normal value: case/space-insensitive; "Pale Yellow / Yellow"
 * accepts either; "Nil", "Not seen", "Negative" are equivalent; a count such as "2-4" is
 * normal when it lies inside a normal like "0-5" (microscopy per HPF).
 */
export function textMatchesNormal(value: string, normal: string): boolean {
  const v = canon(value);
  if (!v) return false;
  for (const alt of normal.split(/\s+\/\s+/)) {
    const n = canon(alt);
    if (v === n || (ABSENT.has(v) && ABSENT.has(n))) return true;
    const nr = countRange(alt);
    if (nr) {
      if (ABSENT.has(v)) { if (nr[0] === 0) return true; continue; }
      const vr = countRange(value);
      if (vr && vr[0] >= nr[0] && vr[1] <= nr[1]) return true;
    }
  }
  return false;
}
