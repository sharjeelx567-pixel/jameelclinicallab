import { Controller, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { OrderDoc, PanelDoc, PaymentDoc } from '../../common/entities';
import { notFound } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore } from '../../database/data-store';
import { ApiZodBody, CurrentUser, RequirePermissions, ZodBody } from '../../decorators';
import { diff, money, optionalText, patchOf, requiredText } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';

const PanelDto = z.object({
  name: requiredText(120),
  type: z.enum(['insurance', 'corporate']),
  contactPerson: optionalText(80),
  phone: optionalText(20),
  email: z.email().max(120).optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  rates: z.record(z.string().max(64), money).default({}),
  creditLimit: money.optional(),
  active: z.boolean().default(true),
});
const PartialPanel = patchOf(PanelDto);

@Injectable()
export class PanelsService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PanelDoc[]> {
    return (await this.store.query<PanelDoc>(C.insurancePanels, { orderBy: { field: 'name' } })).items;
  }

  async get(id: string): Promise<PanelDoc> {
    const p = await this.store.get<PanelDoc>(C.insurancePanels, id);
    if (!p) throw notFound('Panel');
    return p;
  }

  async create(dto: z.infer<typeof PanelDto>, actor: AuthUser) {
    const now = this.store.now();
    const doc: PanelDoc = { ...dto, id: this.store.newId(), createdAt: now, updatedAt: now };
    await this.store.create(C.insurancePanels, doc.id, doc);
    await this.audit.record({ action: 'panel.create', entity: 'panel', entityId: doc.id, actor: toActor(actor) });
    return doc;
  }

  async update(id: string, dto: z.infer<typeof PartialPanel>, actor: AuthUser) {
    const before = await this.get(id);
    const next = { ...before, ...dto, updatedAt: this.store.now() };
    await this.store.set(C.insurancePanels, id, next);
    await this.audit.record({ action: 'panel.update', entity: 'panel', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    return next;
  }

  /** Panel-wise billing: orders billed to the panel, outstanding balance and payment history. */
  async statement(id: string) {
    const panel = await this.get(id);
    const orders = (
      await this.store.query<OrderDoc>(C.orders, { where: [{ field: 'panelId', op: '==', value: id }], orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 })
    ).items.filter((o) => o.status !== 'cancelled');
    const orderIds = new Set(orders.map((o) => o.id));
    const payments = (
      await this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'method', op: '==', value: 'panel' }], orderBy: { field: 'recordedAt', direction: 'desc' }, limit: 500 })
    ).items.filter((p) => orderIds.has(p.orderId));
    return {
      panel,
      totals: {
        billed: orders.reduce((s, o) => s + o.billing.total, 0),
        outstanding: orders.reduce((s, o) => s + o.billing.balance, 0),
        orders: orders.length,
      },
      outstandingOrders: orders
        .filter((o) => o.billing.balance > 0)
        .map((o) => ({ id: o.id, orderNumber: o.orderNumber, patientName: o.patientName, total: o.billing.total, balance: o.billing.balance, createdAt: o.createdAt })),
      payments,
    };
  }
}

@ApiTags('Insurance & panels')
@ApiBearerAuth()
@Controller('panels')
export class PanelsController {
  constructor(private readonly panels: PanelsService) {}

  @Get()
  @RequirePermissions('panels.read')
  list() {
    return this.panels.list();
  }

  @Get(':id')
  @RequirePermissions('panels.read')
  statement(@Param('id') id: string) {
    return this.panels.statement(id);
  }

  @Post()
  @RequirePermissions('panels.write')
  @ApiZodBody(PanelDto)
  create(@ZodBody(PanelDto) dto: z.infer<typeof PanelDto>, @CurrentUser() user: AuthUser) {
    return this.panels.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('panels.write')
  @ApiZodBody(PartialPanel)
  update(@Param('id') id: string, @ZodBody(PartialPanel) dto: z.infer<typeof PartialPanel>, @CurrentUser() user: AuthUser) {
    return this.panels.update(id, dto, user);
  }
}

@Module({ controllers: [PanelsController], providers: [PanelsService] })
export class PanelsModule {}
