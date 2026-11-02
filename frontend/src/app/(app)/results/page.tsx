'use client';

import { AlertTriangle, Cpu, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PRIORITY } from '@/constants';
import { useApi } from '@/hooks/use-api';
import { timeAgo } from '@/lib/utils';
import { resultsService } from '@/services/lab.service';

const TABS = [
  { value: 'pending', label: 'Not started' },
  { value: 'draft', label: 'Drafts' },
  { value: 'correction_requested', label: 'Corrections' },
  { value: 'rejected', label: 'Re-test' },
  { value: 'submitted', label: 'Submitted' },
];

export default function ResultsWorklistPage() {
  const [tab, setTab] = React.useState('pending');
  const state = useApi(() => resultsService.list({ status: tab, limit: 100 }), [tab]);
  return (
    <div>
      <PageHeader title="Result entry" description="One row per patient. Open it to enter all results on one page, then approve and print the report." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <div className="mt-4">
        <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={FlaskConical} title="Nothing in this queue" /> : null)}>
          {(d) => {
            // One row per patient order: opens the one-page results & report screen.
            const groups = new Map<string, typeof d.items>();
            for (const r of d.items) groups.set(r.orderId, [...(groups.get(r.orderId) ?? []), r]);
            const rows = [...groups.values()].sort((a, b) => Number(b.some((r) => r.priority === 'stat')) - Number(a.some((r) => r.priority === 'stat')));
            return (
              <ul className="space-y-2">
                {rows.map((items) => {
                  const r = items[0];
                  return (
                    <li key={r.orderId} className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{r.patientName} <span className="text-xs font-normal text-muted-foreground">{r.patientMrNumber} · {r.orderNumber}</span></p>
                        <p className="text-xs text-muted-foreground">{items.map((x) => x.testName).join(' · ')}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {items.some((x) => x.priority && x.priority !== 'routine') && <StatusBadge map={PRIORITY} value={items.find((x) => x.priority !== 'routine')!.priority!} />}
                          {items.some((x) => x.hasCritical) && <Badge tone="danger"><AlertTriangle className="size-3" /> Critical</Badge>}
                          {items.some((x) => x.hasAnalyzerValues) && <Badge tone="info"><Cpu className="size-3" /> Analyzer values</Badge>}
                          {items.some((x) => x.rejection) && <Badge tone="warning">Returned for correction</Badge>}
                          <span className="text-xs text-muted-foreground">updated {timeAgo(r.updatedAt)}</span>
                        </div>
                      </div>
                      <Button asChild><Link href={`/orders/${r.orderId}/results`}><FlaskConical /> {tab === 'submitted' ? 'Approve & print' : 'Enter results'} ({items.length})</Link></Button>
                    </li>
                  );
                })}
              </ul>
            );
          }}
        </AsyncBoundary>
      </div>
    </div>
  );
}
