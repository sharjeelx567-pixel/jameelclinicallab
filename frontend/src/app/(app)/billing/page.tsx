'use client';

import { Banknote, Download, Printer, RotateCcw, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PaymentDialog } from '@/components/shared/payment-dialog';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { StatCard, StatusBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { ORDER_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, titleCase, todayKey } from '@/lib/utils';
import { billingService } from '@/services/admin.service';
import type { Payment } from '@/types';

function PaymentsTable({ items }: { items: Payment[] }) {
  if (!items.length) return <EmptyState icon={Banknote} title="No transactions" />;
  return (
    <div className="scrollbar-thin overflow-x-auto glass rounded-2xl ">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference / reason</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Recorded</th></tr>
        </thead>
        <tbody className="divide-y">
          {items.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs">{p.receiptNumber}</td>
              <td className="px-4 py-3"><Link href={`/orders/${p.orderId}`} className="hover:text-primary">{p.orderNumber}</Link></td>
              <td className="px-4 py-3">{titleCase(p.method)} {p.type === 'refund' && <Badge tone="danger" className="ml-1">Refund</Badge>}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{p.reason ?? p.reference ?? '—'}</td>
              <td className={`tabular px-4 py-3 text-right font-medium ${p.type === 'refund' ? 'text-destructive' : ''}`}>{p.type === 'refund' ? '−' : ''}{formatMoney(p.amount)}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(p.recordedAt)} · {p.recordedBy.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillingTabs() {
  const params = useSearchParams();
  const { can } = useAuth();
  const [tab, setTab] = React.useState(params.get('tab') ?? 'daily');
  const [date, setDate] = React.useState(todayKey());
  const [method, setMethod] = React.useState('');
  const daily = useApi(() => billingService.daily(date), [date]);
  const payments = useApi(tab === 'payments' ? () => billingService.payments({ method: method || undefined, limit: 100 }) : null, [tab, method]);
  const outstanding = useApi(tab === 'outstanding' ? () => billingService.outstanding() : null, [tab]);
  const [paying, setPaying] = React.useState<{ id: string; orderNumber: string; balance: number } | null>(null);

  return (
    <div>
      <PageHeader title="Billing & payments" description="Payments are recorded only when money is actually received; balances are maintained by the server." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="daily">Daily cash summary</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <div className="no-print mb-4 flex flex-wrap items-center gap-2">
            <Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label="Business date" />
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print summary</Button>
            {daily.data && <Button variant="ghost" onClick={() => downloadCsv(`cash-summary-${date}.csv`, daily.data!.transactions.map((t) => ({ receipt: t.receiptNumber, order: t.orderNumber, type: t.type, method: t.method, amount: t.amount, by: t.recordedBy.name, at: t.recordedAt })))}><Download /> CSV</Button>}
          </div>
          <AsyncBoundary state={daily}>
            {(d) => (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Collected" value={formatMoney(d.totals.collected)} icon={Banknote} tone="success" />
                  <StatCard label="Refunded" value={formatMoney(d.totals.refunded)} icon={RotateCcw} tone="danger" />
                  <StatCard label="Net" value={formatMoney(d.totals.net)} icon={Wallet} hint={`${d.totals.transactions} transactions`} />
                  <StatCard label="Cash in hand" value={formatMoney(d.totals.cashInHand)} icon={Banknote} tone="info" hint="Net cash for the day" />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>By method</CardTitle></CardHeader>
                    <CardContent>
                      {!Object.keys(d.byMethod).length ? <p className="text-sm text-muted-foreground">No transactions.</p> : (
                        <ul className="divide-y text-sm">
                          {Object.entries(d.byMethod).map(([m, v]) => (
                            <li key={m} className="flex justify-between py-2"><span>{titleCase(m)} <span className="text-xs text-muted-foreground">({v.count})</span></span><span className="tabular font-medium">{formatMoney(v.net)}</span></li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>By staff member</CardTitle></CardHeader>
                    <CardContent>
                      {!d.byUser.length ? <p className="text-sm text-muted-foreground">No transactions.</p> : (
                        <ul className="divide-y text-sm">
                          {d.byUser.map((u) => <li key={u.name} className="flex justify-between py-2"><span>{u.name} <span className="text-xs text-muted-foreground">({u.count})</span></span><span className="tabular font-medium">{formatMoney(u.net)}</span></li>)}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <PaymentsTable items={d.transactions} />
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>

        <TabsContent value="payments">
          <Select value={method} onChange={(e) => setMethod(e.target.value)} className="mb-4 sm:w-48" aria-label="Payment method">
            <option value="">All methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="panel">Panel</option>
          </Select>
          <AsyncBoundary state={payments}>{(d) => <PaymentsTable items={d.items} />}</AsyncBoundary>
        </TabsContent>

        <TabsContent value="outstanding">
          <AsyncBoundary state={outstanding} empty={(d) => (!d.items.length ? <EmptyState icon={Wallet} title="No outstanding balances" /> : null)}>
            {(d) => (
              <ul className="space-y-2">
                {d.items.map((o) => (
                  <li key={o.id} className="flex flex-col gap-3 glass rounded-2xl p-4  sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/orders/${o.id}`} className="font-medium hover:text-primary">{o.patientName}</Link>
                      <p className="text-xs text-muted-foreground">{o.orderNumber} · {o.patientMrNumber} · {formatDateTime(o.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge map={ORDER_STATUS} value={o.status} />
                      <span className="tabular text-sm text-muted-foreground">{formatMoney(o.paid)} / {formatMoney(o.total)}</span>
                      <span className="tabular font-semibold text-destructive">{formatMoney(o.balance)}</span>
                      {can('billing.collect') && <Button size="sm" onClick={() => setPaying({ id: o.id, orderNumber: o.orderNumber, balance: o.balance })}>Collect</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
        </TabsContent>
      </Tabs>
      {paying && <PaymentDialog open onOpenChange={(v) => !v && setPaying(null)} orderId={paying.id} orderNumber={paying.orderNumber} mode="payment" limit={paying.balance} onDone={() => { void outstanding.reload(); void daily.reload(); }} />}
    </div>
  );
}

export default function BillingPage() {
  return (
    <React.Suspense>
      <BillingTabs />
    </React.Suspense>
  );
}
