'use client';

import { AlertTriangle, Cpu, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PRIORITY, RESULT_STATUS } from '@/constants';
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
      <PageHeader title="Result entry" description="Enter results for accepted samples. Results are flagged by the server against approved reference ranges and must be verified by an authorised approver." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <div className="mt-4">
        <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={FlaskConical} title="Nothing in this queue" /> : null)}>
          {(d) => (
            <ul className="space-y-2">
              {d.items
                .sort((a, b) => (b.priority === 'stat' ? 1 : 0) - (a.priority === 'stat' ? 1 : 0))
                .map((r) => (
                  <li key={r.id} className="flex flex-col gap-3 glass rounded-2xl p-4  sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{r.testName} <span className="text-xs text-muted-foreground">{r.testCode}</span></p>
                      <p className="text-xs text-muted-foreground">{r.patientName} · {r.patientMrNumber} · {r.orderNumber} · updated {timeAgo(r.updatedAt)}</p>
                      {r.rejection && <p className="mt-1 text-xs text-warning">Returned: {r.rejection.reason}</p>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.priority && r.priority !== 'routine' && <StatusBadge map={PRIORITY} value={r.priority} />}
                        {r.hasCritical && <Badge tone="danger"><AlertTriangle className="size-3" /> Critical</Badge>}
                        {r.hasAnalyzerValues && <Badge tone="info"><Cpu className="size-3" /> Analyzer values</Badge>}
                        {r.version > 1 && <Badge tone="warning">Amendment v{r.version}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge map={RESULT_STATUS} value={r.status} />
                      <Button asChild size="sm"><Link href={`/results/${r.id}`}>{r.status === 'submitted' ? 'View' : 'Enter results'}</Link></Button>
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
