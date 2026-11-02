import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { CatalogIndexDoc, ReferenceRange, TestCategoryDoc, TestDoc, TestParameter } from '../../common/entities';
import { badRequest, conflict, notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { buildSearchTokens, diff, docId, mapLimit, money, normalizeSearch, optionalText, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { containerFor, DEPARTMENTS, departmentFor, parametersFor, type RateRowInput, turnaroundHours } from './rate-list';

const RangeDto = z
  .object({
    id: z.string().max(40).optional(),
    gender: z.enum(['male', 'female', 'other', 'any']).default('any'),
    ageMinYears: z.number().min(0).max(130).optional(),
    ageMaxYears: z.number().min(0).max(130).optional(),
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    text: optionalText(120),
    criticalLow: z.number().finite().optional(),
    criticalHigh: z.number().finite().optional(),
  })
  .refine((r) => r.low === undefined || r.high === undefined || r.low <= r.high, { message: 'Lower limit must not exceed upper limit' })
  .refine((r) => r.ageMinYears === undefined || r.ageMaxYears === undefined || r.ageMinYears <= r.ageMaxYears, {
    message: 'Minimum age must not exceed maximum age',
  });

const ParameterDto = z.object({
  id: z.string().max(40).optional(),
  name: requiredText(100),
  code: optionalText(30),
  unit: optionalText(30),
  inputType: z.enum(['numeric', 'text', 'select']),
  options: z.array(requiredText(60)).max(30).optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  ranges: z.array(RangeDto).max(30).default([]),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const TestDto = z.object({
  name: requiredText(120),
  code: requiredText(20).transform((s) => s.toUpperCase()),
  categoryId: docId,
  description: optionalText(1000),
  sampleType: requiredText(60),
  containerType: optionalText(60),
  sampleVolume: optionalText(40),
  collectionInstructions: optionalText(1000),
  processingInstructions: optionalText(1000),
  turnaroundHours: z.number().min(0).max(24 * 60),
  reportingTime: optionalText(60),
  price: money,
  discountEligible: z.boolean().default(true),
  active: z.boolean().default(true),
  parameters: z.array(ParameterDto).min(1, 'Add at least one parameter').max(80),
  analyzerMappings: z
    .array(z.object({ analyzerId: docId, analyzerTestCode: requiredText(40), parameterCodes: z.record(z.string().max(40), z.string().max(40)).default({}) }))
    .max(10)
    .default([]),
});

export const CategoryDto = z.object({ name: requiredText(80), sortOrder: z.number().int().min(0).max(1000).default(0), active: z.boolean().default(true) });

export const TestQuery = z.object({
  q: z.string().max(60).optional(),
  categoryId: docId.optional(),
  active: z.enum(['true', 'false']).optional(),
});

@Injectable()
export class TestsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  // ─── Categories ──
  async categories(): Promise<TestCategoryDoc[]> {
    return (await this.store.query<TestCategoryDoc>(C.testCategories, { orderBy: { field: 'sortOrder' } })).items;
  }

  async createCategory(dto: z.infer<typeof CategoryDto>, actor: AuthUser) {
    const doc: TestCategoryDoc = { ...dto, id: this.store.newId() };
    await this.store.create(C.testCategories, doc.id, doc);
    await this.audit.record({ action: 'test_category.create', entity: 'testCategory', entityId: doc.id, actor: toActor(actor) });
    await this.rebuildCatalog();
    return doc;
  }

  async updateCategory(id: string, dto: Partial<z.infer<typeof CategoryDto>>, actor: AuthUser) {
    const before = await this.store.get<TestCategoryDoc>(C.testCategories, id);
    if (!before) throw notFound('Category');
    const next = { ...before, ...dto };
    await this.store.set(C.testCategories, id, next);
    await this.audit.record({ action: 'test_category.update', entity: 'testCategory', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    await this.rebuildCatalog();
    return next;
  }

  // ─── Tests ──
  async list(q: z.infer<typeof TestQuery>) {
    const where: WhereClause[] = [];
    if (q.categoryId) where.push({ field: 'categoryId', op: '==', value: q.categoryId });
    if (q.active) where.push({ field: 'active', op: '==', value: q.active === 'true' });
    if (q.q && normalizeSearch(q.q).length >= 2) where.push({ field: 'searchTokens', op: 'array-contains', value: normalizeSearch(q.q) });
    const res = await this.store.query<TestDoc>(C.tests, { where, orderBy: { field: 'name' } });
    return res.items.map(({ searchTokens: _t, ...t }) => t);
  }

  async get(id: string): Promise<TestDoc> {
    const t = await this.store.get<TestDoc>(C.tests, id);
    if (!t) throw notFound('Test');
    return t;
  }

  /**
   * Merge submitted parameters with stored ones. Approval status is NEVER taken
   * from the client: an approved range keeps its approval only if its values are
   * unchanged; any edit returns it to draft for re-approval.
   */
  private mergeParameters(input: z.infer<typeof ParameterDto>[], existing: TestParameter[]): TestParameter[] {
    const rangeKey = (r: Partial<ReferenceRange>) =>
      JSON.stringify([r.gender, r.ageMinYears, r.ageMaxYears, r.low, r.high, r.text, r.criticalLow, r.criticalHigh]);
    return input.map((p, i) => {
      const prev = existing.find((e) => e.id === p.id);
      const ranges: ReferenceRange[] = p.ranges.map((r) => {
        const prevRange = prev?.ranges.find((x) => x.id === r.id);
        const unchanged = prevRange && rangeKey(prevRange) === rangeKey(r);
        return unchanged
          ? prevRange
          : { ...r, id: r.id && prevRange ? r.id : this.store.newId().slice(0, 12), status: 'draft' as const };
      });
      if (p.inputType === 'select' && !p.options?.length) throw badRequest('OPTIONS_REQUIRED', `Parameter "${p.name}" needs selectable options`);
      return { ...p, id: prev ? prev.id : this.store.newId().slice(0, 12), ranges, sortOrder: p.sortOrder || i };
    });
  }

  private async assertUniqueCode(code: string, excludeId?: string) {
    const res = await this.store.query<TestDoc>(C.tests, { where: [{ field: 'code', op: '==', value: code }], limit: 2 });
    if (res.items.some((t) => t.id !== excludeId)) throw conflict('TEST_CODE_IN_USE', `Short code ${code} is already used`);
  }

  async create(dto: z.infer<typeof TestDto>, actor: AuthUser): Promise<TestDoc> {
    await this.assertUniqueCode(dto.code);
    if (!(await this.store.get(C.testCategories, dto.categoryId))) throw badRequest('CATEGORY_NOT_FOUND', 'Select a valid category');
    const now = this.store.now();
    const doc: TestDoc = {
      ...dto,
      id: this.store.newId(),
      parameters: this.mergeParameters(dto.parameters, []),
      searchTokens: buildSearchTokens(dto.name, dto.code),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(C.tests, doc.id, doc);
    await this.audit.record({ action: 'test.create', entity: 'test', entityId: doc.id, actor: toActor(actor), changes: { price: dto.price } });
    await this.rebuildCatalog();
    return doc;
  }

  async update(id: string, dto: Partial<z.infer<typeof TestDto>>, actor: AuthUser): Promise<TestDoc> {
    const before = await this.get(id);
    if (dto.code && dto.code !== before.code) await this.assertUniqueCode(dto.code, id);
    const next: TestDoc = {
      ...before,
      ...dto,
      parameters: dto.parameters ? this.mergeParameters(dto.parameters, before.parameters) : before.parameters,
      updatedAt: this.store.now(),
    };
    next.searchTokens = buildSearchTokens(next.name, next.code);
    await this.store.set(C.tests, id, next);
    const changes = diff(before, next);
    if (changes.parameters) changes.parameters = { from: '(parameters)', to: '(parameters changed)' };
    await this.audit.record({ action: 'test.update', entity: 'test', entityId: id, actor: toActor(actor), changes });
    await this.rebuildCatalog();
    return next;
  }

  // ─── Catalogue index (one document → registration & price list load with a single read) ──

  async catalog(): Promise<CatalogIndexDoc> {
    const doc = await this.store.get<CatalogIndexDoc>(C.catalogIndex, 'main');
    return doc ?? this.rebuildCatalog();
  }

  /** Rebuilt after any test write. Reads every test once; writes are rare compared with reads. */
  async rebuildCatalog(): Promise<CatalogIndexDoc> {
    const [tests, categories] = await Promise.all([this.store.query<TestDoc>(C.tests, { orderBy: { field: 'name' } }), this.categories()]);
    const doc: CatalogIndexDoc = {
      id: 'main',
      updatedAt: this.store.now(),
      categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, active: c.active })),
      tests: tests.items.map((t) => ({
        id: t.id, code: t.code, name: t.name, categoryId: t.categoryId, price: t.price, sampleType: t.sampleType,
        ...(t.containerType ? { containerType: t.containerType } : {}),
        turnaroundHours: t.turnaroundHours,
        ...(t.reportingTime ? { reportingTime: t.reportingTime } : {}),
        discountEligible: t.discountEligible, active: t.active,
      })),
    };
    await this.store.set(C.catalogIndex, 'main', doc);
    return doc;
  }

  /** Bulk price change from Settings → Price list. Only rows whose price actually changed are written. */
  async updatePrices(changes: Array<{ testId: string; price: number }>, actor: AuthUser) {
    const updated: Array<{ code: string; name: string; from: number; to: number }> = [];
    await mapLimit(changes, 20, async ({ testId, price }) => {
      const t = await this.store.get<TestDoc>(C.tests, testId);
      if (!t) throw notFound(`Test ${testId}`);
      if (t.price === price) return;
      await this.store.update(C.tests, testId, { price, updatedAt: this.store.now() });
      updated.push({ code: t.code, name: t.name, from: t.price, to: price });
    });
    if (updated.length) {
      await this.audit.record({ action: 'test.prices_update', entity: 'test', entityId: 'bulk', actor: toActor(actor), changes: { count: updated.length, prices: updated.slice(0, 200) } });
      await this.rebuildCatalog();
    }
    return { updated: updated.length };
  }

  /**
   * Import / refresh the rate list. Tests are matched by code: existing tests get the
   * new name, price, sample and reporting time (their parameters and approved ranges
   * are untouched); new codes are created with a starting parameter structure and NO
   * reference ranges. Imaging and cosmetic services are created inactive.
   */
  async importRateList(rows: RateRowInput[], actor: AuthUser, opts: { updateNames?: boolean } = {}) {
    // Departments → categories (created once, matched by name).
    const existingCats = await this.categories();
    const catId = new Map<string, string>();
    for (const d of DEPARTMENTS) {
      const found = existingCats.find((c) => c.name.toLowerCase() === d.name.toLowerCase());
      if (found) catId.set(d.key, found.id);
      else {
        const doc: TestCategoryDoc = { id: this.store.newId(), name: d.name, sortOrder: d.sortOrder, active: true };
        await this.store.create(C.testCategories, doc.id, doc);
        catId.set(d.key, doc.id);
      }
    }
    const existing = (await this.store.query<TestDoc>(C.tests, {})).items;
    const byCode = new Map(existing.map((t) => [t.code.toUpperCase(), t]));
    const seen = new Set<string>();
    let created = 0, updated = 0, unchanged = 0;
    const now = this.store.now();

    await mapLimit(rows, 20, async (row) => {
      const code = row.code.toUpperCase();
      if (seen.has(code)) return;
      seen.add(code);
      const dept = departmentFor(row.name);
      const sampleType = row.sample && row.sample !== 'N/A' ? row.sample : 'Not applicable';
      const tat = turnaroundHours(row.reportingTime);
      const prev = byCode.get(code);
      if (prev) {
        const patch = {
          price: row.price,
          sampleType,
          turnaroundHours: tat,
          ...(row.reportingTime ? { reportingTime: row.reportingTime } : {}),
          ...(opts.updateNames ? { name: row.name, searchTokens: buildSearchTokens(row.name, code) } : {}),
        };
        const changed = Object.entries(patch).some(([k, v]) => k !== 'searchTokens' && JSON.stringify((prev as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v));
        if (!changed) return void unchanged++;
        await this.store.update(C.tests, prev.id, { ...patch, updatedAt: now });
        return void updated++;
      }
      const container = containerFor(sampleType);
      const doc: TestDoc = {
        id: this.store.newId(),
        name: row.name,
        code,
        categoryId: catId.get(dept.key)!,
        sampleType,
        ...(container ? { containerType: container } : {}),
        turnaroundHours: tat,
        ...(row.reportingTime ? { reportingTime: row.reportingTime } : {}),
        price: row.price,
        discountEligible: true,
        active: !dept.service,
        parameters: this.mergeParameters(parametersFor(row.name) as z.infer<typeof ParameterDto>[], []),
        analyzerMappings: [],
        searchTokens: buildSearchTokens(row.name, code),
        createdAt: now,
        updatedAt: now,
      };
      await this.store.create(C.tests, doc.id, doc);
      created++;
    });

    await this.audit.record({ action: 'test.rate_list_import', entity: 'test', entityId: 'bulk', actor: toActor(actor), changes: { rows: rows.length, created, updated, unchanged } });
    await this.rebuildCatalog();
    return { rows: rows.length, created, updated, unchanged };
  }

  async approveRange(testId: string, parameterId: string, rangeId: string, actor: AuthUser): Promise<TestDoc> {
    const test = await this.get(testId);
    const param = test.parameters.find((p) => p.id === parameterId);
    const range = param?.ranges.find((r) => r.id === rangeId);
    if (!param || !range) throw notFound('Reference range');
    range.status = 'approved';
    range.approvedBy = toActor(actor);
    range.approvedAt = this.store.now();
    await this.store.update(C.tests, testId, { parameters: test.parameters, updatedAt: this.store.now() });
    await this.audit.record({
      action: 'reference_range.approve',
      entity: 'test',
      entityId: testId,
      actor: toActor(actor),
      changes: { parameter: param.name, range: { low: range.low, high: range.high, text: range.text, gender: range.gender } },
    });
    return test;
  }
}
