import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { LoginActivityDoc, UserDoc } from '../../common/entities';
import { PERMISSIONS, ROLE_LABELS } from '../../common/permissions';
import { AuthUser, RequestMeta, toActor } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore } from '../../database/data-store';
import { ApiZodBody, CurrentUser, Public, ReqMeta, ZodBody } from '../../decorators';
import { AuditService } from '../audit-logs/audit.service';

const SessionEvent = z.object({ event: z.enum(['login', 'logout']) });

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly store: DataStore,
    private readonly audit: AuditService,
  ) {}

  /** Lets the frontend show which auth/data modes are active (dev banners). No secrets. */
  @Public()
  @Get('config')
  config() {
    const env = getEnv();
    return { authMode: env.AUTH_MODE, dataBackend: env.DATA_BACKEND, environment: env.NODE_ENV };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const doc = await this.store.get<UserDoc>(C.users, user.uid);
    return { ...user, photo: doc?.photo ?? null, roleLabel: ROLE_LABELS[user.role], permissionLabels: PERMISSIONS };
  }

  /**
   * Records login/logout. Sign-in itself happens against Firebase Authentication
   * in the browser; password reset & change use Firebase's secure flows.
   */
  @Post('session-events')
  @HttpCode(204)
  @ApiZodBody(SessionEvent)
  async sessionEvent(
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
    @ZodBody(SessionEvent) body: z.infer<typeof SessionEvent>,
  ) {
    const doc: LoginActivityDoc = {
      id: this.store.newId(),
      uid: user.uid,
      event: body.event,
      at: this.store.now(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    await this.store.create(C.loginActivity, doc.id, doc);
    await this.audit.record({ action: `auth.${body.event}`, entity: 'user', entityId: user.uid, actor: toActor(user), ip: meta.ip });
  }

  @Get('login-activity')
  async loginActivity(@CurrentUser() user: AuthUser) {
    const res = await this.store.query<LoginActivityDoc>(C.loginActivity, {
      where: [{ field: 'uid', op: '==', value: user.uid }],
      orderBy: { field: 'at', direction: 'desc' },
      limit: 50,
    });
    return res.items;
  }
}
