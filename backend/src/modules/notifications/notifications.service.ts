import { Injectable } from '@nestjs/common';
import type { NotificationDoc, NotificationKind } from '../../common/entities';
import { forbidden, notFound } from '../../common/errors';
import type { Permission } from '../../common/permissions';
import { AuthUser, toActor } from '../../common/types';
import { C, DataStore, TransactionContext } from '../../database/data-store';
import { usage } from '../../common/usage-monitor';

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

  /**
   * Every open page polls the bell, so the latest notifications are kept for a short
   * time and shared by all users of this server instance (database read quota).
   */
  private recent?: { at: number; items: NotificationDoc[] };
  private static readonly CACHE_MS = 50_000;
  private static readonly LIMIT = 60;

  notifyInTx(tx: TransactionContext, input: NotifyInput): void {
    const doc = this.build(input);
    tx.create(C.notifications, doc.id, doc);
    this.recent = undefined;
  }

  async notify(input: NotifyInput): Promise<void> {
    const doc = this.build(input);
    await this.store.create(C.notifications, doc.id, doc);
    this.recent = undefined;
  }

  private async latest(): Promise<NotificationDoc[]> {
    const hit = !!this.recent && Date.now() - this.recent.at < NotificationsService.CACHE_MS;
    usage.cache('notifications', hit);
    if (hit) return this.recent!.items;
    const res = await this.store.query<NotificationDoc>(C.notifications, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: NotificationsService.LIMIT });
    this.recent = { at: Date.now(), items: res.items };
    return res.items;
  }

  /**
   * Polling: only notifications created after `after` (the newest one the browser already
   * has). Costs 1 read when nothing is new, plus 1 per new notification. Read/acknowledged
   * state of older items is refreshed by a full request (when the bell is opened).
   */
  async newSince(user: AuthUser, after: string) {
    const res = await this.store.query<NotificationDoc>(C.notifications, {
      where: [{ field: 'createdAt', op: '>', value: after }],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: NotificationsService.LIMIT,
    });
    const items = res.items.filter((n) => user.permissions.includes(n.audiencePermission));
    return { items: items.map(({ readBy, ...n }) => ({ ...n, read: readBy.includes(user.uid) })), incremental: true as const, cursor: res.items[0]?.createdAt ?? after };
  }

  /** Role-aware: a user only sees notifications for permissions their role holds. */
  async forUser(user: AuthUser, unreadOnly = false) {
    const latest = await this.latest();
    const visible = latest.filter((n) => user.permissions.includes(n.audiencePermission));
    const items = (unreadOnly ? visible.filter((n) => !n.readBy.includes(user.uid)) : visible).slice(0, 100);
    return {
      items: items.map(({ readBy, ...n }) => ({ ...n, read: readBy.includes(user.uid) })),
      unread: visible.filter((n) => !n.readBy.includes(user.uid)).length,
      // Newest notification the server looked at (visible to this user or not): the next poll starts here.
      cursor: latest[0]?.createdAt ?? null,
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
    this.recent = undefined;
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
    this.recent = undefined;
  }
}
