'use client';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  FileCheck2,
  FlaskConical,
  PackageX,
  Plus,
  TestTube,
  TestTubes,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { DistributionChart, RegistrationsChart, RevenueChart } from '@/components/dashboard/charts';
import { HeroLogo } from '@/components/shared/hero-logo';
import { CountUp, Stagger, StaggerItem } from '@/components/shared/motion';
import { EmptyState, ErrorState, LoadingCards } from '@/components/shared/states';
import { DemoBadge, StatCard, StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONNECTION_STATE, INTEGRATION_STATUS, ORDER_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { formatDateTime, formatMoney, timeAgo } from '@/lib/utils';
import { analyticsService } from '@/services/admin.service';


function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const state = useApi(() => analyticsService.dashboard(), []);
  const d = state.data;

  const quick = [
    { href: '/register', label: 'Register & bill', icon: UserPlus, perm: 'orders.create' },
    { href: '/orders/new', label: 'New order', icon: Plus, perm: 'orders.create' },
    { href: '/samples', label: 'Collect samples', icon: TestTube, perm: 'samples.collect' },
    { href: '/results', label: 'Enter results', icon: FlaskConical, perm: 'results.enter' },
    { href: '/verification', label: 'Verify results', icon: ClipboardCheck, perm: 'results.approve' },
    { href: '/billing', label: 'Record payment', icon: Wallet, perm: 'billing.collect' },
  ].filter((q) => can(q.perm));

  return (
    <div>
      <section className="glass relative mb-6 overflow-hidden rounded-3xl p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-brand-3/15" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.3fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="text-sm font-medium text-primary">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
              {greeting()}, <span className="text-gradient">{user?.displayName.split(' ')[0] ?? ''}</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {d ? `Live laboratory overview · updated ${timeAgo(d.generatedAt)}` : 'Loading live laboratory overview…'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {quick.slice(0, 3).map((q, i) => (
                <Button key={q.href} asChild variant={i === 0 ? 'default' : 'outline'}>
                  <Link href={q.href}><q.icon /> {q.label}</Link>
                </Button>
              ))}
            </div>
          </motion.div>
          <div className="mx-auto hidden w-full max-w-sm py-2 sm:block">
            <HeroLogo />
          </div>
        </div>
      </section>

      {state.error ? (
        <ErrorState error={state.error} onRetry={state.reload} />
      ) : !d ? (
        <div className="space-y-4">
          <LoadingCards count={8} />
        </div>
      ) : (
        <Stagger className="space-y-6">
          <StaggerItem className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {d.patients && <StatCard label="Total patients" value={<CountUp value={d.patients.total} />} hint={`${d.patients.today} registered today`} icon={Users} href="/patients" />}
            {d.orders && <StatCard label="Today's orders" value={<CountUp value={d.orders.today} />} hint={`${d.orders.completedTotal} completed overall`} icon={ClipboardList} tone="info" href="/orders" />}
            {d.samples && <StatCard label="Pending samples" value={<CountUp value={d.samples.pendingCollection} />} hint={`${d.samples.awaitingReceipt} awaiting receipt · ${d.samples.processing} in processing`} icon={TestTubes} tone="warning" href="/samples" />}
            {d.results && <StatCard label="Awaiting verification" value={<CountUp value={d.results.awaitingVerification} />} hint={`${d.results.pending} results pending entry`} icon={ClipboardCheck} tone="primary" href={can('results.approve') ? '/verification' : '/results'} />}
            {d.reports && <StatCard label="Reports issued" value={<CountUp value={d.reports.total} />} hint="Final & amended" icon={FileCheck2} tone="success" href="/reports" />}
            {d.revenue && <StatCard label="Today's revenue" value={<CountUp value={d.revenue.today} format={formatMoney} />} hint="Net of refunds" icon={Banknote} tone="success" href="/billing" />}
            {d.revenue && <StatCard label="Outstanding" value={<CountUp value={d.revenue.outstanding} format={formatMoney} />} hint={`${d.revenue.outstandingOrders} orders with balance`} icon={Wallet} tone="danger" href="/billing?tab=outstanding" />}
            {d.inventory && <StatCard label="Inventory alerts" value={<CountUp value={d.inventory.lowStock + d.inventory.expired} />} hint={`${d.inventory.lowStock} low · ${d.inventory.expired} expired · ${d.inventory.expiringSoon} expiring`} icon={PackageX} tone="warning" href="/inventory" />}
          </StaggerItem>

          {quick.length > 2 && (
            <Card>
              <CardContent className="flex flex-wrap gap-2 p-4">
                <span className="mr-2 self-center text-sm font-medium text-muted-foreground">Quick actions</span>
                {quick.map((q) => (
                  <Button key={q.href} asChild variant="secondary" size="sm">
                    <Link href={q.href}><q.icon /> {q.label}</Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {d.monthlyRevenue && (
              <Card className="xl:col-span-2">
                <CardHeader>
                  <div>
                    <CardTitle>Monthly revenue</CardTitle>
                    <CardDescription>Net payments recorded, last 6 months</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <RevenueChart data={d.monthlyRevenue} />
                </CardContent>
              </Card>
            )}
            {d.weeklyRegistrations && (
              <Card className={d.monthlyRevenue ? '' : 'xl:col-span-2'}>
                <CardHeader>
                  <div>
                    <CardTitle>Patient registrations</CardTitle>
                    <CardDescription>Last 7 days</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <RegistrationsChart data={d.weeklyRegistrations} />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {d.criticalResults && (
              <Card className="border-destructive/25">
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /> Critical results</CardTitle>
                    <CardDescription>Most recent results with critical values</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {!d.criticalResults.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No critical values recorded.</p>
                  ) : (
                    <ul className="divide-y">
                      {d.criticalResults.map((r) => (
                        <li key={r.id}>
                          <Link href={`/orders/${r.orderId}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                            <span className="min-w-0">
                              <span className="block font-medium">{r.testCode} · {r.orderNumber}</span>
                              <span className="block text-xs text-muted-foreground">{timeAgo(r.updatedAt)}</span>
                            </span>
                            <StatusBadge map={{ submitted: { label: 'Awaiting verification', tone: 'warning' }, approved: { label: 'Verified', tone: 'danger' } }} value={r.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {d.testDistribution && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Test distribution</CardTitle>
                    <CardDescription>Most ordered tests, last 30 days</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {d.testDistribution.length ? <DistributionChart data={d.testDistribution} /> : <p className="py-6 text-center text-sm text-muted-foreground">No orders in the last 30 days.</p>}
                </CardContent>
              </Card>
            )}

            {d.analyzers && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2"><Cpu className="size-4" /> Analyzer status</CardTitle>
                    <CardDescription>Reported by the machine bridge only</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm"><Link href="/analyzers">Manage</Link></Button>
                </CardHeader>
                <CardContent>
                  {!d.analyzers.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No analyzers registered.</p>
                  ) : (
                    <ul className="space-y-3">
                      {d.analyzers.map((a) => (
                        <li key={a.id} className="space-y-1.5 rounded-xl bg-background/40 p-3 text-sm">
                          <p className="break-words font-medium">{a.name}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {a.mode === 'demo' ? <DemoBadge label="Demo — not connected" /> : <StatusBadge map={CONNECTION_STATE} value={a.connectionState} />}
                            <span className="text-xs text-muted-foreground">{INTEGRATION_STATUS[a.integrationStatus]?.label}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {d.recentOrders && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent orders</CardTitle>
                  <Button asChild variant="ghost" size="sm"><Link href="/orders">View all</Link></Button>
                </CardHeader>
                <CardContent>
                  {!d.recentOrders.length ? (
                    <EmptyState icon={ClipboardList} title="No orders yet" />
                  ) : (
                    <ul className="divide-y">
                      {d.recentOrders.map((o) => (
                        <li key={o.id}>
                          <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                            <span className="min-w-0">
                              <span className="block break-words font-medium">{o.patientName}</span>
                              <span className="block text-xs text-muted-foreground">{o.orderNumber} · {formatDateTime(o.createdAt)}</span>
                            </span>
                            <StatusBadge map={ORDER_STATUS} value={o.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
            {d.recentPatients && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent registrations</CardTitle>
                  <Button asChild variant="ghost" size="sm"><Link href="/patients">View all</Link></Button>
                </CardHeader>
                <CardContent>
                  {!d.recentPatients.length ? (
                    <EmptyState icon={Users} title="No patients registered yet" action={can('patients.write') ? <Button asChild size="sm"><Link href="/register">Register first patient</Link></Button> : undefined} />
                  ) : (
                    <ul className="divide-y">
                      {d.recentPatients.map((p) => (
                        <li key={p.id}>
                          <Link href={`/patients/${p.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                            <span className="min-w-0">
                              <span className="block break-words font-medium">{p.name}</span>
                              <span className="block text-xs text-muted-foreground">{p.mrNumber} · {p.ageYears ?? '—'}Y {p.gender[0].toUpperCase()}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(p.createdAt)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </Stagger>
      )}
    </div>
  );
}
