import type { ReferenceRange, TestParameter } from '../../common/entities';
import { flagValue, formatRange, selectRange } from './reference-range';

// NOTE: numbers below are arbitrary TEST FIXTURES, not clinical reference values.
const range = (r: Partial<ReferenceRange>): ReferenceRange => ({ id: Math.random().toString(36), gender: 'any', status: 'approved', ...r });
const param = (ranges: ReferenceRange[], extra: Partial<TestParameter> = {}): TestParameter => ({
  id: 'p1', name: 'Fixture', inputType: 'numeric', ranges, sortOrder: 0, ...extra,
});

describe('selectRange', () => {
  it('ignores draft (unapproved) ranges', () => {
    const p = param([range({ low: 1, high: 2, status: 'draft' })]);
    expect(selectRange(p, 'male', 30)).toBeUndefined();
  });

  it('prefers gender-specific over "any"', () => {
    const any = range({ low: 1, high: 10 });
    const female = range({ gender: 'female', low: 2, high: 9 });
    expect(selectRange(param([any, female]), 'female', 30)).toBe(female);
    expect(selectRange(param([any, female]), 'male', 30)).toBe(any);
  });

  it('applies age bands and picks the narrowest', () => {
    const adult = range({ ageMinYears: 18, low: 1, high: 5 });
    const child = range({ ageMinYears: 1, ageMaxYears: 12, low: 2, high: 6 });
    const p = param([adult, child]);
    expect(selectRange(p, 'male', 8)).toBe(child);
    expect(selectRange(p, 'male', 40)).toBe(adult);
    expect(selectRange(p, 'male', 15)).toBeUndefined();
  });
});

describe('flagValue', () => {
  const r = range({ low: 10, high: 20, criticalLow: 5, criticalHigh: 30 });
  const p = param([r]);
  it.each([
    ['15', 'normal'],
    ['9', 'low'],
    ['21', 'high'],
    ['5', 'critical_low'],
    ['31', 'critical_high'],
  ])('%s → %s', (value, flag) => expect(flagValue(p, value, r).flag).toBe(flag));

  it('returns no_range when no approved range exists (never invents one)', () => {
    expect(flagValue(param([]), '12', undefined).flag).toBe('no_range');
  });

  it('compares qualitative values case-insensitively', () => {
    const q = range({ text: 'Non-reactive' });
    const sp = param([q], { inputType: 'select', options: ['Reactive', 'Non-reactive'] });
    expect(flagValue(sp, 'non-reactive', q).flag).toBe('normal');
    expect(flagValue(sp, 'Reactive', q).flag).toBe('abnormal');
  });
});

describe('formatRange', () => {
  it('formats numeric and open-ended ranges', () => {
    expect(formatRange({ low: 1, high: 2 }, 'g/dL')).toBe('1 - 2 g/dL');
    expect(formatRange({ low: 1 })).toBe('>= 1');
    expect(formatRange(undefined)).toBe('');
  });
});
