import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodQuery, RequirePermissions, ZodQuery } from '../../decorators';
import { paginationQuery } from '../../utils';
import { AuditService } from './audit.service';

const AuditQuery = paginationQuery.extend({
  entity: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  actorUid: z.string().max(128).optional(),
  action: z.string().max(60).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
});

@ApiTags('Audit logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiZodQuery(AuditQuery)
  list(@ZodQuery(AuditQuery) q: z.infer<typeof AuditQuery>) {
    const { limit, cursor, ...filters } = q;
    return this.audit.list(filters, limit, cursor);
  }
}
