import { Controller, Get, Module, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { OrdersModule } from '../orders/orders.module';
import { AmendDto, DecisionDto, EnterValuesDto, RejectDto, ResultQuery, ResultsService } from './results.service';

@ApiTags('Results & verification')
@ApiBearerAuth()
@Controller('results')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  @RequirePermissions('results.read')
  @ApiZodQuery(ResultQuery)
  list(@ZodQuery(ResultQuery) q: z.infer<typeof ResultQuery>) {
    return this.results.list(q);
  }

  @Get(':id')
  @RequirePermissions('results.read')
  workspace(@Param('id') id: string) {
    return this.results.workspace(id);
  }

  @Put(':id/values')
  @RequirePermissions('results.enter')
  @ApiZodBody(EnterValuesDto)
  enter(@Param('id') id: string, @ZodBody(EnterValuesDto) dto: z.infer<typeof EnterValuesDto>, @CurrentUser() u: AuthUser) {
    return this.results.enterValues(id, dto, u);
  }

  @Post(':id/approve')
  @RequirePermissions('results.approve')
  @ApiZodBody(DecisionDto)
  approve(@Param('id') id: string, @ZodBody(DecisionDto) dto: z.infer<typeof DecisionDto>, @CurrentUser() u: AuthUser) {
    return this.results.approve(id, dto, u);
  }

  @Post(':id/reject')
  @RequirePermissions('results.approve')
  @ApiZodBody(RejectDto)
  reject(@Param('id') id: string, @ZodBody(RejectDto) dto: z.infer<typeof RejectDto>, @CurrentUser() u: AuthUser) {
    return this.results.reject(id, dto, u);
  }

  @Post(':id/amend')
  @RequirePermissions('results.amend')
  @ApiZodBody(AmendDto)
  amend(@Param('id') id: string, @ZodBody(AmendDto) dto: z.infer<typeof AmendDto>, @CurrentUser() u: AuthUser) {
    return this.results.amend(id, dto, u);
  }
}

@Module({ imports: [OrdersModule], controllers: [ResultsController], providers: [ResultsService], exports: [ResultsService] })
export class ResultsModule {}
