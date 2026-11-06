import { describe, expect, it } from 'vitest';
import { amountInWords } from '@/lib/amount-words';
import { parseCsv } from '@/lib/csv';

describe('amountInWords (Pakistani numbering)', () => {
  it('writes bill totals in words', () => {
    expect(amountInWords(2000)).toBe('TWO THOUSAND ONLY');
    expect(amountInWords(600)).toBe('SIX HUNDRED ONLY');
    expect(amountInWords(1450)).toBe('ONE THOUSAND FOUR HUNDRED FIFTY ONLY');
    expect(amountInWords(160000)).toBe('ONE LAKH SIXTY THOUSAND ONLY');
    expect(amountInWords(12_345_678)).toBe('ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT ONLY');
    expect(amountInWords(0)).toBe('ZERO ONLY');
  });
});

describe('parseCsv', () => {
  it('reads quoted fields, BOM and CRLF', () => {
    expect(parseCsv('﻿code,name,price\r\n1300,"Blood Complete Examination { CBC }",600\r\n4103,"Thyroid, ""TSH""",1400\r\n')).toEqual([
      ['code', 'name', 'price'],
      ['1300', 'Blood Complete Examination { CBC }', '600'],
      ['4103', 'Thyroid, "TSH"', '1400'],
    ]);
  });
  it('keeps a stray quote inside a value instead of joining the next rows', () => {
    expect(parseCsv('code,name,sample\n1,Swab 5" long,Pus\n2,CBC,Blood\n')).toEqual([
      ['code', 'name', 'sample'],
      ['1', 'Swab 5" long', 'Pus'],
      ['2', 'CBC', 'Blood'],
    ]);
  });
});

describe('errorMessage', () => {
  it('names the file row of a validation problem', async () => {
    const { ApiError, errorMessage } = await import('@/lib/api-client');
    const err = new ApiError(400, 'VALIDATION_FAILED', 'Some fields are invalid', [{ path: 'rows.295.sample', message: 'sample is longer than 200 characters' }]);
    expect(errorMessage(err)).toBe('Some fields are invalid: Row 297 of the file (sample) — sample is longer than 200 characters');
  });
});
