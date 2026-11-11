import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AnalyzerDoc, AuditLogDoc, CatalogIndexDoc, DoctorDoc, OrderDoc, PatientDoc, PaymentDoc, ResultDoc, TestCategoryDoc } from '../../common/entities';
import type { AuthUser } from '../../common/types';
import { getEnv } from '../../config/env';
import { C, DataStore } from '../../database/data-store';
import { CurrentUser, RequirePermissions } from '../../decorators';
import { labDateKey, labDayStart, round2 } from '../../utils';
import { InventoryModule, InventoryService } from '../inventory/inventory.module';
import { HEARTBEAT_STALE_MS } from '../analyzers/analyzers.service';

const DAY = 86400_000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly store: DataStore,
    private readonly inventory: InventoryService,
  ) {}

  private get tz() {
    return getEnv().LAB_TIMEZONE;
  }

  private dayKeys(days: number): string[] {
    const today = labDayStart(this.tz);
    return Array.from({ length: days }, (_, i) => labDateKey(this.tz, new Date(today.getTime() - (days - 1 - i) * DAY + 12 * 3600_000)));
  }

  /** Dashboard: every figure is computed from live records. Sections are included only if the user may see them. */
  async dashboard(user: AuthUser) {
    const can = (p: string) => user.permissions.includes(p as never);
    const todayStart = labDayStart(this.tz).toISOString();
    const todayKey = labDateKey(this.tz, new Date());
    const out: Record<string, unknown> = { generatedAt: this.store.now(), timeZone: this.tz };

    if (can('patients.read')) {
      out.patients = {
        total: await this.store.count(C.patients, [{ field: 'status', op: '==', value: 'active' }]),
        today: await this.store.count(C.patients, [{ field: 'createdAt', op: '>=', value: todayStart }]),
      };
      const recent = await this.store.query<PatientDoc>(C.patients, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 6 });
      out.recentPatients = recent.items.map((p) => ({ id: p.id, mrNumber: p.mrNumber, name: p.name, gender: p.gender, ageYears: p.ageYears, createdAt: p.createdAt }));
      const since = new Date(labDayStart(this.tz).getTime() - 6 * DAY).toISOString();
      const week = await this.store.query<PatientDoc>(C.patients, { where: [{ field: 'createdAt', op: '>=', value: since }] });
      const counts = new Map(this.dayKeys(7).map((k) => [k, 0]));
      week.items.forEach((p) => {
        const k = labDateKey(this.tz, new Date(p.createdAt));
        if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
      });
      out.weeklyRegistrations = [...counts].map(([date, count]) => ({ date, count }));
    }

    if (can('orders.read')) {
      const statusCount = (s: string) => this.store.count(C.orders, [{ field: 'status', op: '==', value: s }]);
      out.orders = {
        today: await this.store.count(C.orders, [{ field: 'createdAt', op: '>=', value: todayStart }]),
        completedTotal: await statusCount('completed'),
        verificationPending: await statusCount('verification_pending'),
      };
      const recent = await this.store.query<OrderDoc>(C.orders, { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 6 });
      out.recentOrders = recent.items.map((o) => ({ id: o.id, orderNumber: o.orderNumber, patientName: o.patientName, status: o.status, total: o.billing.total, priority: o.priority, createdAt: o.createdAt }));
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const month = await this.store.query<OrderDoc>(C.orders, { where: [{ field: 'createdAt', op: '>=', value: since }] });
      const dist = new Map<string, number>();
      month.items.filter((o) => o.status !== 'cancelled').forEach((o) => o.items.forEach((i) => dist.set(i.testName, (dist.get(i.testName) ?? 0) + 1)));
      out.testDistribution = [...dist].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    }

    if (can('samples.read')) {
      const s = (status: string) => this.store.count(C.samples, [{ field: 'status', op: '==', value: status }]);
      out.samples = { pendingCollection: await s('pending_collection'), awaitingReceipt: await s('collected'), received: await s('received'), processing: (await s('processing')) + (await s('accepted')) };
    }

    if (can('results.read')) {
      const r = (status: string) => this.store.count(C.results, [{ field: 'status', op: '==', value: status }]);
      out.results = { pending: (await r('pending')) + (await r('draft')) + (await r('correction_requested')), awaitingVerification: await r('submitted') };
      const critical = await this.store.query<ResultDoc>(C.results, { where: [{ field: 'hasCritical', op: '==', value: true }], orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 5 });
      out.criticalResults = critical.items.map((x) => ({ id: x.id, orderId: x.orderId, orderNumber: x.orderNumber, testCode: x.testCode, status: x.status, updatedAt: x.updatedAt }));
    }

    if (can('reports.read')) {
      out.reports = { total: await this.store.count(C.reports, [{ field: 'status', op: 'in', value: ['final', 'amended'] }]) };
    }

    if (can('billing.read')) {
      const todays = await this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'businessDate', op: '==', value: todayKey }] });
      const outstanding = await this.store.query<OrderDoc>(C.orders, { where: [{ field: 'billing.balance', op: '>', value: 0 }] });
      out.revenue = {
        today: round2(todays.items.reduce((s, p) => s + (p.type === 'payment' ? p.amount : -p.amount), 0)),
        outstanding: round2(outstanding.items.reduce((s, o) => s + o.billing.balance, 0)),
        outstandingOrders: outstanding.items.length,
      };
      out.monthlyRevenue = await this.monthlyRevenue(6);
    }

    if (can('analyzers.read')) {
      const analyzers = await this.store.query<AnalyzerDoc>(C.analyzers, {});
      out.analyzers = analyzers.items.map((a) => {
        const fresh = a.lastHeartbeatAt && Date.now() - Date.parse(a.lastHeartbeatAt) < HEARTBEAT_STALE_MS;
        return { id: a.id, name: a.name, mode: a.mode, enabled: a.enabled, integrationStatus: a.integrationStatus, connectionState: a.connectionState === 'connected' && !fresh ? 'disconnected' : a.connectionState, lastMessageAt: a.lastMessageAt };
      });
    }

    if (can('inventory.read')) {
      const alerts = await this.inventory.alerts();
      out.inventory = { lowStock: alerts.lowStock.length, expiringSoon: alerts.expiringSoon.length, expired: alerts.expired.length, items: [...alerts.lowStock, ...alerts.expired].slice(0, 5).map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, minimumLevel: i.minimumLevel, expiryDate: i.expiryDate })) };
    }
    return out;
  }

  async monthlyRevenue(months: number) {
    const now = new Date();
    const keys = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
      return d.toISOString().slice(0, 7);
    });
    const payments = await this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'businessDate', op: '>=', value: `${keys[0]}-01` }] });
    const sums = new Map(keys.map((k) => [k, 0]));
    payments.items.forEach((p) => {
      const k = p.businessDate.slice(0, 7);
      if (sums.has(k)) sums.set(k, sums.get(k)! + (p.type === 'payment' ? p.amount : -p.amount));
    });
    return [...sums].map(([month, revenue]) => ({ month, revenue: round2(revenue) }));
  }

  /** Management analytics over a date range (lab-local dates, inclusive). */
  async range(from: string, to: string) {
    const fromIso = labDayStart(this.tz, new Date(`${from}T12:00:00Z`)).toISOString();
    const toIso = new Date(labDayStart(this.tz, new Date(`${to}T12:00:00Z`)).getTime() + DAY - 1).toISOString();
    const [orders, payments, patients, tests, categories, doctors, audit] = await Promise.all([
      this.store.query<OrderDoc>(C.orders, { where: [{ field: 'createdAt', op: '>=', value: fromIso }, { field: 'createdAt', op: '<=', value: toIso }] }),
      this.store.query<PaymentDoc>(C.payments, { where: [{ field: 'businessDate', op: '>=', value: from }, { field: 'businessDate', op: '<=', value: to }] }),
      this.store.query<PatientDoc>(C.patients, { where: [{ field: 'createdAt', op: '>=', value: fromIso }, { field: 'createdAt', op: '<=', value: toIso }] }),
      // The catalogue index holds every test's category in ONE document (not ~850 reads).
      this.store.get<CatalogIndexDoc>(C.catalogIndex, 'main'),
      this.store.query<TestCategoryDoc>(C.testCategories, {}),
      this.store.query<DoctorDoc>(C.doctors, {}),
      this.store.query<AuditLogDoc>(C.auditLogs, { where: [{ field: 'at', op: '>=', value: fromIso }, { field: 'at', op: '<=', value: toIso }], limit: 5000 }),
    ]);
    const active = orders.items.filter((o) => o.status !== 'cancelled');
    const daily = new Map<string, { date: string; patients: number; orders: number; revenue: number }>();
    const day = (k: string) => daily.get(k) ?? daily.set(k, { date: k, patients: 0, orders: 0, revenue: 0 }).get(k)!;
    patients.items.forEach((p) => day(labDateKey(this.tz, new Date(p.createdAt))).patients++);
    active.forEach((o) => day(labDateKey(this.tz, new Date(o.createdAt))).orders++);
    payments.items.forEach((p) => (day(p.businessDate).revenue += p.type === 'payment' ? p.amount : -p.amount));

    const testCat = new Map((tests?.tests ?? []).map((t) => [t.id, t.categoryId]));
    const catName = new Map(categories.items.map((c) => [c.id, c.name]));
    const byTest = new Map<string, { testName: string; category: string; count: number; revenue: number }>();
    active.forEach((o) =>
      o.items.forEach((i) => {
        const e = byTest.get(i.testId) ?? { testName: i.testName, category: catName.get(testCat.get(i.testId) ?? '') ?? '', count: 0, revenue: 0 };
        e.count++;
        e.revenue += i.unitPrice;
        byTest.set(i.testId, e);
      }),
    );
    const docName = new Map(doctors.items.map((d) => [d.id, d.name]));
    const byDoctor = new Map<string, { doctorName: string; orders: number; revenue: number }>();
    active.filter((o) => o.doctorId).forEach((o) => {
      const e = byDoctor.get(o.doctorId!) ?? { doctorName: docName.get(o.doctorId!) ?? o.doctorName ?? '—', orders: 0, revenue: 0 };
      e.orders++;
      e.revenue += o.billing.total;
      byDoctor.set(o.doctorId!, e);
    });
    const staff = new Map<string, { name: string; role: string; actions: number }>();
    audit.items.filter((a) => a.actor.role !== 'system' && a.actor.role !== 'bridge').forEach((a) => {
      const e = staff.get(a.actor.uid) ?? { name: a.actor.name, role: a.actor.role, actions: 0 };
      e.actions++;
      staff.set(a.actor.uid, e);
    });

    return {
      from,
      to,
      totals: {
        patients: patients.items.length,
        orders: active.length,
        cancelledOrders: orders.items.length - active.length,
        completedOrders: active.filter((o) => o.status === 'completed').length,
        billed: round2(active.reduce((s, o) => s + o.billing.total, 0)),
        collected: round2(payments.items.filter((p) => p.type === 'payment').reduce((s, p) => s + p.amount, 0)),
        refunded: round2(payments.items.filter((p) => p.type === 'refund').reduce((s, p) => s + p.amount, 0)),
        outstanding: round2(active.reduce((s, o) => s + o.billing.balance, 0)),
        discounts: round2(active.reduce((s, o) => s + o.billing.discountAmount, 0)),
      },
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, revenue: round2(d.revenue) })),
      tests: [...byTest.values()].sort((a, b) => b.count - a.count),
      doctors: [...byDoctor.values()].sort((a, b) => b.orders - a.orders),
      staffActivity: [...staff.values()].sort((a, b) => b.actions - a.actions),
      inventoryConsumption: await this.inventory.consumption(fromIso, toIso),
    };
  }
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Role-aware: sections the user cannot access are omitted. */
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(user);
  }

  @Get('range')
  @RequirePermissions('analytics.read')
  range(@Query('from') from?: string, @Query('to') to?: string) {
    const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    const today = labDateKey(getEnv().LAB_TIMEZONE, new Date());
    const start = valid(from) ?? `${today.slice(0, 8)}01`;
    return this.analytics.range(start, valid(to) ?? today);
  }
}

@Module({ imports: [InventoryModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
