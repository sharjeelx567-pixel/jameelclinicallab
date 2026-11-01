import type { AnalyzerDoc, TestCategoryDoc, TestDoc, TestParameter, UserDoc } from '../common/entities';
import { ROLE_IDS, ROLE_LABELS } from '../common/permissions';
import { buildSearchTokens } from '../utils';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.service';
import { C, DataStore } from './data-store';

/**
 * DEVELOPMENT ONLY (SEED_DEMO_DATA=true, refused in production).
 *
 * Seeds DEMO staff accounts (one per role), the catalogue STRUCTURE (categories,
 * a few common tests with parameter names and units) and one DEMO analyzer.
 *
 * Deliberately NOT seeded:
 *  - patients, orders or results (no fabricated medical records), and
 *  - reference ranges / critical limits — these must be entered by the laboratory
 *    and approved by a qualified professional before use.
 * Prices are placeholders (0) to be set by the laboratory.
 */
export async function seedDevelopmentData(store: DataStore): Promise<void> {
  if (await store.get(C.users, 'dev-super_admin')) return;
  const now = store.now();

  for (const role of ROLE_IDS) {
    const user: UserDoc = {
      id: `dev-${role}`,
      email: `${role.replace('_', '.')}@demo.jcl.local`,
      displayName: `Demo ${ROLE_LABELS[role].split(' /')[0]}`,
      role,
      status: 'active',
      department: 'DEMO',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };
    await store.create(C.users, user.id, user);
  }
  // Second approver so self-verification rules can be exercised.
  await store.create(C.users, 'dev-pathologist-2', {
    id: 'dev-pathologist-2', email: 'pathologist2@demo.jcl.local', displayName: 'Demo Pathologist 2', role: 'pathologist', status: 'active', isDemo: true, createdAt: now, updatedAt: now,
  });

  await store.set(C.laboratorySettings, 'main', { ...DEFAULT_SETTINGS, address: '(set laboratory address in Settings)', updatedAt: now });

  const categories = ['Hematology', 'Biochemistry', 'Immunology', 'Serology', 'Microbiology', 'Urine Analysis', 'Stool Analysis', 'Hormones', 'Special Tests', 'Other Laboratory Tests'];
  const catIds: Record<string, string> = {};
  for (const [i, name] of categories.entries()) {
    const doc: TestCategoryDoc = { id: `cat-${name.toLowerCase().replace(/\s+/g, '-')}`, name, sortOrder: i, active: true };
    catIds[name] = doc.id;
    await store.create(C.testCategories, doc.id, doc);
  }

  const p = (id: string, name: string, unit?: string, extra: Partial<TestParameter> = {}): TestParameter => ({
    id, name, unit, inputType: 'numeric', decimals: 1, ranges: [], sortOrder: 0, ...extra,
  });
  const tests: Array<Omit<TestDoc, 'searchTokens' | 'createdAt' | 'updatedAt'>> = [
    {
      id: 'test-cbc', name: 'Complete Blood Count', code: 'CBC', categoryId: catIds.Hematology, sampleType: 'Whole blood', containerType: 'EDTA (lavender)', sampleVolume: '2 mL',
      turnaroundHours: 4, price: 0, discountEligible: true, active: true, analyzerMappings: [],
      parameters: [p('hb', 'Hemoglobin', 'g/dL'), p('wbc', 'Total Leukocyte Count', '×10³/µL'), p('rbc', 'Red Blood Cell Count', '×10⁶/µL', { decimals: 2 }), p('hct', 'Hematocrit', '%'), p('plt', 'Platelet Count', '×10³/µL', { decimals: 0 })].map((x, i) => ({ ...x, sortOrder: i })),
    },
    {
      id: 'test-fbs', name: 'Blood Glucose (Fasting)', code: 'FBS', categoryId: catIds.Biochemistry, sampleType: 'Serum', containerType: 'Fluoride (grey)', sampleVolume: '1 mL',
      collectionInstructions: 'Patient fasting as per laboratory protocol.', turnaroundHours: 2, price: 0, discountEligible: true, active: true, analyzerMappings: [],
      parameters: [p('glu', 'Glucose (Fasting)', 'mg/dL', { decimals: 0 })],
    },
    {
      id: 'test-lft', name: 'Liver Function Tests', code: 'LFT', categoryId: catIds.Biochemistry, sampleType: 'Serum', containerType: 'Gel (yellow)', sampleVolume: '2 mL',
      turnaroundHours: 6, price: 0, discountEligible: true, active: true, analyzerMappings: [],
      parameters: [p('tbil', 'Bilirubin Total', 'mg/dL', { decimals: 2 }), p('alt', 'ALT (SGPT)', 'U/L', { decimals: 0 }), p('ast', 'AST (SGOT)', 'U/L', { decimals: 0 }), p('alp', 'Alkaline Phosphatase', 'U/L', { decimals: 0 })].map((x, i) => ({ ...x, sortOrder: i })),
    },
    {
      id: 'test-hbsag', name: 'HBsAg (Screening)', code: 'HBSAG', categoryId: catIds.Serology, sampleType: 'Serum', containerType: 'Gel (yellow)', sampleVolume: '1 mL',
      turnaroundHours: 4, price: 0, discountEligible: true, active: true, analyzerMappings: [],
      parameters: [p('hbsag', 'HBsAg', undefined, { inputType: 'select', options: ['Reactive', 'Non-reactive', 'Indeterminate'], decimals: undefined })],
    },
    {
      id: 'test-ure', name: 'Urine Routine Examination', code: 'URE', categoryId: catIds['Urine Analysis'], sampleType: 'Urine', containerType: 'Sterile container', sampleVolume: '10 mL',
      collectionInstructions: 'Mid-stream clean-catch sample.', turnaroundHours: 3, price: 0, discountEligible: true, active: true, analyzerMappings: [],
      parameters: [
        p('color', 'Colour', undefined, { inputType: 'text', decimals: undefined }),
        p('ph', 'pH', undefined),
        p('protein', 'Protein', undefined, { inputType: 'select', options: ['Nil', 'Trace', '+', '++', '+++'], decimals: undefined }),
        p('glucose', 'Glucose', undefined, { inputType: 'select', options: ['Nil', 'Trace', '+', '++', '+++'], decimals: undefined }),
        p('pus', 'Pus cells', '/HPF', { inputType: 'text', decimals: undefined }),
      ].map((x, i) => ({ ...x, sortOrder: i })),
    },
  ];
  for (const t of tests) await store.create(C.tests, t.id, { ...t, searchTokens: buildSearchTokens(t.name, t.code), createdAt: now, updatedAt: now });

  const analyzer: AnalyzerDoc = {
    id: 'analyzer-demo-1', name: 'BIOELAB Analyzer (model to be confirmed)', brand: 'BIOELAB', machineType: 'To be confirmed', connectionType: 'none', protocol: 'unconfirmed',
    mode: 'demo', enabled: true, integrationStatus: 'pending_documentation', connectionState: 'never_connected', bridgeId: 'lab-pc-1',
    notes: 'DEMO record. Replace with the exact model, serial number and interface details from vendor documentation.', createdAt: now, updatedAt: now,
  };
  await store.create(C.analyzers, analyzer.id, analyzer);
}
