'use client';

import { ClipboardList, Save, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatCard } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Switch } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { catalogService } from '@/services/lab.service';
import { panelsService } from '@/services/patients.service';

export default function PanelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => panelsService.statement(id), [id]);
  const tests = useApi(() => catalogService.list({ active: 'true' }), []);
  const [rates, setRates] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.data) setRates(Object.fromEntries(Object.entries(state.data.panel.rates).map(([k, v]) => [k, String(v)])));
  }, [state.data]);

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const { panel, totals, outstandingOrders, payments } = state.data;
  const editable = can('panels.write');

  const saveRates = async () => {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(rates)) {
      if (v.trim() === '') continue;
      const n = Number(v);
      if (!(n >= 0)) return toast.error('Rates must be zero or more');
      parsed[k] = n;
    }
    setSaving(true);
    try {
      await panelsService.update(panel.id, { rates: parsed });
      toast.success('Panel rates saved');
      void state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={panel.name}
        description={`${panel.type === 'insurance' ? 'Insurance' : 'Corporate'} panel · default discount ${panel.discountPercent}%`}
        actions={editable && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={panel.active} onCheckedChange={async (v) => { try { await panelsService.update(panel.id, { active: v }); void state.reload(); } catch (err) { toast.error(errorMessage(err)); } }} /> Active
          </label>
        )}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Orders billed" value={totals.orders} icon={ClipboardList} />
        <StatCard label="Total billed" value={formatMoney(totals.billed)} icon={Wallet} tone="info" />
        <StatCard label="Outstanding" value={formatMoney(totals.outstanding)} icon={Wallet} tone={totals.outstanding ? 'danger' : 'success'} hint={panel.creditLimit !== undefined ? `Credit limit ${formatMoney(panel.creditLimit)}` : undefined} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Panel rates</CardTitle><CardDescription>Leave blank to use catalogue price less the default discount.</CardDescription></div>
            {editable && <Button size="sm" loading={saving} onClick={() => void saveRates()}><Save /> Save rates</Button>}
          </CardHeader>
          <CardContent>
            <ul className="scrollbar-thin max-h-[480px] divide-y overflow-y-auto">
              {tests.data?.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block break-words">{t.name}</span><span className="text-xs text-muted-foreground">{t.code} · list {formatMoney(t.price)}</span></span>
                  <Input type="number" min={0} className="w-28 shrink-0" value={rates[t.id] ?? ''} placeholder="—" onChange={(e) => setRates((r) => ({ ...r, [t.id]: e.target.value }))} disabled={!editable} aria-label={`Panel rate for ${t.name}`} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Outstanding panel invoices</CardTitle></CardHeader>
            <CardContent>
              {!outstandingOrders.length ? <p className="text-sm text-muted-foreground">Nothing outstanding.</p> : (
                <ul className="divide-y text-sm">
                  {outstandingOrders.map((o) => (
                    <li key={o.id}><Link href={`/billing/invoice/${o.id}`} className="flex justify-between gap-2 py-2 hover:text-primary"><span className="truncate">{o.orderNumber} · {o.patientName}</span><span className="tabular font-medium text-destructive">{formatMoney(o.balance)}</span></Link></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Panel payment history</CardTitle></CardHeader>
            <CardContent>
              {!payments.length ? <p className="text-sm text-muted-foreground">No panel payments recorded.</p> : (
                <ul className="divide-y text-sm">
                  {payments.map((p) => <li key={p.id} className="flex justify-between gap-2 py-2"><span>{p.receiptNumber} · {p.orderNumber} <span className="text-xs text-muted-foreground">{formatDateTime(p.recordedAt)}</span></span><span className="tabular">{formatMoney(p.amount)}</span></li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
