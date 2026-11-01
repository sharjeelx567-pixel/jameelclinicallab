import { patientSchema, toPatientInput } from '@/components/patients/patient-form';
import { csvCell, toCsv } from '@/lib/csv';
import { previewFlag, rangeText } from '@/lib/flags';

// Numbers below are arbitrary TEST FIXTURES, not clinical reference values.
describe('previewFlag', () => {
  const range = { low: 10, high: 20, criticalLow: 5, criticalHigh: 30 };
  it.each([
    ['15', 'normal'],
    ['9', 'low'],
    ['21', 'high'],
    ['4', 'critical_low'],
    ['31', 'critical_high'],
    ['abc', 'abnormal'],
  ])('%s → %s', (v, f) => expect(previewFlag('numeric', v, range)).toBe(f));

  it('never invents a range', () => {
    expect(previewFlag('numeric', '12', null)).toBe('no_range');
    expect(previewFlag('numeric', '', range)).toBeNull();
  });

  it('formats ranges', () => {
    expect(rangeText({ low: 1, high: 2 }, 'g/dL')).toBe('1 – 2 g/dL');
    expect(rangeText({ text: 'Negative' })).toBe('Negative');
  });
});

describe('CSV export', () => {
  it('neutralises formula injection and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+92300')).toBe("'+92300");
    expect(toCsv([{ a: 'x,y', b: 2 }])).toBe('a,b\r\n"x,y",2');
  });
});

describe('patient form validation', () => {
  const base = { name: 'Test Patient', gender: 'female' as const, mobile: '0300-1234567' };

  it('requires age or date of birth', () => {
    const r = patientSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.includes('ageYears'))).toBe(true);
  });

  it('rejects invalid mobile and CNIC formats with helpful messages', () => {
    const r = patientSchema.safeParse({ ...base, ageYears: 30, mobile: '12345', cnic: '123' });
    expect(r.success).toBe(false);
    const messages = r.error!.issues.map((i) => i.message).join(' ');
    expect(messages).toMatch(/mobile/i);
    expect(messages).toMatch(/CNIC/);
  });

  it('rejects a future date of birth', () => {
    const r = patientSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' });
    expect(r.success).toBe(false);
  });

  it('maps form values to the API payload, dropping empty strings', () => {
    const r = patientSchema.parse({ ...base, ageYears: '42', cnic: '', email: '', district: 'Lahore' });
    const input = toPatientInput(r);
    expect(input).toMatchObject({ name: 'Test Patient', ageYears: 42, address: { district: 'Lahore' } });
    expect(input.cnic).toBeUndefined();
    expect(input.email).toBeUndefined();
  });
});
