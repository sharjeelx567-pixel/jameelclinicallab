import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogIndexDoc, TestDoc } from '../../common/entities';
import { ALL_PERMISSIONS } from '../../common/permissions';
import { C } from '../../database/data-store';
import { MemoryDataStore } from '../../database/memory-data-store';
import { parseCsv } from '../../scripts/import-rate-list';
import { AuditService } from '../audit-logs/audit.service';
import { departmentFor, RateRow, turnaroundHours } from './rate-list';
import { TestsService } from './tests.service';

const actor = { uid: 'admin', email: 'a@x', displayName: 'Admin', role: 'super_admin' as const, permissions: [...ALL_PERMISSIONS] };
const csv = parseCsv(readFileSync(join(__dirname, '../../../data/rate-list.csv'), 'utf8'));
const rows = csv.slice(1).map(([code, name, price, sample, reportingTime]) => RateRow.parse({ code, name, price, sample, reportingTime }));

describe('rate list import', () => {
  it('parses the full laboratory rate list', () => {
    expect(rows).toHaveLength(856);
    expect(rows.find((r) => r.code === '1300')).toMatchObject({ name: 'Blood Complete Examination { CBC }', price: 600 });
    expect(rows.find((r) => r.code === '4103')).toMatchObject({ price: 1400 });
  });

  it('maps reporting times and departments', () => {
    expect(turnaroundHours('Same Day After 6 Hour')).toBe(6);
    expect(turnaroundHours('AFTER THREE DAYS')).toBe(72);
    expect(turnaroundHours('AFTER 8 WEEKS')).toBe(1344);
    expect(turnaroundHours('NEXT DAY')).toBe(24);
    expect(departmentFor('CT BRAIN WITH CONTRAST').key).toBe('radiology');
    expect(departmentFor('Anti Thrombin III').key).toBe('haematology');
    expect(departmentFor('Thyroid-Stimulating Hormone (TSH)').key).toBe('endocrinology');
    expect(departmentFor('Uric Acid (Serum)').key).toBe('chemical-pathology');
  });

  it('imports everything once, without reference ranges, and re-import only changes what changed', async () => {
    const store = new MemoryDataStore();
    const tests = new TestsService(store, new AuditService(store));
    const first = await tests.importRateList(rows, actor);
    expect(first).toEqual({ rows: 856, created: 856, updated: 0, unchanged: 0 });

    const all = (await store.query<TestDoc>(C.tests, {})).items;
    expect(all.every((t) => t.parameters.every((p) => p.ranges.length === 0))).toBe(true);
    const cbc = all.find((t) => t.code === '1300')!;
    expect(cbc.parameters.map((p) => p.name)).toContain('Platelet Count');
    expect(cbc).toMatchObject({ price: 600, turnaroundHours: 8, containerType: 'EDTA (lavender)', active: true });
    expect(all.find((t) => t.name === 'CT BRAIN WITH CONTRAST')!.active).toBe(false);

    const index = await store.get<CatalogIndexDoc>(C.catalogIndex, 'main');
    expect(index!.tests).toHaveLength(856);

    const again = await tests.importRateList(rows.map((r) => (r.code === '1300' ? { ...r, price: 650 } : r)), actor);
    expect(again).toEqual({ rows: 856, created: 0, updated: 1, unchanged: 855 });
    expect((await store.get<TestDoc>(C.tests, cbc.id))!.parameters).toEqual(cbc.parameters); // structure untouched
  });

  it('bulk price update writes only changed prices and refreshes the index', async () => {
    const store = new MemoryDataStore();
    const tests = new TestsService(store, new AuditService(store));
    await tests.importRateList(rows.slice(0, 10), actor);
    const [a, b] = (await tests.catalog()).tests;
    const res = await tests.updatePrices([{ testId: a.id, price: a.price + 100 }, { testId: b.id, price: b.price }], actor);
    expect(res).toEqual({ updated: 1 });
    expect((await tests.catalog()).tests.find((t) => t.id === a.id)!.price).toBe(a.price + 100);
  });
});

describe('reference range spreadsheet import', () => {
  it('creates draft ranges and units, approves them in bulk, and keeps identical approved ranges on re-import', async () => {
    const { RangeImportRow } = await import('./rate-list');
    const store = new MemoryDataStore();
    const tests = new TestsService(store, new AuditService(store));
    await tests.importRateList(rows.filter((r) => ['1300', '2704'].includes(r.code)), actor);
    // Fixture numbers for the test only — not clinical reference values.
    const sheet = [
      { code: '1300', parameter: 'Hemoglobin', unit: 'g/dL', gender: 'M', low: '13', high: '17' },
      { code: '1300', parameter: 'Hemoglobin', unit: 'g/dL', gender: 'F', low: '12', high: '15' },
      { code: '2704', parameter: 'Uric Acid (Serum)', unit: 'mg/dL', gender: '', low: '2.4', high: '5.7' },
      { code: '9999', parameter: 'X', gender: '' },
    ].map((r) => RangeImportRow.parse(r));
    const res = await tests.importRanges(sheet, actor);
    expect(res).toMatchObject({ testsChanged: 2, rangesWritten: 3, unitsSet: 1 }); // CBC already had g/dL
    expect(res.problems).toEqual(['Code 9999: test not found']);

    const uric = (await store.query<TestDoc>(C.tests, { where: [{ field: 'code', op: '==', value: '2704' }] })).items[0];
    expect(uric.parameters[0]).toMatchObject({ unit: 'mg/dL', inputType: 'numeric' });
    expect(uric.parameters[0].ranges[0]).toMatchObject({ gender: 'any', low: 2.4, high: 5.7, status: 'draft' });

    expect(await tests.draftRangeCount()).toBe(3);
    expect(await tests.approveAllDraftRanges(actor)).toEqual({ tests: 2, approved: 3 });
    expect(await tests.draftRangeCount()).toBe(0);

    await tests.importRanges(sheet.slice(0, 3), actor);
    expect(await tests.draftRangeCount()).toBe(0); // unchanged ranges stay approved
    await tests.importRanges([RangeImportRow.parse({ code: '2704', parameter: 'Result', gender: 'any', low: '2.5', high: '5.7' })], actor);
    expect(await tests.draftRangeCount()).toBe(1); // changed range needs approval again
  });
});

describe('quick normal value from the result screens', () => {
  it('replaces the general range, keeps gender ranges, approves for an approver and re-flags open results', async () => {
    const store = new MemoryDataStore();
    const tests = new TestsService(store, new AuditService(store));
    await tests.importRateList(rows.filter((r) => r.code === '1645'), actor);
    const typhoid = (await store.query<TestDoc>(C.tests, { where: [{ field: 'code', op: '==', value: '1645' }] })).items[0];
    const param = typhoid.parameters[0];
    // A wrong normal text ("Positive Negative") made the result "Negative" abnormal.
    await store.update(C.tests, typhoid.id, { parameters: [{ ...param, ranges: [{ id: 'g', gender: 'any', text: 'Positive Negative', status: 'approved' }, { id: 'm', gender: 'male', text: 'X', status: 'approved' }] }] });
    await store.create(C.patients, 'p1', { id: 'p1', gender: 'female', ageYears: 30 });
    await store.create(C.results, 'r1', { id: 'r1', testId: typhoid.id, patientId: 'p1', status: 'submitted', values: [{ parameterId: param.id, parameterName: 'Result', value: 'Negative', flag: 'abnormal', source: 'manual' }] });

    const res = await tests.setNormalValue(typhoid.id, param.id, { text: 'Negative' }, actor);
    expect(res).toEqual({ approved: true, reflagged: 1 });
    const after = await tests.get(typhoid.id);
    expect(after.parameters[0].ranges.map((r) => [r.id, r.gender, r.text, r.status])).toEqual([['g', 'any', 'Negative', 'approved'], ['m', 'male', 'X', 'approved']]);
    expect((await store.get<{ id: string; values: Array<{ flag: string }> }>(C.results, 'r1'))!.values[0].flag).toBe('normal');

    // Without approval permission the value is a draft and nothing is re-flagged.
    const tech = { ...actor, permissions: actor.permissions.filter((p) => p !== 'tests.approveRanges') };
    expect(await tests.setNormalValue(typhoid.id, param.id, { text: 'Positive' }, tech)).toEqual({ approved: false, reflagged: 0 });
    expect((await tests.get(typhoid.id)).parameters[0].ranges[0]).toMatchObject({ text: 'Positive', status: 'draft' });
  });
});
