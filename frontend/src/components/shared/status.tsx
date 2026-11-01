import { AlertOctagon, ArrowDown, ArrowUp, FlaskConical, type LucideIcon, Cpu } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FLAG_META } from '@/constants';
import { cn, titleCase } from '@/lib/utils';

export function StatusBadge({ map, value, className }: { map: Record<string, { label: string; tone: React.ComponentProps<typeof Badge>['tone'] }>; value: string; className?: string }) {
  const m = map[value] ?? { label: titleCase(value), tone: 'neutral' as const };
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

export function FlagBadge({ flag }: { flag: string }) {
  if (flag === 'normal') return <span className="text-xs text-muted-foreground">Normal</span>;
  if (flag === 'no_range') return <span className="text-xs text-muted-foreground" title="No approved reference range configured">No range</span>;
  const m = FLAG_META[flag];
  const Icon = flag === 'low' || flag === 'critical_low' ? ArrowDown : flag === 'abnormal' ? AlertOctagon : ArrowUp;
  return (
    <Badge tone={m?.tone ?? 'warning'} className={cn(flag.startsWith('critical') && 'animate-pulse font-semibold')}>
      <Icon className="size-3" aria-hidden />
      {m?.label ?? flag}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: 'manual' | 'analyzer' }) {
  return source === 'analyzer' ? (
    <Badge tone="info" title="Imported from analyzer — requires human verification">
      <Cpu className="size-3" /> Analyzer
    </Badge>
  ) : (
    <Badge tone="outline">
      <FlaskConical className="size-3" /> Manual
    </Badge>
  );
}

export function DemoBadge({ label = 'DEMO' }: { label?: string }) {
  return <Badge tone="demo">{label}</Badge>;
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'primary', href }: { label: string; value: React.ReactNode; icon: LucideIcon; hint?: React.ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'; href?: string }) {
  const tones = {
    primary: 'from-primary/25 to-brand-3/10 text-primary ring-primary/30',
    success: 'from-success/25 to-success/5 text-success ring-success/30',
    warning: 'from-warning/25 to-highlight/5 text-warning ring-warning/30',
    danger: 'from-destructive/25 to-destructive/5 text-destructive ring-destructive/30',
    info: 'from-info/25 to-brand-3/5 text-info ring-info/30',
  };
  const body = (
    <Card className={cn('group relative flex h-full items-start gap-4 overflow-hidden p-4 sm:p-5', href && 'glass-hover')}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className={cn('grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1', tones[tone])}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-snug text-muted-foreground">{label}</p>
        <p className="tabular mt-0.5 font-display text-2xl font-bold leading-tight tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
  return href ? (
    <a href={href} className="block rounded-xl">
      {body}
    </a>
  ) : (
    body
  );
}
