import type { ResultFlag } from '@/types';

export interface ApprovedRange {
  low?: number;
  high?: number;
  text?: string;
  criticalLow?: number;
  criticalHigh?: number;
}

/**
 * Instant on-screen preview while typing. The AUTHORITATIVE flag is computed by
 * the server on save, from the approved catalogue range — never from this function.
 */
export function previewFlag(inputType: 'numeric' | 'text' | 'select', value: string, range: ApprovedRange | null): ResultFlag | null {
  if (value.trim() === '') return null;
  if (inputType === 'numeric') {
    if (!/^[-+]?\d+(\.\d+)?$/.test(value.trim())) return 'abnormal';
    const n = Number(value);
    if (!range) return 'no_range';
    if (range.criticalLow !== undefined && n <= range.criticalLow) return 'critical_low';
    if (range.criticalHigh !== undefined && n >= range.criticalHigh) return 'critical_high';
    if (range.low !== undefined && n < range.low) return 'low';
    if (range.high !== undefined && n > range.high) return 'high';
    return 'normal';
  }
  if (!range?.text) return 'no_range';
  const lines = range.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines.some((l) => textMatchesNormal(value, l)) ? 'normal' : 'no_range';
  return textMatchesNormal(value, range.text) ? 'normal' : 'abnormal';
}

const ABSENT = new Set(['nil', 'none', 'notseen', 'absent', 'negative', 'notdetected', '0']);
const canon = (s: string) => s.trim().toLowerCase().replace(/[\s.]+/g, '');
const countRange = (s: string): [number, number] | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*$/i.exec(s) ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
};

/** Same rule as the server: "Nil"/"Not seen"/"Negative" are equivalent, "A / B" accepts either, "2-4" lies within "0-5". */
export function textMatchesNormal(value: string, normal: string): boolean {
  const v = canon(value);
  if (!v) return false;
  for (const alt of normal.split(/\s+\/\s+/)) {
    const n = canon(alt);
    if (v === n || (ABSENT.has(v) && ABSENT.has(n))) return true;
    const nr = countRange(alt);
    if (nr) {
      if (ABSENT.has(v)) {
        if (nr[0] === 0) return true;
        continue;
      }
      const vr = countRange(value);
      if (vr && vr[0] >= nr[0] && vr[1] <= nr[1]) return true;
    }
  }
  return false;
}

export function rangeText(range: ApprovedRange | null | undefined, unit?: string): string {
  if (!range) return '';
  if (range.text) return range.text;
  const u = unit ? ` ${unit}` : '';
  if (range.low !== undefined && range.high !== undefined) return `${range.low} – ${range.high}${u}`;
  if (range.low !== undefined) return `≥ ${range.low}${u}`;
  if (range.high !== undefined) return `≤ ${range.high}${u}`;
  return '';
}
