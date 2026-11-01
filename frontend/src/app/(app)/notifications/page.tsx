'use client';

import { AlertTriangle, Bell, CheckCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { notificationsService } from '@/services/admin.service';

export default function NotificationsPage() {
  const { can } = useAuth();
  const [unread, setUnread] = React.useState(false);
  const state = useApi(() => notificationsService.list(unread), [unread]);
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Role-aware alerts. Messages reference order and sample numbers only — no patient names."
        actions={<Button variant="outline" onClick={async () => { await notificationsService.readAll().catch(() => undefined); void state.reload(); }}><CheckCheck /> Mark all read</Button>}
      />
      <Tabs value={unread ? 'unread' : 'all'} onValueChange={(v) => setUnread(v === 'unread')}>
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="unread">Unread {state.data ? `(${state.data.unread})` : ''}</TabsTrigger></TabsList>
      </Tabs>
      <div className="mt-4">
        <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={Bell} title="No notifications" /> : null)}>
          {(d) => (
            <ul className="space-y-2">
              {d.items.map((n) => (
                <li key={n.id} className={cn('flex flex-col gap-3 glass rounded-2xl p-4  sm:flex-row sm:items-start sm:justify-between', !n.read && 'border-l-4', !n.read && (n.severity === 'critical' ? 'border-l-destructive' : n.severity === 'warning' ? 'border-l-warning' : 'border-l-primary'))}>
                  <div className="flex min-w-0 gap-3">
                    {n.severity === 'critical' ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" /> : <Bell className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <p className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</p>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)} · {timeAgo(n.createdAt)}</p>
                      {n.kind === 'critical_result' && (n.acknowledgedBy ? <Badge tone="success" className="mt-2"><ShieldCheck className="size-3" /> Acknowledged by {n.acknowledgedBy.name} · {formatDateTime(n.acknowledgedAt)}</Badge> : <Badge tone="danger" className="mt-2">Awaiting acknowledgement</Badge>)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {n.link && <Button asChild size="sm" variant="outline"><Link href={n.link} onClick={() => void notificationsService.read(n.id)}>Open</Link></Button>}
                    {n.kind === 'critical_result' && !n.acknowledgedBy && can('results.read') && (
                      <Button size="sm" variant="destructive" onClick={async () => { try { await notificationsService.acknowledge(n.id); toast.success('Critical result acknowledged — recorded in audit trail'); void state.reload(); } catch (err) { toast.error(errorMessage(err)); } }}>Acknowledge (clinician informed)</Button>
                    )}
                    {!n.read && <Button size="sm" variant="ghost" onClick={async () => { await notificationsService.read(n.id).catch(() => undefined); void state.reload(); }}>Mark read</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}
