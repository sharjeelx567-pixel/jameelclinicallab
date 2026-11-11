'use client';

import { CheckCircle2, Circle, Info, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { AnalyzerDialog } from '@/components/laboratory/analyzer-form';
import { ConnectionIndicator } from '@/components/laboratory/connection-indicator';
import { DetailList, ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { INTEGRATION_STATUS, MESSAGE_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { cn, formatDateTime, timeAgo, titleCase } from '@/lib/utils';
import { analyzersService } from '@/services/admin.service';

export default function AnalyzerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => analyzersService.get(id), [id], { refreshMs: 60_000 });
  const [editing, setEditing] = React.useState(false);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const { analyzer: a, recentMessages, activity, mappedTests } = state.data;

  const checklist = [
    { label: 'Exact analyzer model confirmed', done: !!a.model },
    { label: 'Serial number recorded', done: !!a.serialNumber },
    { label: 'Communication port / interface identified', done: a.connectionType !== 'none' },
    { label: 'Supported protocol confirmed from vendor documentation', done: a.protocol !== 'unconfirmed' },
    { label: 'Interface settings configured (IP/port or serial parameters)', done: (a.connectionType === 'tcp' && !!a.port) || (a.connectionType === 'serial' && !!a.serialPort && !!a.baudRate) },
    { label: 'Assigned to a machine-bridge PC', done: !!a.bridgeId },
    { label: 'Test-code mapping configured', done: mappedTests.length > 0 },
    { label: 'Live link reported by the bridge', done: a.mode === 'live' && a.connectionState === 'connected' },
    { label: 'Verified end-to-end with real analyzer messages', done: a.integrationStatus === 'verified' },
  ];

  return (
    <div>
      <PageHeader
        title={a.name}
        badge={<span className="glass inline-flex items-center rounded-full px-3 py-1"><ConnectionIndicator analyzer={a} /></span>}
        description={`${a.brand} ${a.model ?? '— model not confirmed'} · ${a.machineType}`}
        actions={can('analyzers.write') && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Configure</Button>}
      />

      {a.mode === 'demo' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-dashed border-warning/60 bg-warning-soft p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>This analyzer is in <strong>DEMO mode</strong>. Simulated messages {a.demoActive ? 'are currently being received' : 'may be sent by the bridge simulator'} and are stored for testing only. They are never applied to patient results, and the analyzer is never reported as connected.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
          <CardContent>
            <DetailList
              className="sm:grid-cols-1"
              items={[
                ['Serial number', a.serialNumber],
                ['Protocol', a.protocol === 'unconfirmed' ? 'Unconfirmed' : a.protocol.toUpperCase()],
                ['Connection', titleCase(a.connectionType)],
                ['Address', a.connectionType === 'tcp' ? `${a.host ?? '—'}:${a.port ?? '—'}` : a.connectionType === 'serial' ? `${a.serialPort ?? '—'} @ ${a.baudRate ?? '—'}` : undefined],
                ['Bridge', a.bridgeId],
                ['Enabled', a.enabled ? 'Yes' : 'No'],
                ['Integration', INTEGRATION_STATUS[a.integrationStatus]?.label],
                ['Last heartbeat (live)', a.lastHeartbeatAt ? `${formatDateTime(a.lastHeartbeatAt)} (${timeAgo(a.lastHeartbeatAt)})` : 'Never'],
                ['Last message', a.lastMessageAt ? formatDateTime(a.lastMessageAt) : 'Never'],
                ['Last error', a.lastError ? `${a.lastError.message} (${formatDateTime(a.lastError.at)})` : undefined],
                ['Notes', a.notes],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Integration checklist</CardTitle><CardDescription>Required before results from this machine can be relied on.</CardDescription></div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className={cn('flex items-start gap-2', !c.done && 'text-muted-foreground')}>
                  {c.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0" />}
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">See docs/ANALYZER_INTEGRATION.md for the full procedure.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Test mapping</CardTitle></CardHeader>
          <CardContent>
            {!mappedTests.length ? <p className="text-sm text-muted-foreground">No tests mapped. Configure analyzer codes in the test catalogue.</p> : (
              <ul className="divide-y text-sm">
                {mappedTests.map((t) => (
                  <li key={t.testId} className="py-2">
                    <Link href={`/tests/${t.testId}`} className="font-medium hover:text-primary">{t.testName}</Link>
                    <p className="text-xs text-muted-foreground">Code {t.mapping?.analyzerTestCode}{t.mapping && Object.keys(t.mapping.parameterCodes).length > 0 && ` · ${Object.keys(t.mapping.parameterCodes).join(', ')}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent messages</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href={`/analyzers/messages?analyzerId=${a.id}`}>All messages</Link></Button>
          </CardHeader>
          <CardContent>
            {!recentMessages.length ? <p className="text-sm text-muted-foreground">No messages received.</p> : (
              <ul className="divide-y text-sm">
                {recentMessages.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">{m.sampleIdentifier ?? 'No sample ID'} · {m.results.length} result(s) <span className="text-xs text-muted-foreground">{formatDateTime(m.receivedAt)}</span></span>
                    <StatusBadge map={MESSAGE_STATUS} value={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Configuration history</CardTitle></CardHeader>
          <CardContent>
            {!activity.length ? <p className="text-sm text-muted-foreground">No changes recorded.</p> : (
              <ul className="space-y-2 text-sm">
                {activity.map((l) => <li key={l.id}><p>{titleCase(l.action.replace('analyzer.', ''))}</p><p className="text-xs text-muted-foreground">{l.actor.name} · {formatDateTime(l.at)}{l.changes && ` · ${Object.keys(l.changes).join(', ')}`}</p></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AnalyzerDialog analyzer={a} open={editing} onOpenChange={setEditing} onSaved={state.reload} />
    </div>
  );
}
