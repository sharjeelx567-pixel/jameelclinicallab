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
  return value.trim().toLowerCase() === range.text.trim().toLowerCase() ? 'normal' : 'abnormal';
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
