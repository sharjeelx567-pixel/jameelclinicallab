import { Controller, Get, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { OrdersModule } from '../orders/orders.module';
import { SampleActionDto, SampleQuery, SamplesService } from './samples.service';

const LabelDto = z.object({ kind: z.enum(['sample', 'order', 'patient']).default('sample') });

@ApiTags('Samples')
@ApiBearerAuth()
@Controller('samples')
export class SamplesController {
  constructor(private readonly samples: SamplesService) {}

  @Get()
  @RequirePermissions('samples.read')
  @ApiZodQuery(SampleQuery)
  list(@ZodQuery(SampleQuery) q: z.infer<typeof SampleQuery>) {
    return this.samples.list(q);
  }

  @Get('barcode/:code')
  @RequirePermissions('samples.read')
  byBarcode(@Param('code') code: string) {
    return this.samples.byBarcode(code);
  }

  @Get(':id')
  @RequirePermissions('samples.read')
  get(@Param('id') id: string) {
    return this.samples.get(id);
  }

  @Post(':id/collect')
  @RequirePermissions('samples.collect')
  @ApiZodBody(SampleActionDto)
  collect(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'collect', dto, u);
  }

  @Post(':id/receive')
  @RequirePermissions('samples.collect')
  @ApiZodBody(SampleActionDto)
  receive(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'receive', dto, u);
  }

  @Post(':id/accept')
  @RequirePermissions('samples.process')
  @ApiZodBody(SampleActionDto)
  accept(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'accept', dto, u);
  }

  @Post(':id/process')
  @RequirePermissions('samples.process')
  @ApiZodBody(SampleActionDto)
  process(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'process', dto, u);
  }

  @Post(':id/complete')
  @RequirePermissions('samples.process')
  @ApiZodBody(SampleActionDto)
  complete(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'complete', dto, u);
  }

  @Post(':id/reject')
  @RequirePermissions('samples.process')
  @ApiZodBody(SampleActionDto)
  reject(@Param('id') id: string, @ZodBody(SampleActionDto) dto: z.infer<typeof SampleActionDto>, @CurrentUser() u: AuthUser) {
    return this.samples.transition(id, 'reject', dto, u);
  }

  @Post(':id/label-prints')
  @RequirePermissions('samples.read')
  @ApiZodBody(LabelDto)
  labelPrint(@Param('id') id: string, @ZodBody(LabelDto) dto: z.infer<typeof LabelDto>, @CurrentUser() u: AuthUser) {
    return this.samples.recordLabelPrint(id, dto.kind, u);
  }
}

@Module({ imports: [OrdersModule], controllers: [SamplesController], providers: [SamplesService], exports: [SamplesService] })
export class SamplesModule {}
