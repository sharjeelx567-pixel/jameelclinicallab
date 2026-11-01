import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { patchOf } from '../../utils';
import { CategoryDto, TestDto, TestQuery, TestsService } from './tests.service';

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
