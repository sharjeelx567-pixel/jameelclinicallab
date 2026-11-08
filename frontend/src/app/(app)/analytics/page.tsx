'use client';

import { format } from 'date-fns';
import { Ban, Banknote, CheckCircle2, ClipboardList, Download, Percent, Printer, Users, Wallet } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AsyncBoundary, PageHeader } from '@/components/shared/states';
import { StatCard } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-controls';
import { useApi } from '@/hooks/use-api';
import { downloadCsv } from '@/lib/csv';
import { formatMoney, todayKey } from '@/lib/utils';
import { analyticsService } from '@/services/admin.service';

function Table({ title, rows, cols, csvName }: { title: string; rows: Array<Record<string, string | number>>; cols: Array<[string, string, ((v: string | number) => string)?]>; csvName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {rows.length > 0 && <Button size="sm" variant="ghost" className="no-print" onClick={() => downloadCsv(csvName, rows)}><Download /> CSV</Button>}
      </CardHeader>
      <CardContent>
        {!rows.length ? <p className="text-sm text-muted-foreground">No data for this period.</p> : (
          <div className="scrollbar-thin max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr>{cols.map(([k, l]) => <th key={k} className="py-2 pr-3">{l}</th>)}</tr></thead>
              <tbody className="divide-y">{rows.map((r, i) => <tr key={i}>{cols.map(([k, , f]) => <td key={k} className="tabular py-2 pr-3">{f ? f(r[k]) : r[k]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [from, setFrom] = React.useState(`${todayKey().slice(0, 8)}01`);
  const [to, setTo] = React.useState(todayKey());
  const state = useApi(() => analyticsService.range(from, to), [from, to]);
  const money = (v: string | number) => formatMoney(Number(v));
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Management figures computed from live records for the selected period."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" value={to} min={from} max={todayKey()} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print / PDF</Button>
          </div>
        }
      />
      <AsyncBoundary state={state}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Patients registered" value={d.totals.patients} icon={Users} />
              <StatCard label="Orders" value={d.totals.orders} hint={`${d.totals.completedOrders} completed`} icon={ClipboardList} tone="info" />
              <StatCard label="Cancelled orders" value={d.totals.cancelledOrders} icon={Ban} tone="danger" />
              <StatCard label="Billed" value={formatMoney(d.totals.billed)} icon={CheckCircle2} tone="primary" />
              <StatCard label="Collected" value={formatMoney(d.totals.collected)} icon={Banknote} tone="success" />
              <StatCard label="Refunded" value={formatMoney(d.totals.refunded)} icon={Wallet} tone="warning" />
              <StatCard label="Outstanding (period orders)" value={formatMoney(d.totals.outstanding)} icon={Wallet} tone="danger" />
              <StatCard label="Discounts given" value={formatMoney(d.totals.discounts)} icon={Percent} tone="info" />
            </div>
            <Card>
              <CardHeader><CardTitle>Daily activity</CardTitle></CardHeader>
              <CardContent>
                {!d.daily.length ? <p className="text-sm text-muted-foreground">No activity in this period.</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={d.daily} margin={{ left: -16, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: string) => format(new Date(v), 'dd MMM')} />
                      <YAxis yAxisId="l" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-foreground">{value}</span>} />
                      <Bar yAxisId="l" dataKey="patients" name="Patients" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="l" dataKey="orders" name="Orders" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Table title="Daily revenue" csvName={`daily-${from}-${to}.csv`} rows={d.daily} cols={[['date', 'Date'], ['patients', 'Patients'], ['orders', 'Orders'], ['revenue', 'Net collected', money]]} />
              <Table title="Test popularity & revenue" csvName={`tests-${from}-${to}.csv`} rows={d.tests} cols={[['testName', 'Test'], ['category', 'Category'], ['count', 'Count'], ['revenue', 'Revenue', money]]} />
              <Table title="Doctor referrals" csvName={`doctors-${from}-${to}.csv`} rows={d.doctors} cols={[['doctorName', 'Doctor'], ['orders', 'Orders'], ['revenue', 'Billed', money]]} />
              <Table title="Staff activity" csvName={`staff-${from}-${to}.csv`} rows={d.staffActivity} cols={[['name', 'Staff'], ['role', 'Role'], ['actions', 'Audited actions']]} />
              <Table title="Inventory consumption" csvName={`inventory-${from}-${to}.csv`} rows={d.inventoryConsumption} cols={[['itemName', 'Item'], ['quantity', 'Quantity used']]} />
            </div>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
