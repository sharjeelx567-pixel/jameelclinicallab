import { orderedParameters, parameterSections } from './sections';

const p = (id: string, name: string, sortOrder: number, section?: string) => ({ id, name, sortOrder, section });

describe('parameterSections', () => {
  it('adds PATIENT / DONOR / SCREENING REPORT automatically for a cross match', () => {
    const s = parameterSections([
      p('a', 'Patient Name', 0), p('b', 'Blood Group', 1), p('c', 'Donor Name', 2), p('d', 'Blood Group', 3),
      p('e', 'HBsAg', 4), p('f', 'Anti HCV', 5), p('g', 'Cross Matching', 6),
    ]);
    expect(Object.fromEntries(s)).toEqual({ a: 'Patient', c: 'Donor', e: 'Screening Report' });
  });

  it('shows a Cross Matching row saved last under DONOR', () => {
    const ids = orderedParameters([
      p('a', 'Patient Name', 0), p('c', 'Donor Name', 1), p('d', 'Rh Factor', 2),
      p('e', 'HBsAg', 3), p('f', 'VDRL', 4), p('g', 'Cross Matching', 5),
    ]).map((x) => x.id);
    expect(ids).toEqual(['a', 'c', 'd', 'g', 'e', 'f']);
  });

  it('uses headings typed in the editor and adds nothing else', () => {
    const s = parameterSections([p('a', 'Patient Name', 0, 'Recipient'), p('c', 'Donor Name', 1)]);
    expect(Object.fromEntries(s)).toEqual({ a: 'Recipient' });
  });

  it('adds nothing to ordinary tests', () => {
    expect(parameterSections([p('a', 'Hemoglobin', 0), p('b', 'HIV', 1)]).size).toBe(0);
  });
});
