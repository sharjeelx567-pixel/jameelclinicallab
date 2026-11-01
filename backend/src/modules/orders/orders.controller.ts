import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ApiZodBody, ApiZodQuery, CurrentUser, RequirePermissions, ZodBody, ZodQuery } from '../../decorators';
import { requiredText } from '../../utils';
import { CreateOrderDto, OrderQuery, OrdersService, UpdateOrderDto } from './orders.service';
import { Idempotent } from '../../interceptors/idempotency.interceptor';

const QuoteDto = CreateOrderDto.pick({ patientId: true, testIds: true, panelId: true });
const CancelDto = z.object({ reason: requiredText(300) });

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  @ApiZodQuery(OrderQuery)
  list(@ZodQuery(OrderQuery) q: z.infer<typeof OrderQuery>) {
    return this.orders.list(q);
  }

  /** Server-side price calculation shown to the receptionist before confirming. */
  @Post('quote')
  @RequirePermissions('orders.create')
  @ApiZodBody(QuoteDto)
  quote(@ZodBody(QuoteDto) dto: z.infer<typeof QuoteDto>) {
    return this.orders.quote(dto);
  }

  @Post()
  @Idempotent()
  @RequirePermissions('orders.create')
  @ApiZodBody(CreateOrderDto)
  create(@ZodBody(CreateOrderDto) dto: z.infer<typeof CreateOrderDto>, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  detail(@Param('id') id: string) {
    return this.orders.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('orders.create')
  @ApiZodBody(UpdateOrderDto)
  update(@Param('id') id: string, @ZodBody(UpdateOrderDto) dto: z.infer<typeof UpdateOrderDto>, @CurrentUser() user: AuthUser) {
    return this.orders.update(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('orders.cancel')
  @ApiZodBody(CancelDto)
  cancel(@Param('id') id: string, @ZodBody(CancelDto) dto: z.infer<typeof CancelDto>, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, dto.reason, user);
  }
}
