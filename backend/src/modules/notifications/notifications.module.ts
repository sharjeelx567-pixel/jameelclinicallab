import { Controller, Get, Global, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/types';
import { CurrentUser, RequirePermissions } from '../../decorators';
import { AuditService } from '../audit-logs/audit.service';
import { toActor } from '../../common/types';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('notifications.read')
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.forUser(user, unread === 'true');
  }

  @Post('read-all')
  @HttpCode(204)
  @RequirePermissions('notifications.read')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(204)
  @RequirePermissions('notifications.read')
  read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user);
  }

  @Post(':id/acknowledge')
  @HttpCode(204)
  @RequirePermissions('notifications.read', 'results.read')
  async acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.notifications.acknowledge(id, user);
    await this.audit.record({ action: 'critical_result.acknowledge', entity: 'notification', entityId: id, actor: toActor(user) });
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
