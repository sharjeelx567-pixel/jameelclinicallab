import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { CatalogIndexDoc, PatientDoc, ReferenceRange, ResultDoc, TestCategoryDoc, TestDoc, TestParameter } from '../../common/entities';
import { badRequest, conflict, notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore } from '../../database/data-store';
import { buildSearchTokens, diff, docId, mapLimit, money, normalizeSearch, optionalText, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { flagValue, isCritical, selectRange } from './reference-range';
import { containerFor, DEPARTMENTS, departmentFor, parametersFor, type RangeImportRowInput, type RateRowInput, turnaroundHours } from './rate-list';
import { buildParameters, planPanels } from './standard-panels';
import { usage } from '../../common/usage-monitor';

const RangeDto = z
  .object({
    id: z.string().max(40).optional(),
    gender: z.enum(['male', 'female', 'other', 'any']).default('any'),
    ageMinYears: z.number().min(0).max(130).optional(),
    ageMaxYears: z.number().min(0).max(130).optional(),
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    // Normal value as printed; may have several lines (e.g. Prediabetes 5.7-6.4% / Diabetes >= 6.5%).
    text: optionalText(600),
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
  defaultValue: optionalText(60),
  optional: z.boolean().optional(),
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

  // ─── In-memory copy of the catalogue (database read quota) ──
  // Reading all ~850 tests costs ~850 reads. The copy is reused while a one-document
  // version marker is unchanged; every write to tests moves the marker, so other server
  // instances reload and this one patches its copy.

  private cache?: { version: string; tests: TestDoc[] };

  /** Tests and categories with ONE version check. */
  async testsAndCategories(): Promise<{ tests: TestDoc[]; categories: TestCategoryDoc[] }> {
    const v = await this.catalogVersion();
    const [tests, categories] = await Promise.all([this.allTests(v), this.categories(v)]);
    return { tests, categories };
  }

  private async catalogVersion(): Promise<string> {
    return (await this.store.get<{ id: string; v: string }>(C.catalogIndex, 'version'))?.v ?? 'none';
  }

  /** Every test (including inactive). One small read when nothing changed since the last call. */
  async allTests(knownVersion?: string): Promise<TestDoc[]> {
    const v = knownVersion ?? (await this.catalogVersion());
    usage.cache('tests', this.cache?.version === v);
    if (this.cache?.version === v) return this.cache.tests;
    const tests = (await this.store.query<TestDoc>(C.tests, {})).items;
    this.cache = { version: v, tests };
    return tests;
  }

  /** Call after writing tests. `changed` = the full new documents; `reloadAll` after bulk writes. */
  private async touch(changed: TestDoc[], reloadAll = false): Promise<void> {
    const v = `${Date.now().toString(36)}-${this.store.newId().slice(0, 8)}`;
    // Read + move the marker atomically: if another server moved it in between, the
    // transaction retries and sees that, so this copy is never patched over a write it missed.
    const before = await this.store.transaction(async (tx) => {
      const cur = (await tx.get<{ id: string; v: string }>(C.catalogIndex, 'version'))?.v ?? 'none';
      tx.set(C.catalogIndex, 'version', { id: 'version', v });
      return cur;
    });
    if (!reloadAll && this.cache && this.cache.version === before) {
      const byId = new Map(this.cache.tests.map((t) => [t.id, t]));
      for (const t of changed) byId.set(t.id, t);
      this.cache = { version: v, tests: [...byId.values()] };
    } else this.cache = undefined;
  }

  // ─── Categories ──
  private catCache?: { version: string; items: TestCategoryDoc[] };

  /** Categories, kept with the same version marker as the tests (1 small read when unchanged). */
  async categories(knownVersion?: string): Promise<TestCategoryDoc[]> {
    const v = knownVersion ?? (await this.catalogVersion());
    usage.cache('testCategories', this.catCache?.version === v);
    if (this.catCache?.version === v) return this.catCache.items;
    const items = (await this.store.query<TestCategoryDoc>(C.testCategories, { orderBy: { field: 'sortOrder' } })).items;
    this.catCache = { version: v, items };
    return items;
  }

  async createCategory(dto: z.infer<typeof CategoryDto>, actor: AuthUser) {
    const doc: TestCategoryDoc = { ...dto, id: this.store.newId() };
    await this.store.create(C.testCategories, doc.id, doc);
    await this.touch([]);
    await this.audit.record({ action: 'test_category.create', entity: 'testCategory', entityId: doc.id, actor: toActor(actor) });
    await this.rebuildCatalog();
    return doc;
  }

  async updateCategory(id: string, dto: Partial<z.infer<typeof CategoryDto>>, actor: AuthUser) {
    const before = await this.store.get<TestCategoryDoc>(C.testCategories, id);
    if (!before) throw notFound('Category');
    const next = { ...before, ...dto };
    await this.store.set(C.testCategories, id, next);
    await this.touch([]);
    await this.audit.record({ action: 'test_category.update', entity: 'testCategory', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    await this.rebuildCatalog();
    return next;
  }

  // ─── Tests ──
  async list(q: z.infer<typeof TestQuery>) {
    const token = q.q && normalizeSearch(q.q).length >= 2 ? normalizeSearch(q.q) : undefined;
    return (await this.allTests())
      .filter((t) => (!q.categoryId || t.categoryId === q.categoryId) && (!q.active || t.active === (q.active === 'true')) && (!token || (t.searchTokens ?? []).includes(token)))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(({ searchTokens: _t, ...t }) => t);
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
    await this.touch([doc]);
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
    await this.touch([next]);
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
    const [all, categories] = await Promise.all([this.allTests(), this.categories()]);
    const tests = [...all].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const doc: CatalogIndexDoc = {
      id: 'main',
      updatedAt: this.store.now(),
      categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, active: c.active })),
      tests: tests.map((t) => ({
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
    const byId = new Map((await this.allTests()).map((t) => [t.id, t]));
    const docs: TestDoc[] = [];
    await mapLimit(changes, 20, async ({ testId, price }) => {
      const t = byId.get(testId);
      if (!t) throw notFound(`Test ${testId}`);
      if (t.price === price) return;
      const updatedAt = this.store.now();
      await this.store.update(C.tests, testId, { price, updatedAt });
      docs.push({ ...t, price, updatedAt });
      updated.push({ code: t.code, name: t.name, from: t.price, to: price });
    });
    if (updated.length) {
      await this.touch(docs);
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
    let newCategories = 0;
    const catId = new Map<string, string>();
    for (const d of DEPARTMENTS) {
      const found = existingCats.find((c) => c.name.toLowerCase() === d.name.toLowerCase());
      if (found) catId.set(d.key, found.id);
      else {
        const doc: TestCategoryDoc = { id: this.store.newId(), name: d.name, sortOrder: d.sortOrder, active: true };
        await this.store.create(C.testCategories, doc.id, doc);
        newCategories++;
        catId.set(d.key, doc.id);
      }
    }
    const existing = await this.allTests();
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
    if (created || updated || newCategories) await this.touch([], true);
    await this.rebuildCatalog();
    return { rows: rows.length, created, updated, unchanged };
  }

  // ─── Bulk reference ranges (spreadsheet) ──

  /** One row per parameter of every offered test (plus one row per existing range), for filling in Excel. */
  async rangesTemplate() {
    const tests = (await this.allTests()).filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name));
    const rows: Array<Record<string, string | number>> = [];
    for (const t of tests)
      for (const p of t.parameters) {
        const base = { code: t.code, testName: t.name, parameter: p.name, unit: p.unit ?? '' };
        if (!p.ranges.length) rows.push({ ...base, gender: 'any', ageFrom: '', ageTo: '', low: '', high: '', normalText: '', criticalLow: '', criticalHigh: '', status: '' });
        for (const r of p.ranges)
          rows.push({ ...base, gender: r.gender, ageFrom: r.ageMinYears ?? '', ageTo: r.ageMaxYears ?? '', low: r.low ?? '', high: r.high ?? '', normalText: (r.text ?? '').split('\n').join(' | '), criticalLow: r.criticalLow ?? '', criticalHigh: r.criticalHigh ?? '', status: r.status });
      }
    return rows;
  }

  /**
   * Import ranges and units from the spreadsheet. For every parameter that has range
   * rows in the file, its ranges are replaced by the file's rows: identical approved
   * ranges stay approved, anything new or changed becomes DRAFT and must be approved.
   * Rows with only a unit update the unit and leave ranges untouched.
   */
  async importRanges(rows: RangeImportRowInput[], actor: AuthUser) {
    const byCode = new Map<string, RangeImportRowInput[]>();
    for (const r of rows) byCode.set(r.code.toUpperCase(), [...(byCode.get(r.code.toUpperCase()) ?? []), r]);
    const problems: string[] = [];
    let testsChanged = 0, rangesWritten = 0, unitsSet = 0;
    const rangeKey = (r: Partial<ReferenceRange>) => JSON.stringify([r.gender, r.ageMinYears, r.ageMaxYears, r.low, r.high, r.text, r.criticalLow, r.criticalHigh]);

    const testByCode = new Map((await this.allTests()).map((t) => [t.code.toUpperCase(), t]));
    await mapLimit([...byCode.entries()], 10, async ([code, list]) => {
      const found = testByCode.get(code);
      if (!found) return void problems.push(`Code ${code}: test not found`);
      const params = found.parameters.map((p) => ({ ...p, ranges: [...p.ranges] }));
      let changed = false;
      const byParam = new Map<string, RangeImportRowInput[]>();
      for (const r of list) byParam.set(r.parameter.trim().toLowerCase(), [...(byParam.get(r.parameter.trim().toLowerCase()) ?? []), r]);
      for (const [pname, prow] of byParam) {
        const p = params.find((x) => x.name.toLowerCase() === pname) ?? (params.length === 1 && [found.name.toLowerCase(), 'result'].includes(pname) ? params[0] : undefined);
        if (!p) {
          problems.push(`Code ${code}: parameter "${prow[0].parameter}" not found in ${found.name}`);
          continue;
        }
        const unit = prow.find((r) => r.unit)?.unit;
        if (unit && unit !== p.unit) {
          p.unit = unit;
          unitsSet++;
          changed = true;
        }
        const withRange = prow.filter((r) => r.low !== undefined || r.high !== undefined || r.text || r.criticalLow !== undefined || r.criticalHigh !== undefined);
        if (!withRange.length) continue;
        if (withRange.some((r) => r.low !== undefined || r.high !== undefined) && p.inputType === 'text') p.inputType = 'numeric';
        p.ranges = withRange.map((r) => {
          const next = { gender: r.gender, ageMinYears: r.ageFrom, ageMaxYears: r.ageTo, low: r.low, high: r.high, text: r.text, criticalLow: r.criticalLow, criticalHigh: r.criticalHigh };
          const same = found.parameters.find((x) => x.id === p.id)?.ranges.find((x) => rangeKey(x) === rangeKey(next));
          rangesWritten++;
          return same ?? { ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== '')), gender: r.gender, id: this.store.newId().slice(0, 12), status: 'draft' as const } as ReferenceRange;
        });
        changed = true;
      }
      if (!changed) return;
      await this.store.update(C.tests, found.id, { parameters: params, updatedAt: this.store.now() });
      testsChanged++;
    });

    if (testsChanged) await this.touch([], true);
    await this.audit.record({ action: 'reference_range.bulk_import', entity: 'test', entityId: 'bulk', actor: toActor(actor), changes: { rows: rows.length, testsChanged, rangesWritten, unitsSet, problems: problems.slice(0, 50) } });
    return { rows: rows.length, testsChanged, rangesWritten, unitsSet, problems };
  }

  // ─── Standard result rows for multi-analyte tests ──

  /** Tests with results still being entered or verified: their rows must not change under the technician. */
  private async openResultTestIds(): Promise<Set<string>> {
    const open = await this.store.query<ResultDoc>(C.results, { where: [{ field: 'status', op: 'in', value: ['pending', 'draft', 'submitted', 'correction_requested', 'rejected'] }], limit: 5000 });
    return new Set(open.items.map((r) => r.testId));
  }

  /** Preview (apply = false) or apply the standard result rows. New ranges are DRAFT until approved. */
  async standardPanels(actor: AuthUser, apply: boolean) {
    const [tests, openIds] = await Promise.all([this.allTests(), this.openResultTestIds()]);
    const plans = planPanels(tests, openIds);
    if (!apply) return { tests: plans.map(({ panel: _p, ...p }) => p), applied: 0 };
    const byId = new Map(tests.map((t) => [t.id, t]));
    const todo = plans.filter((p) => p.action === 'replace' || p.action === 'add');
    const now = this.store.now();
    await mapLimit(todo, 10, async (plan) => {
      const test = byId.get(plan.testId)!;
      const parameters = buildParameters(test, plan, () => this.store.newId().slice(0, 12));
      await this.store.update(C.tests, test.id, { parameters, updatedAt: now });
    });
    await this.audit.record({
      action: 'test.standard_rows', entity: 'test', entityId: 'bulk', actor: toActor(actor),
      changes: { applied: todo.map((p) => `${p.code} ${p.name}: ${p.action} ${p.rows.length} rows`) },
    });
    if (todo.length) await this.touch([], true);
    return { tests: plans.map(({ panel: _p, ...p }) => p), applied: todo.length };
  }

  /** How many ranges are waiting for approval (shown on the catalogue page). */
  async draftRangeCount() {
    const tests = await this.allTests();
    return tests.reduce((n, t) => n + t.parameters.reduce((m, p) => m + p.ranges.filter((r) => r.status === 'draft').length, 0), 0);
  }

  /** Approve every draft range in one action (qualified approver only — checked by the controller). */
  async approveAllDraftRanges(actor: AuthUser) {
    const tests = (await this.allTests()).filter((t) => t.parameters.some((p) => p.ranges.some((r) => r.status === 'draft')));
    const now = this.store.now();
    let approved = 0;
    await mapLimit(tests, 10, async (t) => {
      const params = t.parameters.map((p) => ({
        ...p,
        ranges: p.ranges.map((r) => {
          if (r.status !== 'draft') return r;
          approved++;
          return { ...r, status: 'approved' as const, approvedBy: toActor(actor), approvedAt: now };
        }),
      }));
      await this.store.update(C.tests, t.id, { parameters: params, updatedAt: now });
    });
    if (tests.length) await this.touch([], true);
    await this.audit.record({ action: 'reference_range.bulk_approve', entity: 'test', entityId: 'bulk', actor: toActor(actor), changes: { tests: tests.length, approved } });
    return { tests: tests.length, approved };
  }

  async approveRange(testId: string, parameterId: string, rangeId: string, actor: AuthUser): Promise<TestDoc> {
    const test = await this.get(testId);
    const param = test.parameters.find((p) => p.id === parameterId);
    const range = param?.ranges.find((r) => r.id === rangeId);
    if (!param || !range) throw notFound('Reference range');
    range.status = 'approved';
    range.approvedBy = toActor(actor);
    range.approvedAt = this.store.now();
    const updatedAt = this.store.now();
    await this.store.update(C.tests, testId, { parameters: test.parameters, updatedAt });
    await this.touch([{ ...test, updatedAt }]);
    await this.audit.record({
      action: 'reference_range.approve',
      entity: 'test',
      entityId: testId,
      actor: toActor(actor),
      changes: { parameter: param.name, range: { low: range.low, high: range.high, text: range.text, gender: range.gender } },
    });
    return test;
  }

  /**
   * Quick "set normal value" from the result screens. Replaces only the general range
   * (all genders, all ages) of one parameter; gender/age ranges are kept. Approved at
   * once when the user may approve ranges, otherwise saved as a draft. Results that are
   * not yet approved are re-flagged against the approved ranges.
   */
  async setNormalValue(testId: string, parameterId: string, dto: z.infer<typeof NormalValueDto>, actor: AuthUser) {
    const test = await this.get(testId);
    const param = test.parameters.find((p) => p.id === parameterId);
    if (!param) throw notFound('Parameter');
    const text = dto.text?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n') || undefined;
    const general = param.ranges.find((r) => r.gender === 'any' && r.ageMinYears === undefined && r.ageMaxYears === undefined);
    const approved = actor.permissions.includes('tests.approveRanges');
    const now = this.store.now();
    const range: ReferenceRange = {
      id: general?.id ?? this.store.newId().slice(0, 12),
      gender: 'any',
      ...(dto.low !== undefined ? { low: dto.low } : {}),
      ...(dto.high !== undefined ? { high: dto.high } : {}),
      ...(text ? { text } : {}),
      ...(general?.criticalLow !== undefined ? { criticalLow: general.criticalLow } : {}),
      ...(general?.criticalHigh !== undefined ? { criticalHigh: general.criticalHigh } : {}),
      status: approved ? 'approved' : 'draft',
      ...(approved ? { approvedBy: toActor(actor), approvedAt: now } : {}),
    };
    const unit = dto.unit === undefined ? param.unit : dto.unit || undefined;
    const { unit: _u, ...rest } = param;
    const nextParam: TestParameter = {
      ...rest,
      ...(unit ? { unit } : {}),
      // Numbers on a text row turn it into a number row, as the spreadsheet import does.
      inputType: param.inputType === 'text' && (dto.low !== undefined || dto.high !== undefined) ? 'numeric' : param.inputType,
      ranges: general ? param.ranges.map((r) => (r === general ? range : r)) : [range, ...param.ranges],
    };
    const parameters = test.parameters.map((p) => (p.id === parameterId ? nextParam : p));
    await this.store.update(C.tests, testId, { parameters, updatedAt: now });
    await this.touch([{ ...test, parameters, updatedAt: now }]);
    await this.audit.record({
      action: 'reference_range.quick_set',
      entity: 'test',
      entityId: testId,
      actor: toActor(actor),
      changes: { parameter: param.name, from: general ? { low: general.low, high: general.high, text: general.text } : null, to: { low: range.low, high: range.high, text: range.text, unit }, status: range.status },
    });
    const reflagged = approved ? await this.reflagOpenResults({ ...test, parameters }) : 0;
    return { approved, reflagged };
  }

  /** Re-computes flags of results not yet approved (approved results change only through an amendment). */
  private async reflagOpenResults(test: TestDoc): Promise<number> {
    const open = new Set(['draft', 'submitted', 'correction_requested', 'rejected']);
    const results = (await this.store.query<ResultDoc>(C.results, { where: [{ field: 'testId', op: '==', value: test.id }], limit: 2000 })).items.filter((r) => open.has(r.status) && r.values.length);
    let n = 0;
    await mapLimit(results, 10, async (r) => {
      const patient = await this.store.get<PatientDoc>(C.patients, r.patientId);
      if (!patient) return;
      const values = r.values.map((v) => {
        const p = test.parameters.find((x) => x.id === v.parameterId);
        if (!p) return v;
        const range = selectRange(p, patient.gender, patient.ageYears);
        const { flag, numericValue } = flagValue(p, v.value, range);
        return { ...v, flag, ...(numericValue !== undefined ? { numericValue } : {}), ...(p.unit ? { unit: p.unit } : {}), referenceRange: range ? { low: range.low, high: range.high, text: range.text, rangeId: range.id } : undefined };
      });
      if (JSON.stringify(values) === JSON.stringify(r.values)) return;
      await this.store.update(C.results, r.id, { values, hasCritical: values.some((v) => isCritical(v.flag)), updatedAt: this.store.now() });
      n++;
    });
    return n;
  }
}

export const NormalValueDto = z
  .object({
    text: optionalText(600),
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    unit: optionalText(30),
  })
  .refine((r) => !!r.text || r.low !== undefined || r.high !== undefined, { message: 'Enter the normal value' })
  .refine((r) => r.low === undefined || r.high === undefined || r.low <= r.high, { message: 'Lowest normal must not be more than highest normal' });
