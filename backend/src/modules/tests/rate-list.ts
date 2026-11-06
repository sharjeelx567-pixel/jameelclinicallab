/**
 * Rate-list import rules: department, turnaround hours and starting parameter
 * STRUCTURE (names/units only) for tests imported from the laboratory's price
 * list. No reference ranges or result values are created here: ranges must be
 * entered by the laboratory and approved by a qualified professional.
 */
import { z } from 'zod';

export const RateRow = z.object({
  code: z.string().trim().min(1, 'code is empty').max(40, 'code is longer than 40 characters'),
  name: z.string().trim().min(1, 'test name is empty').max(200, 'test name is longer than 200 characters'),
  price: z.coerce.number({ error: 'price is not a number' }).min(0, 'price is negative').max(10_000_000, 'price is too large'),
  sample: z.string().trim().max(200, 'sample is longer than 200 characters').default(''),
  reportingTime: z.string().trim().max(120, 'reporting time is longer than 120 characters').default(''),
});
export type RateRowInput = z.infer<typeof RateRow>;

export interface Department {
  key: string;
  name: string;
  sortOrder: number;
  /** Billable service without laboratory results (imaging, cosmetic, consultation). */
  service?: boolean;
}

export const DEPARTMENTS: Department[] = [
  { key: 'haematology', name: 'Haematology', sortOrder: 10 },
  { key: 'chemical-pathology', name: 'Chemical Pathology', sortOrder: 20 },
  { key: 'endocrinology', name: 'Endocrinology & Hormones', sortOrder: 30 },
  { key: 'tumour-markers', name: 'Tumour Markers', sortOrder: 40 },
  { key: 'immunology', name: 'Immunology & Serology', sortOrder: 50 },
  { key: 'microbiology', name: 'Microbiology', sortOrder: 60 },
  { key: 'molecular', name: 'Molecular Pathology (PCR)', sortOrder: 70 },
  { key: 'histopathology', name: 'Histopathology & Cytology', sortOrder: 80 },
  { key: 'radiology', name: 'Radiology & Imaging', sortOrder: 90, service: true },
  { key: 'other-services', name: 'Other Services', sortOrder: 100, service: true },
];

const has = (name: string, words: RegExp) => words.test(name);

/** First matching rule wins; order matters (e.g. "Anti Thrombin III" is haematology, not serology). */
export function departmentFor(name: string): Department {
  const n = ` ${name} `;
  const dept = (key: string) => DEPARTMENTS.find((d) => d.key === key)!;
  if (has(n, /\b(hifu|peel|hydra facial|prp face|co2 laser|consultation)\b/i)) return dept('other-services');
  if (
    has(n, /\b(ultrasound|barium|mrcp|sinogram|urethrogram|hrct|ap\+lat|chest pa|plain|with(out| out)? contrast)\b/i) ||
    /^\s*CT\s/.test(name) ||
    has(n, /\b(abdomin erect|shoulder ap|pelvis e both hips|pns \(|stn \(|skull ap)\b/i)
  )
    return dept('radiology');
  if (has(n, /(immunohisto|histopatholog|biopsy|block|slide|fnac|pap smear|cytology|er\/pr|special stain|pas stain|iron stain|immunocytochem|bone marrow)/i)) return dept('histopathology');
  if (has(n, /\b(pcr|genotyping|mutation|gene|genomex|hla|genexpert)\b/i)) return dept('molecular');
  if (has(n, /(c\/s|culture|gram stain|afb|zn stain|z\.n|fungal|fungus|koh)/i)) return dept('microbiology');
  if (
    has(n, /(blood complete|\bcbc\b|hemoglobin \(hb\)|\besr\b|\bdlc\b|platelet|reticulocyte|peripheral blood|rbc morphology|wbc|total rbcs|malarial|coagulation|\baptt\b|prothrombin|factor (v|vii|viii|ix|x|xi|xiii)\b|factor v leiden|fibrinogen|d-dimer|bleeding time|clotting time|blood group|coombs|protein-[cs]|anti thrombin|lupus anticoagulant|sickling|osmotic fragility|g6 ?pd|le cell|hemoglobin electrophoresis|von willebrand|cross match|rh antibodies|anti d \(rh)/i)
  )
    return dept('haematology');
  // Routine fluid examinations and a few chemistry analytes whose names look like other departments.
  if (has(n, /(c\/e\b|alpha anti trypsin)/i)) return dept('chemical-pathology');
  if (has(n, /(\bcea\b|alpha fetoprotein|\bafp\b|ca[ -]?125|ca-19-9|ca 15-3|\bpsa\b|pivka|b2-microglobulin)/i)) return dept('tumour-markers');
  if (
    has(n, /(\btsh\b|thyroid|\b(f)?t3\b|\b(f)?t4\b|thyroxine|triiodothyronine|cortisol|insulin|c peptide|prolactin|\blh\b|\bfsh\b|estradiol|progesterone|testosterone|\bamh\b|mullerian|dhea|acth|growth hormone|parathyroid|\bpth\b|vitamin|beta hcg|androgen|aldosterone|renin|calcitonin|gastrin|erythropoietin|igf|androstendione|\bshbg\b|sex hormone|thyroglobulin|homa-ir|metanephrine|catecholamines|\bvma\b|adrenaline|17-hydroxy|dihydrotestosterone)/i)
  )
    return dept('endocrinology');
  if (
    has(n, /(\banti\b|anti-|\bana\b|anca|\big ?[gmae]\b|\bhbs|hbe|\bhcv|\bhiv|dengue|brucella|torch|toxoplasma|rubella|cytomegalo|herpes|syphilis|vdrl|tpha|treponema|ra factor|\basot\b|c-reactive|\bcrp\b|h\. ?pylori|helicobacter|allergy|complement|measles|mumps|varicella|leptospir|mycodot|mycoplasma|aspergillus|galactomannan|beta d glucan|quantiferon|cryoglobulin|echinococcus|haemagglutination|leishmania|immunoglobulin|immuno-typing|light chain|celiac|plasma reagin|endomysial|gliadin|transglutaminase|cardiolipin|phospholipid|glycoprotein|\bena\b|oligoclonal|vasculitis|rnp\/sm|scl-70|il- ?6|procalcitonin|lia\b)/i)
  )
    return dept('immunology');
  return dept('chemical-pathology');
}

const NUM: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };

/** "AFTER THREE DAYS" → 72, "Same Day After 6 Hour" → 6, "NEXT DAY" → 24. Unknown text → 24. */
export function turnaroundHours(text: string): number {
  const t = text.toUpperCase().trim();
  const m = /AFTER\s+(\d+|[A-Z]+)\s+(HOUR|DAY|WEEK)S?/.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (NUM[m[1]] ?? 1);
    return Math.min(24 * 60, n * (m[2] === 'HOUR' ? 1 : m[2] === 'DAY' ? 24 : 168));
  }
  if (t.startsWith('SAME DAY')) return 8;
  if (/(NEXT DAY|DAILY|ON CALL)/.test(t)) return 24;
  if (/(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/.test(t)) return 168;
  return 24;
}

/** Tube colour hint from the sample description (shown on labels and the collection screen). */
export function containerFor(sample: string): string | undefined {
  const s = sample.toLowerCase();
  if (s.includes('edta')) return 'EDTA (lavender)';
  if (s.includes('fluoride')) return 'Fluoride (grey)';
  if (s.includes('citrate')) return 'Citrate (light blue)';
  if (s.includes('heparin')) return 'Heparin (green)';
  if (s.includes('clotted') || s.includes('serum')) return 'Serum (red / yellow)';
  return undefined;
}

type ParamTemplate = { name: string; unit?: string };
const p = (name: string, unit?: string): ParamTemplate => ({ name, unit });

/**
 * Starting parameter structure for common multi-analyte panels (names and units
 * only, editable). Everything else starts with one free-text result field.
 */
const PANELS: Array<{ match: RegExp; params: ParamTemplate[] }> = [
  {
    match: /^blood complete examination|^cbc\b/i,
    params: [
      p('Hemoglobin', 'g/dL'), p('Total Leukocyte Count', '×10³/µL'), p('Red Blood Cell Count', '×10⁶/µL'), p('Hematocrit', '%'),
      p('MCV', 'fL'), p('MCH', 'pg'), p('MCHC', 'g/dL'), p('Platelet Count', '×10³/µL'),
      p('Neutrophils', '%'), p('Lymphocytes', '%'), p('Monocytes', '%'), p('Eosinophils', '%'), p('Basophils', '%'),
    ],
  },
  { match: /^liver function test/i, params: [p('Total Bilirubin', 'mg/dL'), p('ALT (SGPT)', 'U/L'), p('AST (SGOT)', 'U/L'), p('Alkaline Phosphatase', 'U/L')] },
  { match: /^renal function test/i, params: [p('Urea', 'mg/dL'), p('Creatinine', 'mg/dL')] },
  { match: /^serum lipid profile/i, params: [p('Total Cholesterol', 'mg/dL'), p('Triglycerides', 'mg/dL'), p('HDL Cholesterol', 'mg/dL'), p('LDL Cholesterol', 'mg/dL'), p('VLDL Cholesterol', 'mg/dL')] },
  { match: /^serum electrolytes/i, params: [p('Sodium', 'mmol/L'), p('Potassium', 'mmol/L'), p('Chloride', 'mmol/L'), p('Bicarbonate', 'mmol/L')] },
];

export function parametersFor(name: string): Array<{ name: string; unit?: string; inputType: 'numeric' | 'text'; ranges: []; sortOrder: number }> {
  const panel = PANELS.find((x) => x.match.test(name.trim()));
  if (panel) return panel.params.map((x, i) => ({ name: x.name, unit: x.unit, inputType: 'numeric', ranges: [], sortOrder: i }));
  return [{ name: 'Result', inputType: 'text', ranges: [], sortOrder: 0 }];
}

const optNum = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/,/g, '')) : v), z.number().finite().optional());
const optStr = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v), z.string().max(max).optional());

/** One spreadsheet row of the reference-range import. Values come from the laboratory's own documentation. */
export const RangeImportRow = z
  .object({
    code: z.string().trim().min(1).max(20),
    parameter: z.string().trim().min(1).max(100),
    unit: optStr(30),
    gender: z.preprocess(
      (v) => { const g = String(v ?? '').trim().toLowerCase(); return g === '' || g === 'any' || g === 'all' || g === 'both' ? 'any' : g === 'm' ? 'male' : g === 'f' ? 'female' : g; },
      z.enum(['any', 'male', 'female']),
    ),
    ageFrom: optNum,
    ageTo: optNum,
    low: optNum,
    high: optNum,
    text: optStr(120),
    criticalLow: optNum,
    criticalHigh: optNum,
  })
  .refine((r) => r.low === undefined || r.high === undefined || r.low <= r.high, { message: 'low must not exceed high' })
  .refine((r) => r.ageFrom === undefined || r.ageTo === undefined || r.ageFrom <= r.ageTo, { message: 'age from must not exceed age to' });
export type RangeImportRowInput = z.infer<typeof RangeImportRow>;
