import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogDoc } from '../../common/entities';
import { AuditActor } from '../../common/types';
import { C, DataStore, QueryOptions, TransactionContext, WhereClause } from '../../database/data-store';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  actor: AuditLogDoc['actor'];
  ip?: string;
  changes?: Record<string, unknown>;
  note?: string;
}

/**
 * Append-only audit trail. There is intentionally no update or delete path in
 * the application; Firestore rules also deny client writes to `auditLogs`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly store: DataStore) {}

  private build(entry: AuditEntry): AuditLogDoc {
    return { id: this.store.newId(), ...entry, at: this.store.now() };
  }

  /** Write inside an existing transaction so the audit record commits atomically with the change. */
  recordInTx(tx: TransactionContext, entry: AuditEntry): void {
    const doc = this.build(entry);
    tx.create(C.auditLogs, doc.id, doc);
  }

  async record(entry: AuditEntry): Promise<void> {
    const doc = this.build(entry);
    try {
      await this.store.create(C.auditLogs, doc.id, doc);
    } catch (err) {
      // An audit failure must be visible to operators, never swallowed silently.
      this.logger.error(`Failed to write audit log for ${entry.action}: ${(err as Error).message}`);
      throw err;
    }
  }

  async list(filters: { entity?: string; entityId?: string; actorUid?: string; action?: string; from?: string; to?: string }, limit: number, cursor?: string) {
    const where: WhereClause[] = [];
    if (filters.entity) where.push({ field: 'entity', op: '==', value: filters.entity });
    if (filters.entityId) where.push({ field: 'entityId', op: '==', value: filters.entityId });
    if (filters.actorUid) where.push({ field: 'actor.uid', op: '==', value: filters.actorUid });
    if (filters.action) where.push({ field: 'action', op: '==', value: filters.action });
    if (filters.from) where.push({ field: 'at', op: '>=', value: filters.from });
    if (filters.to) where.push({ field: 'at', op: '<=', value: filters.to });
    const options: QueryOptions = { where, orderBy: { field: 'at', direction: 'desc' }, limit, cursor };
    return this.store.query<AuditLogDoc>(C.auditLogs, options);
  }
}

export const systemActor = { uid: 'system', name: 'System', role: 'system' as const };
export type { AuditActor };
