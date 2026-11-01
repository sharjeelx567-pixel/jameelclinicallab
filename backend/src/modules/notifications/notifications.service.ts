import { Injectable } from '@nestjs/common';
import type { NotificationDoc, NotificationKind } from '../../common/entities';
import { forbidden, notFound } from '../../common/errors';
import type { Permission } from '../../common/permissions';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, TransactionContext } from '../../database/data-store';

export interface NotifyInput {
  kind: NotificationKind;
  severity: NotificationDoc['severity'];
  /** Must not contain patient names or results — use order/sample numbers only. */
  title: string;
  body: string;
  link?: string;
  audiencePermission: Permission;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly store: DataStore) {}

  private build(input: NotifyInput): NotificationDoc {
    return { ...input, id: this.store.newId(), createdAt: this.store.now(), readBy: [] };
  }

  notifyInTx(tx: TransactionContext, input: NotifyInput): void {
    const doc = this.build(input);
    tx.create(C.notifications, doc.id, doc);
  }

  async notify(input: NotifyInput): Promise<void> {
    const doc = this.build(input);
    await this.store.create(C.notifications, doc.id, doc);
  }

  /** Role-aware: a user only sees notifications for permissions their role holds. */
  async forUser(user: AuthUser, unreadOnly = false) {
    const res = await this.store.query<NotificationDoc>(C.notifications, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 200 });
    const visible = res.items.filter((n) => user.permissions.includes(n.audiencePermission));
    const items = (unreadOnly ? visible.filter((n) => !n.readBy.includes(user.uid)) : visible).slice(0, 100);
    return {
      items: items.map(({ readBy, ...n }) => ({ ...n, read: readBy.includes(user.uid) })),
      unread: visible.filter((n) => !n.readBy.includes(user.uid)).length,
    };
  }

  private async visibleOrThrow(id: string, user: AuthUser): Promise<NotificationDoc> {
    const n = await this.store.get<NotificationDoc>(C.notifications, id);
    if (!n) throw notFound('Notification');
    if (!user.permissions.includes(n.audiencePermission)) throw forbidden();
    return n;
  }

  async markRead(id: string, user: AuthUser): Promise<void> {
    await this.visibleOrThrow(id, user);
    await this.store.transaction(async (tx) => {
      const n = await tx.get<NotificationDoc>(C.notifications, id);
      if (n && !n.readBy.includes(user.uid)) tx.update(C.notifications, id, { readBy: [...n.readBy, user.uid] });
    });
  }

  async markAllRead(user: AuthUser): Promise<void> {
    const { items } = await this.forUser(user, true);
    for (const n of items) await this.markRead(n.id, user);
  }

  /** Critical-result escalation: an authorised person records that it was communicated. */
  async acknowledge(id: string, user: AuthUser): Promise<void> {
    const n = await this.visibleOrThrow(id, user);
    if (n.kind !== 'critical_result') return;
    await this.store.update(C.notifications, id, { acknowledgedBy: toActor(user), acknowledgedAt: this.store.now() });
  }
}
