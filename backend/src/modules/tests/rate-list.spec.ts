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
