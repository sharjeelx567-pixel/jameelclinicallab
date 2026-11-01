'use client';

import { format, parseISO } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/utils';

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 12, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />;
const tooltipStyle = {
  contentStyle: { background: 'hsl(var(--popover) / 0.92)', backdropFilter: 'blur(12px)', border: '1px solid hsl(var(--glass-border))', borderRadius: 12, boxShadow: 'var(--shadow-elevated)', fontSize: 12, color: 'hsl(var(--popover-foreground))' },
  cursor: { fill: 'hsl(var(--muted))' },
};

export function RevenueChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--brand-3))" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="month" {...axis} tickFormatter={(m: string) => format(parseISO(`${m}-01`), 'MMM')} />
        <YAxis {...axis} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(v))} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [formatMoney(v), 'Net collected']} labelFormatter={(m: string) => format(parseISO(`${m}-01`), 'MMMM yyyy')} />
        <Bar dataKey="revenue" fill="url(#revFill)" radius={[8, 8, 0, 0]} maxBarSize={44} animationDuration={900} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RegistrationsChart({ data }: { data: Array<{ date: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -24, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => format(parseISO(d), 'EEE')} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Registrations']} labelFormatter={(d: string) => format(parseISO(d), 'EEE, dd MMM')} />
        <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#regFill)" animationDuration={900} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Ranked list with proportional bars: full test names stay readable at any width. */
export function DistributionChart({ data }: { data: Array<{ name: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-3" aria-label="Tests ordered">
      {data.map((d) => (
        <li key={d.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{d.name}</span>
            <span className="tabular shrink-0 font-semibold">{d.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-highlight to-warning transition-[width] duration-700 ease-out" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
