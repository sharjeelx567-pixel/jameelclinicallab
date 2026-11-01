'use client';

import { ScrollText } from 'lucide-react';
import * as React from 'react';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-controls';
import { useApi } from '@/hooks/use-api';
import { formatDateTime, titleCase } from '@/lib/utils';
import { auditService } from '@/services/admin.service';
import type { AuditLog } from '@/types';

const ENTITIES = ['patient', 'order', 'sample', 'result', 'report', 'user', 'role', 'test', 'analyzer', 'analyzerMessage', 'inventoryItem', 'panel', 'settings', 'doctor', 'homeSampling', 'notification'];

export default function AuditLogsPage() {
  const [entity, setEntity] = React.useState('');
  const [action, setAction] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [extra, setExtra] = React.useState<AuditLog[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const q = { entity: entity || undefined, action: action.trim() || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined };
  const state = useApi(() => auditService.list(q), [entity, action, from]);
  React.useEffect(() => {
    setExtra([]);
    setCursor(state.data?.nextCursor ?? null);
  }, [state.data]);

  return (
    <div>
      <PageHeader title="Audit logs" description="Append-only record of security-relevant and clinical actions. Entries cannot be edited or deleted from the application." />
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All entities</option>{ENTITIES.map((e) => <option key={e} value={e}>{titleCase(e.replace(/([A-Z])/g, ' $1'))}</option>)}</Select>
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Exact action, e.g. result.approve" aria-label="Action" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        </CardContent>
      </Card>
      <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={ScrollText} title="No audit entries match" /> : null)}>
        {(d) => (
          <>
            <div className="scrollbar-thin overflow-x-auto glass rounded-2xl ">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Details</th></tr></thead>
                <tbody className="divide-y">
                  {[...d.items, ...extra].map((l) => (
                    <React.Fragment key={l.id}>
                      <tr className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDateTime(l.at)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
                        <td className="px-4 py-3 text-xs">{l.entity}<span className="block font-mono text-[10px] text-muted-foreground">{l.entityId}</span></td>
                        <td className="px-4 py-3 text-xs">{l.actor.name}<span className="block text-muted-foreground">{titleCase(l.actor.role)}</span></td>
                        <td className="px-4 py-3 text-xs">
                          {l.note && <p>{l.note}</p>}
                          {l.changes && <button className="text-primary hover:underline" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>{expanded === l.id ? 'Hide' : 'Show'} changes ({Object.keys(l.changes).length})</button>}
                        </td>
                      </tr>
                      {expanded === l.id && l.changes && (
                        <tr><td colSpan={5} className="bg-muted/40 px-4 py-3"><pre className="whitespace-pre-wrap break-all font-mono text-[11px]">{JSON.stringify(l.changes, null, 2)}</pre></td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={async () => { const next = await auditService.list({ ...q, cursor }); setExtra((e) => [...e, ...next.items]); setCursor(next.nextCursor); }}>Load older entries</Button>
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
