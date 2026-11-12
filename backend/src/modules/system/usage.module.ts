import { Controller, Get, Injectable, Module, OnApplicationShutdown, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { quotaDay, usage, USAGE_COLLECTION, type UsageDayDoc } from '../../common/usage-monitor';
import { DataStore } from '../../database/data-store';
import { RequirePermissions } from '../../decorators';

const FREE_READS = 50_000;
const FREE_WRITES = 20_000;

type RouteRow = { route: string; workflow: string; requests: number; reads: number; writes: number; queries: number; maxReads: number };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const merge = <T extends { requests: number; reads: number; writes: number }>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T>();
  for (const r of rows) {
    const cur = m.get(key(r));
    if (!cur) m.set(key(r), { ...r });
    else {
      cur.requests += r.requests;
      cur.reads += r.reads;
      cur.writes += r.writes;
      const c = cur as unknown as Partial<RouteRow>, x = r as unknown as Partial<RouteRow>;
      if (c.queries !== undefined) c.queries += x.queries ?? 0;
      if (c.maxReads !== undefined) c.maxReads = Math.max(c.maxReads, x.maxReads ?? 0);
    }
  }
  return [...m.values()];
};

@Injectable()
export class UsageService implements OnApplicationShutdown {
  constructor(private readonly store: DataStore) {}

  /** Save the latest counters when the server stops. */
  async onApplicationShutdown() {
    await usage.flush();
  }

  /**
   * Usage report for the last `days` quota days (US Pacific, like the Firebase console).
   * Reads one small document per server process per day; this server's unsaved counters
   * are included live. Other processes' counters can be up to 5 minutes behind.
   */
  async report(days: number) {
    const today = quotaDay();
    const from = addDays(today, -(days - 1));
    const saved = (await this.store.query<UsageDayDoc>(USAGE_COLLECTION, { where: [{ field: 'date', op: '>=', value: from }], limit: 2000 })).items;
    const live = usage.snapshot();
    const docs = [...saved.filter((d) => d.id !== live.id), ...(live.date >= from ? [live] : [])];

    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const daily = dates.map((date) => {
      const ds = docs.filter((d) => d.date === date);
      const sum = (f: (d: UsageDayDoc) => number) => ds.reduce((s, d) => s + (f(d) || 0), 0);
      const routes = merge(ds.flatMap((d) => d.routes ?? []), (r) => r.route);
      return {
        date,
        serverProcesses: ds.length,
        requests: sum((d) => d.requests),
        reads: sum((d) => d.reads),
        writes: sum((d) => d.writes),
        queries: sum((d) => d.queries),
        aggregations: sum((d) => d.aggregations),
        monitoringWrites: sum((d) => d.monitoringWrites),
        unattributed: { reads: sum((d) => d.unattributed?.reads), writes: sum((d) => d.unattributed?.writes) },
        percentOfFreeReads: Math.round((sum((d) => d.reads) / FREE_READS) * 1000) / 10,
        percentOfFreeWrites: Math.round((sum((d) => d.writes) / FREE_WRITES) * 1000) / 10,
        routes,
        caches: merge(
          ds.flatMap((d) => (d.caches ?? []).map((c) => ({ ...c, requests: 0, reads: c.hits, writes: c.misses }))),
          (c) => c.name,
        ).map((c) => ({ name: c.name, hits: c.reads, misses: c.writes, hitRate: c.reads + c.writes ? Math.round((c.reads / (c.reads + c.writes)) * 1000) / 10 : null })),
        heavyRequests: ds.flatMap((d) => d.heavyRequests ?? []).sort((a, b) => b.reads - a.reads).slice(0, 20),
      };
    });

    const todayRow = daily[daily.length - 1];
    const past = daily.slice(0, -1).filter((d) => d.requests > 0);
    const workflows = merge(todayRow.routes.map((r) => ({ name: r.workflow, requests: r.requests, reads: r.reads, writes: r.writes })), (r) => r.name)
      .map((w) => ({ ...w, readsPerRequest: w.requests ? Math.round((w.reads / w.requests) * 10) / 10 : 0 }))
      .sort((a, b) => b.reads - a.reads);

    // Unexpected increases: today against the average of the earlier days in the report.
    const anomalies: Array<{ level: 'warning' | 'critical'; message: string }> = [];
    if (todayRow.reads >= FREE_READS * 0.9) anomalies.push({ level: 'critical', message: `Today ${todayRow.reads} reads — ${todayRow.percentOfFreeReads}% of the free daily 50,000.` });
    else if (todayRow.reads >= FREE_READS * 0.7) anomalies.push({ level: 'warning', message: `Today ${todayRow.reads} reads — ${todayRow.percentOfFreeReads}% of the free daily 50,000.` });
    if (todayRow.writes >= FREE_WRITES * 0.7) anomalies.push({ level: 'warning', message: `Today ${todayRow.writes} writes — ${todayRow.percentOfFreeWrites}% of the free daily 20,000.` });
    if (past.length) {
      const avgReads = past.reduce((s, d) => s + d.reads, 0) / past.length;
      if (avgReads > 0 && todayRow.reads > 2 * avgReads && todayRow.reads > 2000)
        anomalies.push({ level: 'warning', message: `Today's reads (${todayRow.reads}) are more than twice the recent daily average (${Math.round(avgReads)}).` });
      const pastRoutes = merge(past.flatMap((d) => d.routes), (r) => r.route);
      for (const r of todayRow.routes) {
        const base = pastRoutes.find((p) => p.route === r.route);
        if (!base || base.requests < 10 || r.requests < 10) continue;
        const before = base.reads / base.requests, now = r.reads / r.requests;
        if (now > 2 * before && now - before >= 3)
          anomalies.push({ level: 'warning', message: `${r.route}: ${now.toFixed(1)} reads per request today vs ${before.toFixed(1)} before.` });
      }
    }
    for (const h of todayRow.heavyRequests.slice(0, 5)) anomalies.push({ level: 'warning', message: `Heavy request ${h.route}: ${h.reads} reads at ${h.at}.` });

    return {
      generatedAt: new Date().toISOString(),
      quotaDay: today,
      timeZone: 'America/Los_Angeles (Firestore quota day; resets about 1 PM Pakistan time)',
      freeDailyLimits: { reads: FREE_READS, writes: FREE_WRITES },
      notes: [
        'Counts are this application’s own estimate of Firestore billing (see docs/DATABASE_USAGE.md). Compare with Firebase console → Firestore → Usage.',
        'Each server process saves its counters at most every 5 minutes; counters of a process that stops before saving are lost (a few minutes at most).',
        'Only route patterns and numbers are recorded — never ids, patient data, results or credentials.',
      ],
      anomalies,
      today: { ...todayRow, routes: [...todayRow.routes].sort((a, b) => b.reads - a.reads).slice(0, 40), workflows },
      days: daily.map(({ routes: _r, heavyRequests: _h, caches: _c, ...d }) => d),
    };
  }
}

@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  /** Database usage by day, route, workflow and cache — Super Admin only. */
  @Get('usage')
  @RequirePermissions('roles.manage')
  report(@Query('days') days?: string) {
    const n = Math.min(30, Math.max(1, Number(days) || 7));
    return this.usageService.report(n);
  }
}

@Module({ controllers: [UsageController], providers: [UsageService] })
export class UsageModule {}
