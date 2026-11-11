'use client';

import { Cpu, Inbox, Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { AnalyzerDialog } from '@/components/laboratory/analyzer-form';
import { ConnectionIndicator } from '@/components/laboratory/connection-indicator';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { DemoBadge, StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CONNECTION_STATE, INTEGRATION_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { timeAgo, titleCase } from '@/lib/utils';
import { analyzersService } from '@/services/admin.service';

export default function AnalyzersPage() {
  const { can } = useAuth();
  const state = useApi(() => analyzersService.list(), [], { refreshMs: 60_000 });
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <PageHeader
        title="Analyzers"
        description="BIOELAB analyzer registry. Connection status is reported only by the on-site machine bridge — never assumed."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/analyzers/messages"><Inbox /> Message queue</Link></Button>
            {can('analyzers.write') && <Button onClick={() => setOpen(true)}><Plus /> Register analyzer</Button>}
          </>
        }
      />
      <AsyncBoundary state={state} empty={(d) => (!d.length ? <EmptyState icon={Cpu} title="No analyzers registered" /> : null)}>
        {(items) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => (
              <Link key={a.id} href={`/analyzers/${a.id}`}>
                <Card className="glass-hover relative h-full overflow-hidden p-5">
                  {/* technical grid backdrop */}
                  <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(var(--primary)/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.08)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-brand-3/10 text-primary ring-1 ring-primary/25">
                        <Cpu className="size-6" />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{a.name}</p>
                        <p className="break-words text-sm text-muted-foreground">{a.brand} {a.model ?? '(model not confirmed)'} · {a.machineType}</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/40 px-3 py-2">
                    <ConnectionIndicator analyzer={a} />
                    {a.mode === 'demo' ? <DemoBadge label="Not connected" /> : <StatusBadge map={CONNECTION_STATE} value={a.connectionState} />}
                    {!a.enabled && <StatusBadge map={{ x: { label: 'Disabled', tone: 'neutral' } }} value="x" />}
                  </div>
                  <dl className="relative mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-muted-foreground">Protocol</dt><dd className="font-medium">{a.protocol === 'unconfirmed' ? 'Unconfirmed' : a.protocol.toUpperCase()}</dd></div>
                    <div><dt className="text-muted-foreground">Interface</dt><dd className="font-medium">{titleCase(a.connectionType)}</dd></div>
                    <div><dt className="text-muted-foreground">Integration</dt><dd className="font-medium">{INTEGRATION_STATUS[a.integrationStatus]?.label}</dd></div>
                    <div><dt className="text-muted-foreground">Last message</dt><dd className="font-medium">{a.lastMessageAt ? timeAgo(a.lastMessageAt) : 'Never'}</dd></div>
                  </dl>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </AsyncBoundary>
      <AnalyzerDialog open={open} onOpenChange={setOpen} onSaved={state.reload} />
    </div>
  );
}
