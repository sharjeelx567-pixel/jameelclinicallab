import { Controller, Get, HttpCode, Module, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/types';
import { CurrentUser, Public, RequirePermissions } from '../../decorators';
import { ReportsService } from './reports.service';
import { TestsModule } from '../tests/tests.module';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Public QR verification — strictly rate limited, returns no clinical data. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.reports.verify(code);
  }

  @Get()
  @RequirePermissions('reports.read')
  list(
    @Query('patientId') patientId?: string,
    @Query('orderId') orderId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
    return this.reports.list({ patientId, orderId, status }, n, cursor);
  }

  @Post('orders/:orderId')
  @RequirePermissions('reports.generate')
  generate(@Param('orderId') orderId: string, @CurrentUser() user: AuthUser) {
    return this.reports.generate(orderId, user);
  }

  @Get(':id')
  @RequirePermissions('reports.read')
  get(@Param('id') id: string) {
    return this.reports.get(id);
  }

  @Get(':id/prints')
  @RequirePermissions('reports.read')
  prints(@Param('id') id: string) {
    return this.reports.prints(id);
  }

  @Post(':id/prints')
  @HttpCode(204)
  @RequirePermissions('reports.print')
  async browserPrint(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.reports.recordPrint(id, 'browser', user);
  }

  @Get(':id/pdf')
  @RequirePermissions('reports.print')
  async pdf(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const { buffer, filename } = await this.reports.pdf(id, user);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="${filename}"` });
  }
}

@Module({ imports: [TestsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
