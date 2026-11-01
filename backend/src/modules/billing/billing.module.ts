import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { BillingService, PaymentQuery, RecordPaymentDto, RefundDto } from './billing.service';
import { Idempotent } from '../../interceptors/idempotency.interceptor';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('payments')
  @RequirePermissions('billing.read')
  @ApiZodQuery(PaymentQuery)
  payments(@ZodQuery(PaymentQuery) q: z.infer<typeof PaymentQuery>) {
    return this.billing.listPayments(q);
  }

  @Get('daily-summary')
  @RequirePermissions('billing.read')
  daily(@Query('date') date?: string) {
    return this.billing.dailySummary(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  }

  @Get('outstanding')
  @RequirePermissions('billing.read')
  outstanding(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.billing.outstanding(Math.min(Math.max(Number(limit) || 25, 1), 100), cursor);
  }

  @Get('orders/:orderId/invoice')
  @RequirePermissions('billing.read')
  invoice(@Param('orderId') orderId: string) {
    return this.billing.invoice(orderId);
  }

  @Post('orders/:orderId/payments')
  @Idempotent()
  @RequirePermissions('billing.collect')
  @ApiZodBody(RecordPaymentDto)
  pay(@Param('orderId') orderId: string, @ZodBody(RecordPaymentDto) dto: z.infer<typeof RecordPaymentDto>, @CurrentUser() u: AuthUser) {
    return this.billing.recordPayment(orderId, dto, u);
  }

  @Post('orders/:orderId/refunds')
  @Idempotent()
  @RequirePermissions('billing.refund')
  @ApiZodBody(RefundDto)
  refund(@Param('orderId') orderId: string, @ZodBody(RefundDto) dto: z.infer<typeof RefundDto>, @CurrentUser() u: AuthUser) {
    return this.billing.refund(orderId, dto, u);
  }
}

@Module({ controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
