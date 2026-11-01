import { Controller, Get, Headers, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { InventoryItemDoc, InventoryTransactionDoc } from '../../common/entities';
import { notFound, unprocessable } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { ApiZodBody, CurrentUser, Public, RequirePermissions, ZodBody } from '../../decorators';
import { buildSearchTokens, diff, isoDate, patchOf, money, normalizeSearch, optionalText, requiredText, round2 } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { Idempotent } from '../../interceptors/idempotency.interceptor';

const CATEGORIES = ['reagent', 'chemical', 'consumable', 'tube', 'needle', 'gloves', 'equipment_supply', 'other'] as const;

const ItemDto = z.object({
  name: requiredText(120),
  category: z.enum(CATEGORIES),
  unit: requiredText(20),
  minimumLevel: z.number().min(0).max(1_000_000),
  supplier: optionalText(120),
  purchasePrice: money.optional(),
  batchNumber: optionalText(60),
  expiryDate: isoDate.optional(),
  location: optionalText(80),
  active: z.boolean().default(true),
  /** Opening stock — recorded as a "receive" transaction. */
  openingQuantity: z.number().min(0).max(1_000_000).default(0),
});
const UpdateItemDto = patchOf(ItemDto.omit({ openingQuantity: true }));

const MovementDto = z.object({
  type: z.enum(['receive', 'consume', 'adjust', 'discard']),
  /** Positive for receive/consume/discard. For adjust: the new counted quantity. */
  quantity: z.number().min(0).max(1_000_000),
  unitPrice: money.optional(),
  batchNumber: optionalText(60),
  expiryDate: isoDate.optional(),
  supplier: optionalText(120),
  note: optionalText(300),
});

@Injectable()
export class InventoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    // Serverless (Vercel) instances sleep between requests: the scan runs from Vercel Cron instead (GET /inventory/expiry-scan).
    if (process.env.NODE_ENV === 'test' || process.env.VERCEL) return;
    // Twice-daily expiry scan; results surface as role-aware notifications.
    this.timer = setInterval(() => void this.expiryScan().catch((e: Error) => this.logger.error(`Expiry scan failed: ${e.message}`)), 12 * 3600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(q?: string, category?: string) {
    const where: WhereClause[] = [];
    if (category) where.push({ field: 'category', op: '==', value: category });
    if (q && normalizeSearch(q).length >= 2) where.push({ field: 'searchTokens', op: 'array-contains', value: normalizeSearch(q) });
    const res = await this.store.query<InventoryItemDoc>(C.inventoryItems, { where, orderBy: { field: 'name' } });
    return res.items.map(({ searchTokens: _t, ...i }) => i);
  }

  async alerts() {
    const settings = await this.settings.get();
    const items = await this.list();
    const horizon = new Date(Date.now() + settings.notifications.expiryDays * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return {
      lowStock: items.filter((i) => i.active && i.quantity <= i.minimumLevel),
      expiringSoon: items.filter((i) => i.active && i.expiryDate && i.expiryDate >= today && i.expiryDate <= horizon),
      expired: items.filter((i) => i.active && i.expiryDate && i.expiryDate < today),
    };
  }

  async expiryScan() {
    const { expiringSoon, expired } = await this.alerts();
    if (expiringSoon.length || expired.length)
      await this.notifications.notify({
        kind: 'expiring_stock',
        severity: expired.length ? 'warning' : 'info',
        title: 'Inventory expiry check',
        body: `${expired.length} expired and ${expiringSoon.length} expiring item(s) need attention.`,
        link: '/inventory?view=alerts',
        audiencePermission: 'inventory.read',
      });
  }

  async get(id: string) {
    const item = await this.store.get<InventoryItemDoc>(C.inventoryItems, id);
    if (!item) throw notFound('Inventory item');
    const tx = await this.store.query<InventoryTransactionDoc>(C.inventoryTransactions, { where: [{ field: 'itemId', op: '==', value: id }], orderBy: { field: 'at', direction: 'desc' }, limit: 100 });
    const { searchTokens: _t, ...rest } = item;
    return { item: rest, transactions: tx.items };
  }

  async create(dto: z.infer<typeof ItemDto>, actor: AuthUser) {
    const { openingQuantity, ...fields } = dto;
    const now = this.store.now();
    const item: InventoryItemDoc = { ...fields, id: this.store.newId(), quantity: 0, searchTokens: buildSearchTokens(dto.name, dto.supplier, dto.batchNumber), createdAt: now, updatedAt: now };
    await this.store.create(C.inventoryItems, item.id, item);
    await this.audit.record({ action: 'inventory.item_create', entity: 'inventoryItem', entityId: item.id, actor: toActor(actor) });
    if (openingQuantity > 0) await this.move(item.id, { type: 'receive', quantity: openingQuantity, unitPrice: dto.purchasePrice, note: 'Opening stock' }, actor);
    return (await this.get(item.id)).item;
  }

  async update(id: string, dto: z.infer<typeof UpdateItemDto>, actor: AuthUser) {
    const before = await this.store.get<InventoryItemDoc>(C.inventoryItems, id);
    if (!before) throw notFound('Inventory item');
    const next = { ...before, ...dto, updatedAt: this.store.now() };
    next.searchTokens = buildSearchTokens(next.name, next.supplier, next.batchNumber);
    await this.store.set(C.inventoryItems, id, next);
    await this.audit.record({ action: 'inventory.item_update', entity: 'inventoryItem', entityId: id, actor: toActor(actor), changes: diff(before, next) });
    return next;
  }

  /** Atomic stock movement with ledger entry. Stock can never go negative. */
  async move(id: string, dto: z.infer<typeof MovementDto>, actor: AuthUser) {
    const by = toActor(actor);
    return this.store.transaction(async (tx) => {
      const item = await tx.get<InventoryItemDoc>(C.inventoryItems, id);
      if (!item) throw notFound('Inventory item');
      if (dto.type !== 'adjust' && dto.quantity <= 0) throw unprocessable('QUANTITY_REQUIRED', 'Quantity must be greater than zero');
      if (dto.type === 'adjust' && !dto.note) throw unprocessable('NOTE_REQUIRED', 'Explain the reason for a stock adjustment');
      const delta = dto.type === 'receive' ? dto.quantity : dto.type === 'adjust' ? dto.quantity - item.quantity : -dto.quantity;
      const balanceAfter = round2(item.quantity + delta);
      if (balanceAfter < 0) throw unprocessable('INSUFFICIENT_STOCK', `Only ${item.quantity} ${item.unit} in stock`);
      const now = this.store.now();
      const entry: InventoryTransactionDoc = {
        id: this.store.newId(),
        itemId: id,
        itemName: item.name,
        type: dto.type,
        quantity: dto.type === 'adjust' ? round2(delta) : dto.quantity,
        balanceAfter,
        unitPrice: dto.unitPrice,
        batchNumber: dto.batchNumber,
        expiryDate: dto.expiryDate,
        supplier: dto.supplier,
        note: dto.note,
        by,
        at: now,
      };
      tx.create(C.inventoryTransactions, entry.id, entry);
      tx.update(C.inventoryItems, id, {
        quantity: balanceAfter,
        updatedAt: now,
        ...(dto.type === 'receive' && {
          ...(dto.batchNumber && { batchNumber: dto.batchNumber }),
          ...(dto.expiryDate && { expiryDate: dto.expiryDate }),
          ...(dto.supplier && { supplier: dto.supplier }),
          ...(dto.unitPrice !== undefined && { purchasePrice: dto.unitPrice }),
        }),
      });
      if (item.quantity > item.minimumLevel && balanceAfter <= item.minimumLevel) {
        this.notifications.notifyInTx(tx, {
          kind: 'low_stock',
          severity: 'warning',
          title: `Low stock: ${item.name}`,
          body: `${balanceAfter} ${item.unit} remaining (minimum ${item.minimumLevel}).`,
          link: `/inventory?item=${id}`,
          audiencePermission: 'inventory.read',
        });
      }
      this.audit.recordInTx(tx, { action: `inventory.${dto.type}`, entity: 'inventoryItem', entityId: id, actor: by, changes: { quantity: entry.quantity, balanceAfter }, note: dto.note });
      return entry;
    });
  }

  async consumption(from?: string, to?: string) {
    const where: WhereClause[] = [{ field: 'type', op: '==', value: 'consume' }];
    if (from) where.push({ field: 'at', op: '>=', value: from });
    if (to) where.push({ field: 'at', op: '<=', value: to });
    const { items } = await this.store.query<InventoryTransactionDoc>(C.inventoryTransactions, { where, orderBy: { field: 'at', direction: 'desc' }, limit: 1000 });
    const byItem = new Map<string, { itemName: string; quantity: number }>();
    for (const t of items) {
      const e = byItem.get(t.itemId) ?? { itemName: t.itemName, quantity: 0 };
      e.quantity += t.quantity;
      byItem.set(t.itemId, e);
    }
    return [...byItem.values()].sort((a, b) => b.quantity - a.quantity);
  }
}

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Called by Vercel Cron with "Authorization: Bearer <CRON_SECRET>". Disabled unless CRON_SECRET is set. */
  @Public()
  @Get('expiry-scan')
  async expiryScanCron(@Headers('authorization') authorization?: string) {
    const secret = getEnv().CRON_SECRET;
    const given = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) throw notFound('Route');
    await this.inventory.expiryScan();
    return { ok: true };
  }

  @Get('items')
  @RequirePermissions('inventory.read')
  list(@Query('q') q?: string, @Query('category') category?: string) {
    return this.inventory.list(q?.slice(0, 60), category?.slice(0, 30));
  }

  @Get('alerts')
  @RequirePermissions('inventory.read')
  alerts() {
    return this.inventory.alerts();
  }

  @Get('consumption')
  @RequirePermissions('inventory.read')
  consumption(@Query('from') from?: string, @Query('to') to?: string) {
    return this.inventory.consumption(from, to);
  }

  @Get('items/:id')
  @RequirePermissions('inventory.read')
  get(@Param('id') id: string) {
    return this.inventory.get(id);
  }

  @Post('items')
  @Idempotent()
  @RequirePermissions('inventory.write')
  @ApiZodBody(ItemDto)
  create(@ZodBody(ItemDto) dto: z.infer<typeof ItemDto>, @CurrentUser() u: AuthUser) {
    return this.inventory.create(dto, u);
  }

  @Patch('items/:id')
  @RequirePermissions('inventory.write')
  @ApiZodBody(UpdateItemDto)
  update(@Param('id') id: string, @ZodBody(UpdateItemDto) dto: z.infer<typeof UpdateItemDto>, @CurrentUser() u: AuthUser) {
    return this.inventory.update(id, dto, u);
  }

  @Post('items/:id/movements')
  @Idempotent()
  @RequirePermissions('inventory.write')
  @ApiZodBody(MovementDto)
  move(@Param('id') id: string, @ZodBody(MovementDto) dto: z.infer<typeof MovementDto>, @CurrentUser() u: AuthUser) {
    return this.inventory.move(id, dto, u);
  }
}

@Module({ controllers: [InventoryController], providers: [InventoryService], exports: [InventoryService] })
export class InventoryModule {}
