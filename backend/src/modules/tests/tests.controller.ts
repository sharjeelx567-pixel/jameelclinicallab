import { Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { patchOf } from '../../utils';
import { RangeImportRow, RateRow } from './rate-list';
import { CategoryDto, TestDto, TestQuery, TestsService } from './tests.service';

const PricesDto = z.object({
  changes: z.array(z.object({ testId: z.string().min(1).max(64), price: z.number().min(0).max(10_000_000) })).min(1).max(2000),
});
const ImportDto = z.object({ rows: z.array(RateRow).min(1).max(3000), updateNames: z.boolean().default(false) });

const RangesImportDto = z.object({ rows: z.array(RangeImportRow).min(1).max(5000) });

const PartialTest = patchOf(TestDto);
const PartialCategory = patchOf(CategoryDto);

@ApiTags('Test catalogue')
@ApiBearerAuth()
@Controller('tests')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Get('categories')
  @RequirePermissions('tests.read')
  categories() {
    return this.tests.categories();
  }

  @Post('categories')
  @RequirePermissions('tests.write')
  @ApiZodBody(CategoryDto)
  createCategory(@ZodBody(CategoryDto) dto: z.infer<typeof CategoryDto>, @CurrentUser() user: AuthUser) {
    return this.tests.createCategory(dto, user);
  }

  @Patch('categories/:id')
  @RequirePermissions('tests.write')
  @ApiZodBody(PartialCategory)
  updateCategory(@Param('id') id: string, @ZodBody(PartialCategory) dto: z.infer<typeof PartialCategory>, @CurrentUser() user: AuthUser) {
    return this.tests.updateCategory(id, dto, user);
  }

  /** Whole catalogue in one read — used by registration/billing and the price list. */
  @Get('catalog')
  @RequirePermissions('tests.read')
  catalog() {
    return this.tests.catalog();
  }

  @Put('prices')
  @RequirePermissions('tests.write')
  @ApiZodBody(PricesDto)
  updatePrices(@ZodBody(PricesDto) dto: z.infer<typeof PricesDto>, @CurrentUser() user: AuthUser) {
    return this.tests.updatePrices(dto.changes, user);
  }

  /** Import or refresh the rate list (CSV rows parsed by the client). Matched by test code. */
  @Post('import')
  @RequirePermissions('tests.write', 'settings.write')
  @ApiZodBody(ImportDto)
  importRateList(@ZodBody(ImportDto) dto: z.infer<typeof ImportDto>, @CurrentUser() user: AuthUser) {
    return this.tests.importRateList(dto.rows, user, { updateNames: dto.updateNames });
  }

  /** Spreadsheet rows: every parameter of every offered test, with existing ranges. */
  @Get('ranges/template')
  @RequirePermissions('tests.read')
  rangesTemplate() {
    return this.tests.rangesTemplate();
  }

  @Get('ranges/drafts')
  @RequirePermissions('tests.read')
  async draftRanges() {
    return { drafts: await this.tests.draftRangeCount() };
  }

  /** Import units and reference ranges from the spreadsheet; new/changed ranges become drafts. */
  @Post('ranges/import')
  @RequirePermissions('tests.write')
  @ApiZodBody(RangesImportDto)
  importRanges(@ZodBody(RangesImportDto) dto: z.infer<typeof RangesImportDto>, @CurrentUser() user: AuthUser) {
    return this.tests.importRanges(dto.rows, user);
  }

  /** Approve all draft ranges at once — qualified approver only. */
  @Post('ranges/approve-drafts')
  @RequirePermissions('tests.approveRanges')
  approveDrafts(@CurrentUser() user: AuthUser) {
    return this.tests.approveAllDraftRanges(user);
  }

  /** Preview the standard result rows (Urine C/E, Stool C/E, Semen, thyroid, coagulation, GTT, …). */
  @Get('standard-rows')
  @RequirePermissions('tests.read')
  previewStandardRows(@CurrentUser() user: AuthUser) {
    return this.tests.standardPanels(user, false);
  }

  /** Apply them: single "Result" boxes become separate rows; new normal values are DRAFT. */
  @Post('standard-rows')
  @RequirePermissions('tests.write')
  applyStandardRows(@CurrentUser() user: AuthUser) {
    return this.tests.standardPanels(user, true);
  }

  @Get()
  @RequirePermissions('tests.read')
  @ApiZodQuery(TestQuery)
  list(@ZodQuery(TestQuery) q: z.infer<typeof TestQuery>) {
    return this.tests.list(q);
  }

  @Get(':id')
  @RequirePermissions('tests.read')
  async get(@Param('id') id: string) {
    const { searchTokens: _t, ...t } = await this.tests.get(id);
    return t;
  }

  @Post()
  @RequirePermissions('tests.write')
  @ApiZodBody(TestDto)
  create(@ZodBody(TestDto) dto: z.infer<typeof TestDto>, @CurrentUser() user: AuthUser) {
    return this.tests.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('tests.write')
  @ApiZodBody(PartialTest)
  update(@Param('id') id: string, @ZodBody(PartialTest) dto: z.infer<typeof PartialTest>, @CurrentUser() user: AuthUser) {
    return this.tests.update(id, dto, user);
  }

  @Post(':id/parameters/:parameterId/ranges/:rangeId/approve')
  @RequirePermissions('tests.approveRanges')
  approveRange(
    @Param('id') id: string,
    @Param('parameterId') parameterId: string,
    @Param('rangeId') rangeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.approveRange(id, parameterId, rangeId, user);
  }
}
