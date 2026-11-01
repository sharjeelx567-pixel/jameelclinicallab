import { Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { HomeSamplingDoc, HomeSamplingStatus, UserDoc } from '../../common/entities';
import { badRequest, notFound, unprocessable } from '../../common/errors';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, WhereClause } from '../../database/data-store';
import { ApiZodBody, CurrentUser, RequirePermissions, ZodBody } from '../../decorators';
import { docId, money, nextSequence, optionalText, pad, pkMobile, requiredText, yearCode } from '../../utils';
import { AuditService } from '../audit-logs/audit.service';
import { Idempotent } from '../../interceptors/idempotency.interceptor';

const CreateDto = z.object({
  patientId: docId.optional(),
  patientName: requiredText(100),
  mobile: pkMobile,
  address: requiredText(400),
  requestedTestIds: z.array(docId).max(60).default([]),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  fee: money.default(0),
  notes: optionalText(500),
});

const UpdateDto = z.object({
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  collectorId: z.string().max(128).optional(),
  fee: money.optional(),
  status: z.enum(['requested', 'scheduled', 'assigned', 'en_route', 'collected', 'cancelled']).optional(),
  note: optionalText(300),
});

const FLOW: Record<HomeSamplingStatus, HomeSamplingStatus[]> = {
  requested: ['scheduled', 'assigned', 'cancelled'],
  scheduled: ['assigned', 'cancelled'],
  assigned: ['en_route', 'scheduled', 'cancelled'],
  en_route: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};

@Injectable()
export class HomeSamplingService {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  async list(status?: string) {
    const where: WhereClause[] = status ? [{ field: 'status', op: '==', value: status }] : [];
    return (await this.store.query<HomeSamplingDoc>(C.homeSamplingRequests, { where, orderBy: { field: 'createdAt', direction: 'desc' }, limit: 200 })).items;
  }

  async get(id: string) {
    const r = await this.store.get<HomeSamplingDoc>(C.homeSamplingRequests, id);
    if (!r) throw notFound('Home sampling request');
    return r;
  }

  async create(dto: z.infer<typeof CreateDto>, actor: AuthUser) {
    const by = toActor(actor);
    return this.store.transaction(async (tx) => {
      const seq = await nextSequence(tx, 'homeSampling');
      const now = this.store.now();
      const status: HomeSamplingStatus = dto.scheduledFor ? 'scheduled' : 'requested';
      const doc: HomeSamplingDoc = { ...dto, id: this.store.newId(), requestNumber: `HS-${yearCode(now)}${pad(seq, 5)}`, status, history: [{ status, at: now, by }], createdAt: now, updatedAt: now };
      tx.create(C.homeSamplingRequests, doc.id, doc);
      this.audit.recordInTx(tx, { action: 'home_sampling.create', entity: 'homeSampling', entityId: doc.id, actor: by });
      return doc;
    });
  }

  async update(id: string, dto: z.infer<typeof UpdateDto>, actor: AuthUser) {
    const by = toActor(actor);
    return this.store.transaction(async (tx) => {
      const r = await tx.get<HomeSamplingDoc>(C.homeSamplingRequests, id);
      if (!r) throw notFound('Home sampling request');
      let collectorName = r.collectorName;
      if (dto.collectorId) {
        const u = await tx.get<UserDoc>(C.users, dto.collectorId);
        if (!u || u.status !== 'active') throw badRequest('COLLECTOR_NOT_FOUND', 'Select an active staff member as collector');
        collectorName = u.displayName;
      }
      let status = dto.status ?? (dto.collectorId && ['requested', 'scheduled'].includes(r.status) ? 'assigned' : r.status);
      if (status !== r.status && !FLOW[r.status].includes(status))
        throw unprocessable('INVALID_TRANSITION', `Cannot move a ${r.status} request to ${status}`);
      if (status === 'assigned' && !(dto.collectorId ?? r.collectorId)) throw unprocessable('COLLECTOR_REQUIRED', 'Assign a collector first');
      if (dto.scheduledFor && status === 'requested') status = 'scheduled';
      const now = this.store.now();
      const next: HomeSamplingDoc = {
        ...r,
        ...(dto.scheduledFor && { scheduledFor: dto.scheduledFor }),
        ...(dto.fee !== undefined && { fee: dto.fee }),
        ...(dto.collectorId && { collectorId: dto.collectorId, collectorName }),
        status,
        history: status !== r.status || dto.note ? [...r.history, { status, at: now, by, note: dto.note }] : r.history,
        updatedAt: now,
      };
      tx.set(C.homeSamplingRequests, id, next);
      this.audit.recordInTx(tx, { action: 'home_sampling.update', entity: 'homeSampling', entityId: id, actor: by, changes: { status: { from: r.status, to: status } }, note: dto.note });
      return next;
    });
  }
}

@ApiTags('Home sampling')
@ApiBearerAuth()
@Controller('home-sampling')
export class HomeSamplingController {
  constructor(private readonly service: HomeSamplingService) {}

  @Get()
  @RequirePermissions('homeSampling.read')
  list(@Query('status') status?: string) {
    return this.service.list(status?.slice(0, 20));
  }

  @Get(':id')
  @RequirePermissions('homeSampling.read')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Idempotent()
  @RequirePermissions('homeSampling.write')
  @ApiZodBody(CreateDto)
  create(@ZodBody(CreateDto) dto: z.infer<typeof CreateDto>, @CurrentUser() u: AuthUser) {
    return this.service.create(dto, u);
  }

  @Patch(':id')
  @RequirePermissions('homeSampling.write')
  @ApiZodBody(UpdateDto)
  update(@Param('id') id: string, @ZodBody(UpdateDto) dto: z.infer<typeof UpdateDto>, @CurrentUser() u: AuthUser) {
    return this.service.update(id, dto, u);
  }
}

@Module({ controllers: [HomeSamplingController], providers: [HomeSamplingService] })
export class HomeSamplingModule {}
