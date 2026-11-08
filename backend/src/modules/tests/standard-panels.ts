import type { ReferenceRange, TestDoc, TestParameter } from '../../common/entities';

/**
 * Standard result rows for multi-analyte tests that were imported from the rate list
 * with a single free-text "Result" box (Urine C/E, Stool C/E, Semen, thyroid profiles,
 * coagulation, GTT, bilirubin fractions, …).
 *
 * The normal values are common textbook / WHO / ADA reference values. They are
 * created as DRAFT ranges: the laboratory's approver must check them against the
 * kits and methods in use and approve them before they appear on reports.
 */

type Gender = 'any' | 'male' | 'female';
interface RangeSpec { gender?: Gender; low?: number; high?: number; text?: string }
export interface PanelParam {
  name: string;
  unit?: string;
  inputType: 'numeric' | 'text' | 'select';
  options?: string[];
  decimals?: number;
  /** Pre-filled when the technician starts entering this test (they change only abnormal values). */
  defaultValue?: string;
  /** May be left empty; empty optional rows are not printed. */
  optional?: boolean;
  ranges: RangeSpec[];
}
export interface StandardPanel {
  key: string;
  /** Rate-list codes of this laboratory; names are matched too, for other code lists. */
  codes: string[];
  match: RegExp;
  params: PanelParam[];
}

const num = (name: string, unit: string | undefined, low?: number, high?: number, extra: Partial<PanelParam> = {}): PanelParam => ({
  name, unit, inputType: 'numeric', ranges: low === undefined && high === undefined ? [] : [{ low, high }], ...extra,
});
const sexNum = (name: string, unit: string, m: [number, number], f: [number, number], extra: Partial<PanelParam> = {}): PanelParam => ({
  name, unit, inputType: 'numeric', ranges: [{ gender: 'male', low: m[0], high: m[1] }, { gender: 'female', low: f[0], high: f[1] }], ...extra,
});
/** Choice list; the first option is the default and the normal value unless given. */
const sel = (name: string, options: string[], normal: string | undefined = options[0], extra: Partial<PanelParam> = {}): PanelParam => ({
  name, inputType: 'select', options, defaultValue: options[0], ranges: normal ? [{ text: normal }] : [], ...extra,
});
const txt = (name: string, unit: string | undefined, defaultValue: string, normal?: string, extra: Partial<PanelParam> = {}): PanelParam => ({
  name, unit, inputType: 'text', defaultValue, ranges: normal ? [{ text: normal }] : [], ...extra,
});

const GRADE = ['Nil', 'Trace', '+', '++', '+++', '++++'];
const NEG_GRADE = ['Negative', 'Trace', '+', '++', '+++'];
const PRESENT = ['Nil', 'Few', '+', '++', '+++'];

// Thyroid analytes (same values as the single tests in the catalogue).
const THY: Record<string, PanelParam> = {
  FT3: num('Free T3 (FT3)', 'pg/mL', 2.0, 4.4, { decimals: 2 }),
  FT4: num('Free T4 (FT4)', 'ng/dL', 0.8, 1.8, { decimals: 2 }),
  T3: num('T3 (Triiodothyronine)', 'ng/mL', 0.8, 2.0, { decimals: 2 }),
  T4: num('T4 (Thyroxine)', 'µg/dL', 5.0, 12.0, { decimals: 2 }),
  TSH: num('TSH', 'µIU/mL', 0.4, 4.0, { decimals: 2 }),
};
const thyroid = (...keys: Array<keyof typeof THY>) => keys.map((k) => THY[k]);

const URINE: PanelParam[] = [
  sel('Colour', ['Pale Yellow', 'Yellow', 'Dark Yellow', 'Amber', 'Red', 'Brown', 'Colourless'], 'Pale Yellow / Yellow'),
  sel('Appearance', ['Clear', 'Slightly Turbid', 'Turbid'], 'Clear'),
  num('Specific Gravity', undefined, 1.005, 1.03, { decimals: 3 }),
  num('pH', undefined, 4.5, 8.0, { decimals: 1 }),
  sel('Protein (Albumin)', GRADE, 'Nil'),
  sel('Glucose (Sugar)', GRADE, 'Nil'),
  sel('Ketone Bodies', NEG_GRADE, 'Negative'),
  sel('Bilirubin', ['Negative', '+', '++', '+++'], 'Negative'),
  sel('Urobilinogen', ['Normal', 'Increased'], 'Normal'),
  sel('Blood', NEG_GRADE, 'Negative'),
  sel('Nitrite', ['Negative', 'Positive'], 'Negative'),
  sel('Leukocyte Esterase', NEG_GRADE, 'Negative'),
  txt('Pus Cells', '/HPF', '0-2', '0-5'),
  txt('Red Blood Cells', '/HPF', 'Nil', '0-2'),
  txt('Epithelial Cells', '/HPF', 'Few', undefined),
  txt('Casts', '/LPF', 'Nil', 'Nil'),
  txt('Crystals', undefined, 'Nil', 'Nil'),
  sel('Bacteria', PRESENT, 'Nil'),
  sel('Yeast Cells', ['Nil', 'Present'], 'Nil'),
  sel('Mucus', PRESENT, 'Nil'),
  txt('Others', undefined, '', undefined, { optional: true }),
];

const STOOL: PanelParam[] = [
  sel('Colour', ['Brown', 'Yellowish', 'Greenish', 'Black', 'Red', 'Clay coloured'], 'Brown / Yellowish'),
  sel('Consistency', ['Formed', 'Semi-formed', 'Soft', 'Loose', 'Watery', 'Hard'], 'Formed / Semi-formed'),
  sel('Mucus', ['Nil', 'Present'], 'Nil'),
  sel('Blood (Visible)', ['Nil', 'Present'], 'Nil'),
  txt('Pus Cells', '/HPF', '0-2', '0-5'),
  txt('Red Blood Cells', '/HPF', 'Nil', 'Nil'),
  txt('Ova', undefined, 'Not Seen', 'Not Seen'),
  txt('Cysts', undefined, 'Not Seen', 'Not Seen'),
  txt('Trophozoites', undefined, 'Not Seen', 'Not Seen'),
  sel('Undigested Food Particles', ['Nil', 'Few', '+', '++', '+++'], undefined),
  sel('Fat Globules', ['Nil', 'Present'], 'Nil'),
  sel('Yeast Cells', ['Nil', 'Present'], 'Nil'),
  txt('Others', undefined, '', undefined, { optional: true }),
];

const GTT_75: PanelParam[] = [num('Fasting', 'mg/dL', 70, 100), num('2 Hours after 75 g Glucose', 'mg/dL', undefined, 140)];
// IADPSG / ADA criteria for gestational diabetes (75 g).
const GTT_PREG: PanelParam[] = [num('Fasting', 'mg/dL', undefined, 92), num('1 Hour after 75 g Glucose', 'mg/dL', undefined, 180), num('2 Hours after 75 g Glucose', 'mg/dL', undefined, 153)];
// Carpenter–Coustan criteria (100 g).
const GTT_100: PanelParam[] = [
  num('Fasting', 'mg/dL', undefined, 95), num('1 Hour after 100 g Glucose', 'mg/dL', undefined, 180),
  num('2 Hours after 100 g Glucose', 'mg/dL', undefined, 155), num('3 Hours after 100 g Glucose', 'mg/dL', undefined, 140),
];

export const STANDARD_PANELS: StandardPanel[] = [
  { key: 'urine-ce', codes: ['1100'], match: /^urine\s*(c\s*\/\s*e|complete exam|routine exam|r\s*\/\s*e)/i, params: URINE },
  { key: 'stool-ce-ob', codes: ['1721'], match: /^stool\s*(for\s*)?c\s*\/\s*e\s*with occult/i, params: [...STOOL.slice(0, -1), sel('Occult Blood', ['Negative', 'Positive'], 'Negative'), STOOL[STOOL.length - 1]] },
  { key: 'stool-ce', codes: ['1200'], match: /^stool\s*(for\s*)?(c\s*\/\s*e|complete exam|r\s*\/\s*e)\s*$/i, params: STOOL },
  {
    key: 'semen', codes: ['1207'], match: /^semen analysis/i,
    // WHO laboratory manual, 6th edition (2021): lower reference limits.
    params: [
      txt('Abstinence Period', 'days', '', undefined, { optional: true }),
      num('Volume', 'mL', 1.4, undefined, { decimals: 1 }),
      sel('Colour', ['Greyish White', 'White', 'Yellowish', 'Reddish / Brown'], 'Greyish White'),
      num('Liquefaction Time', 'min', undefined, 60),
      sel('Viscosity', ['Normal', 'Increased'], 'Normal'),
      num('pH', undefined, 7.2, undefined, { decimals: 1 }),
      num('Sperm Concentration', '×10^6/mL', 16),
      num('Total Sperm Count', '×10^6/ejaculate', 39, undefined, { optional: true }),
      num('Total Motility (PR + NP)', '%', 42),
      num('Progressive Motility (PR)', '%', 30),
      num('Non-progressive Motility (NP)', '%', undefined, undefined, { optional: true }),
      num('Immotile', '%', undefined, undefined, { optional: true }),
      num('Normal Morphology', '%', 4),
      num('Vitality (Live Sperms)', '%', 54, undefined, { optional: true }),
      txt('Pus Cells', '/HPF', '0-2', '0-5'),
      txt('Red Blood Cells', '/HPF', 'Nil', 'Nil'),
      txt('Others', undefined, '', undefined, { optional: true }),
    ],
  },
  { key: 'thyroid-ft3-ft4-tsh', codes: ['2909'], match: /thyroid.*\(\s*ft3\s*,\s*ft4\s*,\s*tsh\s*\)/i, params: thyroid('FT3', 'FT4', 'TSH') },
  { key: 'thyroid-ft3-ft4', codes: ['2985'], match: /thyroid.*\(\s*ft3\s*,\s*ft4\s*\)/i, params: thyroid('FT3', 'FT4') },
  { key: 'thyroid-ft3-tsh', codes: ['2148'], match: /thyroid.*\(\s*ft3\s*,\s*tsh\s*\)/i, params: thyroid('FT3', 'TSH') },
  { key: 'thyroid-ft4-tsh', codes: ['1678'], match: /thyroid.*\(\s*ft4\s*,\s*tsh\s*\)/i, params: thyroid('FT4', 'TSH') },
  { key: 'thyroid-t3-t4', codes: ['1988'], match: /thyroid.*\(\s*t3\s*,\s*t4\s*\)/i, params: thyroid('T3', 'T4') },
  { key: 'thyroid-t3-tsh', codes: ['1885'], match: /thyroid.*\(\s*t3\s*,\s*tsh\s*\)/i, params: thyroid('T3', 'TSH') },
  { key: 'thyroid-t4-tsh', codes: ['3079'], match: /thyroid.*\(\s*t4\s*,\s*tsh\s*\)/i, params: thyroid('T4', 'TSH') },
  { key: 'tft', codes: ['41000'], match: /^thyroid function tests?\b/i, params: thyroid('T3', 'T4', 'TSH') },
  {
    key: 'pt-inr', codes: ['1305'], match: /^prothrombin time/i,
    params: [num('Prothrombin Time (Patient)', 'seconds', 11, 13.5, { decimals: 1 }), num('Prothrombin Time (Control)', 'seconds', undefined, undefined, { decimals: 1, optional: true }), num('INR', undefined, 0.8, 1.2, { decimals: 2 })],
  },
  {
    key: 'coagulation', codes: ['3181'], match: /^coagulation profile/i,
    params: [
      num('Prothrombin Time (Patient)', 'seconds', 11, 13.5, { decimals: 1 }), num('Prothrombin Time (Control)', 'seconds', undefined, undefined, { decimals: 1, optional: true }),
      num('INR', undefined, 0.8, 1.2, { decimals: 2 }),
      num('APTT (Patient)', 'seconds', 25, 35, { decimals: 1 }), num('APTT (Control)', 'seconds', undefined, undefined, { decimals: 1, optional: true }),
    ],
  },
  { key: 'gtt-75', codes: ['1403'], match: /^gtt\s*\(\s*2 sample/i, params: GTT_75 },
  { key: 'gtt-75-pregnancy', codes: ['1434'], match: /^gtt\s*\(\s*3 sample/i, params: GTT_PREG },
  { key: 'gtt-100', codes: ['1460'], match: /^gtt.*100 gram/i, params: GTT_100 },
  {
    key: 'bilirubin-d-i', codes: ['3208'], match: /^bilirubin\s*\(\s*direct\s*\+\s*indirect\s*\)/i,
    params: [num('Total Bilirubin', 'mg/dL', 0.1, 1.2, { decimals: 2 }), num('Direct (Conjugated) Bilirubin', 'mg/dL', 0, 0.3, { decimals: 2 }), num('Indirect (Unconjugated) Bilirubin', 'mg/dL', 0.1, 1.0, { decimals: 2 })],
  },
  {
    key: 'cardiac-enzymes', codes: ['1800'], match: /^cardiac enzymes/i,
    params: [sexNum('CPK (CK Total)', 'U/L', [39, 308], [26, 192]), num('CK-MB', 'U/L', 0, 25), num('LDH', 'U/L', 135, 225), num('AST (SGOT)', 'U/L', 0, 40, { optional: true })],
  },
  {
    // The LFT already has its main rows; these are added (optional, so the routine LFT is unchanged).
    key: 'lft-extra', codes: ['1509'], match: /^liver function test/i,
    params: [
      sexNum('Gamma GT (GGT)', 'U/L', [10, 71], [6, 42], { optional: true }),
      num('Total Protein', 'g/dL', 6.4, 8.3, { decimals: 1, optional: true }),
      num('Albumin', 'g/dL', 3.5, 5.2, { decimals: 1, optional: true }),
      num('Globulin', 'g/dL', 2.0, 3.5, { decimals: 1, optional: true }),
      num('A/G Ratio', undefined, 1.1, 2.5, { decimals: 2, optional: true }),
    ],
  },
];

export function panelFor(test: Pick<TestDoc, 'code' | 'name'>): StandardPanel | undefined {
  return STANDARD_PANELS.find((p) => p.codes.includes(test.code)) ?? STANDARD_PANELS.find((p) => p.match.test(test.name.trim()));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** The single generic box created by the rate-list import. */
export const isSingleResultBox = (t: Pick<TestDoc, 'name' | 'parameters'>) =>
  t.parameters.length === 1 && [norm('Result'), norm(t.name)].includes(norm(t.parameters[0].name));

export interface PanelPlan {
  testId: string;
  code: string;
  name: string;
  action: 'replace' | 'add' | 'up_to_date' | 'skipped_open_results' | 'skipped_custom';
  rows: string[];
}

/** What applying the standard rows would do to each matching test (pure; used for preview and apply). */
export function planPanels(tests: TestDoc[], openResultTestIds: Set<string>): Array<PanelPlan & { panel: StandardPanel }> {
  const out: Array<PanelPlan & { panel: StandardPanel }> = [];
  for (const t of tests) {
    const panel = panelFor(t);
    if (!panel) continue;
    const base = { testId: t.id, code: t.code, name: t.name, panel };
    const replace = isSingleResultBox(t);
    const have = new Set(t.parameters.map((p) => norm(p.name)));
    const missing = panel.params.filter((p) => !have.has(norm(p.name)));
    if (!replace && panel.key !== 'lft-extra') {
      // A test whose rows were already customised by the laboratory is left alone.
      out.push({ ...base, action: missing.length && missing.length < panel.params.length ? 'skipped_custom' : 'up_to_date', rows: [] });
      continue;
    }
    if (!replace && !missing.length) {
      out.push({ ...base, action: 'up_to_date', rows: [] });
      continue;
    }
    if (openResultTestIds.has(t.id)) {
      out.push({ ...base, action: 'skipped_open_results', rows: (replace ? panel.params : missing).map((p) => p.name) });
      continue;
    }
    out.push({ ...base, action: replace ? 'replace' : 'add', rows: (replace ? panel.params : missing).map((p) => p.name) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** New parameter list for a planned test. Ranges are DRAFT until the approver approves them. */
export function buildParameters(test: TestDoc, plan: PanelPlan & { panel: StandardPanel }, newId: () => string): TestParameter[] {
  const toParam = (p: PanelParam, sortOrder: number): TestParameter => ({
    id: newId(),
    name: p.name,
    ...(p.unit ? { unit: p.unit } : {}),
    inputType: p.inputType,
    ...(p.options ? { options: p.options } : {}),
    ...(p.decimals !== undefined ? { decimals: p.decimals } : {}),
    ...(p.defaultValue ? { defaultValue: p.defaultValue } : {}),
    ...(p.optional ? { optional: true } : {}),
    ranges: p.ranges.map((r) => ({
      id: newId(),
      gender: r.gender ?? 'any',
      ...(r.low !== undefined ? { low: r.low } : {}),
      ...(r.high !== undefined ? { high: r.high } : {}),
      ...(r.text ? { text: r.text } : {}),
      status: 'draft',
    }) as ReferenceRange),
    sortOrder,
  });
  if (plan.action === 'replace') return plan.panel.params.map((p, i) => toParam(p, i));
  const start = Math.max(0, ...test.parameters.map((p) => p.sortOrder)) + 1;
  const have = new Set(test.parameters.map((p) => norm(p.name)));
  const added = plan.panel.params.filter((p) => !have.has(norm(p.name))).map((p, i) => toParam(p, start + i));
  return [...test.parameters, ...added];
}
