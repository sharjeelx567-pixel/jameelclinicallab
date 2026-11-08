import type { TestDoc, TestParameter } from '../../common/entities';
import { RangeImportRow } from './rate-list';
import { flagValue, formatRange, textMatchesNormal } from './reference-range';
import { buildParameters, panelFor, planPanels, STANDARD_PANELS } from './standard-panels';

const single = (code: string, name: string, extra: Partial<TestDoc> = {}): TestDoc =>
  ({ id: `t-${code}`, code, name, parameters: [{ id: 'r', name: 'Result', inputType: 'text', ranges: [], sortOrder: 0 }], ...extra }) as unknown as TestDoc;
const p = (name: string): TestParameter => ({ id: name, name, inputType: 'numeric', ranges: [], sortOrder: 0 });
let n = 0;
const newId = () => `id${++n}`;

describe('standard panels', () => {
  it('finds panels by code and by name', () => {
    expect(panelFor({ code: '1100', name: 'anything' })?.key).toBe('urine-ce');
    expect(panelFor({ code: 'X1', name: 'Urine C/E' })?.key).toBe('urine-ce');
    expect(panelFor({ code: 'X2', name: 'Stool For C/E' })?.key).toBe('stool-ce');
    expect(panelFor({ code: 'X3', name: 'Stool for C/E with Occult Blood' })?.key).toBe('stool-ce-ob');
    expect(panelFor({ code: 'X4', name: 'Basic Thyroid Profile (FT3,FT4,TSH)' })?.key).toBe('thyroid-ft3-ft4-tsh');
    expect(panelFor({ code: 'X5', name: 'Thyroid Profile (T4, TSH)' })?.key).toBe('thyroid-t4-tsh');
    expect(panelFor({ code: 'X6', name: 'Urine For C/S' })).toBeUndefined();
    expect(panelFor({ code: 'X7', name: 'Stool For C/S' })).toBeUndefined();
  });

  it('every select default is one of its options and every range is consistent', () => {
    for (const panel of STANDARD_PANELS)
      for (const prm of panel.params) {
        if (prm.inputType === 'select') expect(prm.options).toContain(prm.defaultValue);
        for (const r of prm.ranges) if (r.low !== undefined && r.high !== undefined) expect(r.low).toBeLessThanOrEqual(r.high);
        if (prm.inputType === 'select' && prm.ranges[0]?.text)
          expect(prm.options!.some((o) => textMatchesNormal(o, prm.ranges[0].text!))).toBe(true);
      }
  });

  it('replaces a single Result box, skips tests with open results, leaves customised tests alone', () => {
    const urine = single('1100', 'Urine C/E');
    const stool = single('1200', 'Stool For C/E');
    const custom = { ...single('2985', 'Basic Thyroid Profile (FT3, FT4)'), parameters: [p('FT3 (lab)'), p('Free T4 (FT4)')] } as TestDoc;
    const plans = planPanels([urine, stool, custom, single('9999', 'Serum Iron Level')], new Set([stool.id]));
    expect(plans.find((x) => x.code === '1100')?.action).toBe('replace');
    expect(plans.find((x) => x.code === '1200')?.action).toBe('skipped_open_results');
    expect(plans.find((x) => x.code === '2985')?.action).toBe('skipped_custom');
    expect(plans.find((x) => x.code === '9999')).toBeUndefined();

    const params = buildParameters(urine, plans.find((x) => x.code === '1100')!, newId);
    expect(params.length).toBeGreaterThan(15);
    expect(params.every((x) => x.ranges.every((r) => r.status === 'draft'))).toBe(true);
    expect(params.find((x) => x.name === 'Protein (Albumin)')).toMatchObject({ inputType: 'select', defaultValue: 'Nil' });
  });

  it('adds only missing optional rows to the LFT and is idempotent', () => {
    const lft = { ...single('1509', 'Liver Function Test (LFTs)'), parameters: [p('Total Bilirubin'), p('ALT (SGPT)'), p('AST (SGOT)'), p('Alkaline Phosphatase')] } as TestDoc;
    const plan = planPanels([lft], new Set())[0];
    expect(plan.action).toBe('add');
    const next = buildParameters(lft, plan, newId);
    expect(next.slice(0, 4).map((x) => x.id)).toEqual(['Total Bilirubin', 'ALT (SGPT)', 'AST (SGOT)', 'Alkaline Phosphatase']);
    expect(next.slice(4).every((x) => x.optional)).toBe(true);
    expect(planPanels([{ ...lft, parameters: next }], new Set())[0].action).toBe('up_to_date');
  });
});

describe('textMatchesNormal', () => {
  it('compares microscopy counts, absent synonyms and alternatives', () => {
    expect(textMatchesNormal('2-4', '0-5')).toBe(true);
    expect(textMatchesNormal('4 - 6', '0-5')).toBe(false);
    expect(textMatchesNormal('Nil', '0-5')).toBe(true);
    expect(textMatchesNormal('Not seen', 'Nil')).toBe(true);
    expect(textMatchesNormal('Seen', 'Not Seen')).toBe(false);
    expect(textMatchesNormal('yellow', 'Pale Yellow / Yellow')).toBe(true);
    expect(textMatchesNormal('Red', 'Pale Yellow / Yellow')).toBe(false);
    expect(textMatchesNormal('', 'Nil')).toBe(false);
  });
});

describe('descriptive normal values', () => {
  const range = { id: 'r', gender: 'any' as const, status: 'approved' as const, high: 5.6, text: 'Prediabetes 5.7-6.4%\nDiabetes Mellitus ≥ 6.5%\nMonitoring of Diabetes <7.0%' };
  it('numeric results are flagged by the numbers, the text is printed (PDF-safe)', () => {
    const prm = { id: 'p', name: 'HbA1c', inputType: 'numeric' as const, ranges: [range], sortOrder: 0 };
    expect(flagValue(prm, '6.49', range).flag).toBe('high');
    expect(formatRange(range)).toBe('Prediabetes 5.7-6.4%\nDiabetes Mellitus >= 6.5%\nMonitoring of Diabetes <7.0%');
  });
  it('multi-line text on a text result is not flagged abnormal when no line matches', () => {
    const r2 = { ...range, high: undefined, text: 'Negative: < 1.0\nPositive: >= 1.0' };
    const prm = { id: 'p', name: 'Ab', inputType: 'text' as const, ranges: [r2], sortOrder: 0 };
    expect(flagValue(prm, '0.4 (Negative)', r2).flag).toBe('no_range');
  });
  it('spreadsheet "|" becomes a new line', () => {
    const row = RangeImportRow.parse({ code: '4802', parameter: 'Result', gender: '', text: 'Prediabetes 5.7-6.4% | Diabetes >= 6.5% |  Monitoring <7.0%' });
    expect(row.text).toBe('Prediabetes 5.7-6.4%\nDiabetes >= 6.5%\nMonitoring <7.0%');
  });
});
