import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ReferenceRange, TestCategoryDoc, TestDoc, TestParameter } from '../../common/entities';
import { badRequest, conflict, notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { buildSearchTokens, diff, docId, money, normalizeSearch, optionalText, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';

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
    return doc;
  }

  async updateCategory(id: string, dto: Partial<z.infer<typeof CategoryDto>>, actor: AuthUser) {
    const before = await this.store.get<TestCategoryDoc>(C.testCategories, id);
    if (!before) throw notFound('Category');
    const next = { ...before, ...dto };
    await this.store.set(C.testCategories, id, next);
    await this.audit.record({ action: 'test_category.update', entity: 'testCategory', entityId: id, actor: toActor(actor), changes: diff(before, next) });
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
    return next;
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
