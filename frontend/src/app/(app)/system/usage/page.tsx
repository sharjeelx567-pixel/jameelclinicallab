'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { usageService } from '@/services/admin.service';

const n = (x: number) => new Intl.NumberFormat('en-PK').format(x);
const WORKFLOW_LABEL: Record<string, string> = {
  patient_registration: 'Patient registration',
  order_creation: 'Order creation',
  sample_processing: 'Sample collect / receive / accept',
  result_entry: 'Result entry',
  result_approval: 'Result approval / correction',
  report_generation: 'Report generation',
  payment: 'Payments & refunds',
  dashboard: 'Dashboard',
  notifications: 'Notification bell',
  other: 'Other screens',
};

/** Super Admin page (not in the menu): Firestore reads/writes counted by the backend. */
export default function SystemUsagePage() {
  const { can } = useAuth();
  const state = useApi(can('roles.manage') ? () => usageService.report(7) : null, []);
  if (!can('roles.manage')) return <ErrorState error={new Error('Super Admin only.')} />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const r = state.data;
  const t = r.today;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Database usage"
        description={`Firestore reads and writes counted by the server. Quota day ${r.quotaDay} — ${r.timeZone}.`}
        actions={<Button variant="outline" onClick={() => void state.reload()}><RefreshCw /> Refresh</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Reads today</p><p className="text-2xl font-semibold">{n(t.reads)}</p><p className="text-xs text-muted-foreground">{t.percentOfFreeReads}% of free {n(r.freeDailyLimits.reads)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Writes today</p><p className="text-2xl font-semibold">{n(t.writes)}</p><p className="text-xs text-muted-foreground">{t.percentOfFreeWrites}% of free {n(r.freeDailyLimits.writes)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">API requests today</p><p className="text-2xl font-semibold">{n(t.requests)}</p><p className="text-xs text-muted-foreground">{t.serverProcesses} server process(es)</p></CardContent></Card>
      </div>

      {r.anomalies.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Attention</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {r.anomalies.map((a, i) => <p key={i} className={cn(a.level === 'critical' && 'font-semibold text-destructive')}>{a.message}</p>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Last 7 days</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1.5">Day</th><th className="text-right">Requests</th><th className="text-right">Reads</th><th className="text-right">% of free reads</th><th className="text-right">Writes</th></tr></thead>
            <tbody className="divide-y">
              {r.days.map((d) => (
                <tr key={d.date}><td className="py-1.5">{d.date}</td><td className="text-right tabular">{n(d.requests)}</td><td className="text-right tabular">{n(d.reads)}</td><td className={cn('text-right tabular', d.percentOfFreeReads >= 70 && 'font-semibold text-destructive')}>{d.percentOfFreeReads}%</td><td className="text-right tabular">{n(d.writes)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Today by workflow</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1.5">Workflow</th><th className="text-right">Requests</th><th className="text-right">Reads</th><th className="text-right">Reads / request</th><th className="text-right">Writes</th></tr></thead>
              <tbody className="divide-y">
                {t.workflows.map((w) => <tr key={w.name}><td className="py-1.5">{WORKFLOW_LABEL[w.name] ?? w.name}</td><td className="text-right tabular">{n(w.requests)}</td><td className="text-right tabular">{n(w.reads)}</td><td className="text-right tabular">{w.readsPerRequest}</td><td className="text-right tabular">{n(w.writes)}</td></tr>)}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Server caches today</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1.5">Cache</th><th className="text-right">Hits</th><th className="text-right">Misses</th><th className="text-right">Hit rate</th></tr></thead>
              <tbody className="divide-y">
                {t.caches.map((c) => <tr key={c.name}><td className="py-1.5">{c.name}</td><td className="text-right tabular">{n(c.hits)}</td><td className="text-right tabular">{n(c.misses)}</td><td className="text-right tabular">{c.hitRate === null ? '—' : `${c.hitRate}%`}</td></tr>)}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Today by API route (most reads first)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1.5">Route</th><th className="text-right">Requests</th><th className="text-right">Reads</th><th className="text-right">Max reads in one request</th><th className="text-right">Writes</th></tr></thead>
            <tbody className="divide-y">
              {t.routes.map((x) => <tr key={x.route}><td className="py-1.5 font-mono text-xs">{x.route}</td><td className="text-right tabular">{n(x.requests)}</td><td className="text-right tabular">{n(x.reads)}</td><td className="text-right tabular">{n(x.maxReads)}</td><td className="text-right tabular">{n(x.writes)}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="space-y-1 text-xs text-muted-foreground">{r.notes.map((x) => <p key={x}>{x}</p>)}</div>
    </div>
  );
}
