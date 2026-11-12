import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DataStore, QueryOptions, TransactionContext } from '../database/data-store';

/**
 * Lightweight Firestore usage monitor (server-side, in-process).
 *
 * - Counts document reads/writes the way Firestore bills them, per API route pattern
 *   (e.g. "POST /api/v1/samples/:id/collect") and per laboratory workflow.
 * - Counts cache hits/misses of the server-side caches.
 * - Keeps running totals in memory and saves them at most every 5 minutes as ONE document
 *   per server process per day (usageStats/{date}_{instance}) — writes only, never reads.
 * - Records only route patterns and numbers: never ids, query values, request bodies,
 *   patient data, results, tokens or passwords.
 * Days follow US Pacific time, like the Firestore free-quota day and the Firebase console.
 */

const FLUSH_MS = 5 * 60_000;
const HEAVY_REQUEST_READS = 300;
const QUOTA_TZ = 'America/Los_Angeles';

interface RequestCtx {
  reads: number;
  writes: number;
  queries: number;
  aggregations: number;
  txDepth: number;
}

interface RouteStats {
  route: string;
  workflow: string;
  requests: number;
  reads: number;
  writes: number;
  queries: number;
  maxReads: number;
}

export interface UsageDayDoc {
  id: string;
  date: string;
  instanceId: string;
  startedAt: string;
  updatedAt: string;
  requests: number;
  reads: number;
  writes: number;
  queries: number;
  aggregations: number;
  /** Database work outside any API request (start-up seeding, scheduled jobs). */
  unattributed: { reads: number; writes: number };
  /** Writes made by this monitor itself (saving these statistics). */
  monitoringWrites: number;
  routes: RouteStats[];
  caches: Array<{ name: string; hits: number; misses: number }>;
  heavyRequests: Array<{ route: string; reads: number; writes: number; at: string }>;
}

/** Laboratory workflows tracked separately (matched on the route pattern). */
const WORKFLOWS: Array<[string, RegExp]> = [
  ['patient_registration', /^POST \/api\/v1\/patients$/],
  ['order_creation', /^POST \/api\/v1\/orders$/],
  ['sample_processing', /^POST \/api\/v1\/samples\/:id\/(collect|receive|accept|reject)$/],
  ['result_entry', /^PUT \/api\/v1\/results\/:id\/values$/],
  ['result_approval', /^POST \/api\/v1\/results\/:id\/(approve|reject|amend)$/],
  ['report_generation', /^POST \/api\/v1\/reports\/orders\/:orderId$/],
  ['payment', /^POST \/api\/v1\/billing\/orders\/:orderId\/(payments|refunds)$/],
  ['dashboard', /^GET \/api\/v1\/analytics\/dashboard$/],
  ['notifications', /^GET \/api\/v1\/notifications$/],
];
export const workflowOf = (route: string) => WORKFLOWS.find(([, re]) => re.test(route))?.[0] ?? 'other';

/** Pacific-time date key (YYYY-MM-DD), matching the Firestore quota day. */
export const quotaDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: QUOTA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Path without ids, for requests that did not match a route (404s): long/numeric segments → :id. */
const normalisePath = (path: string) =>
  path
    .split('?')[0]
    .split('/')
    .map((seg) => (/^[A-Za-z0-9_-]{12,}$/.test(seg) || /\d{3,}/.test(seg) ? ':id' : seg))
    .join('/')
    .slice(0, 120);

class UsageMonitor {
  readonly enabled = process.env.USAGE_MONITOR !== 'off';
  readonly instanceId = randomBytes(4).toString('hex');
  private readonly als = new AsyncLocalStorage<RequestCtx>();
  private readonly logger = new Logger('UsageMonitor');
  private raw?: { set: DataStore['set']; kind: DataStore['kind'] };
  private lastFlush = Date.now();
  private flushing = false;
  private dirty = false;
  private day = this.emptyDay(quotaDay());
  private routes = new Map<string, RouteStats>();
  private caches = new Map<string, { hits: number; misses: number }>();

  private emptyDay(date: string): UsageDayDoc {
    const now = new Date().toISOString();
    return {
      id: `${date}_${this.instanceId}`, date, instanceId: this.instanceId, startedAt: now, updatedAt: now,
      requests: 0, reads: 0, writes: 0, queries: 0, aggregations: 0,
      unattributed: { reads: 0, writes: 0 }, monitoringWrites: 0, routes: [], caches: [], heavyRequests: [],
    };
  }

  /** Express middleware: one counting context per API request. */
  middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!this.enabled) return next();
    const ctx: RequestCtx = { reads: 0, writes: 0, queries: 0, aggregations: 0, txDepth: 0 };
    res.on('finish', () => this.finishRequest(req, ctx));
    this.als.run(ctx, next);
  };

  private finishRequest(req: Request, ctx: RequestCtx) {
    this.rollDay();
    const pattern = (req as Request & { route?: { path?: string } }).route?.path;
    const route = `${req.method} ${pattern ? String(pattern).slice(0, 120) : normalisePath(req.originalUrl ?? req.url)}`;
    const r = this.routes.get(route) ?? { route, workflow: workflowOf(route), requests: 0, reads: 0, writes: 0, queries: 0, maxReads: 0 };
    r.requests++;
    r.reads += ctx.reads;
    r.writes += ctx.writes;
    r.queries += ctx.queries;
    r.maxReads = Math.max(r.maxReads, ctx.reads);
    this.routes.set(route, r);
    this.day.requests++;
    if (ctx.reads >= HEAVY_REQUEST_READS) {
      this.day.heavyRequests = [...this.day.heavyRequests, { route, reads: ctx.reads, writes: ctx.writes, at: new Date().toISOString() }].slice(-20);
      this.logger.warn(`Heavy request: ${route} used ${ctx.reads} reads, ${ctx.writes} writes`);
    }
    if (ctx.reads || ctx.writes) this.dirty = true;
    if (Date.now() - this.lastFlush >= FLUSH_MS) void this.flush();
  }

  private rollDay() {
    const today = quotaDay();
    if (today === this.day.date) return;
    void this.flush(); // save the finished day first (uses the current state)
    this.day = this.emptyDay(today);
    this.routes = new Map();
    this.caches = new Map();
  }

  private addRead(n: number, kind: 'doc' | 'query' | 'aggregation') {
    if (!this.enabled) return;
    const ctx = this.als.getStore();
    this.day.reads += n;
    if (kind === 'query') this.day.queries++;
    if (kind === 'aggregation') this.day.aggregations++;
    if (ctx) {
      ctx.reads += n;
      if (kind !== 'doc') ctx.queries++;
      if (kind === 'aggregation') ctx.aggregations++;
    } else this.day.unattributed.reads += n;
  }

  private addWrite() {
    if (!this.enabled) return;
    const ctx = this.als.getStore();
    this.day.writes++;
    if (ctx) ctx.writes++;
    else this.day.unattributed.writes++;
  }

  /** Server-side caches report here (no database access). */
  cache(name: string, hit: boolean) {
    if (!this.enabled) return;
    const c = this.caches.get(name) ?? { hits: 0, misses: 0 };
    if (hit) c.hits++;
    else c.misses++;
    this.caches.set(name, c);
  }

  /** Current totals of this process (not yet saved). */
  snapshot(): UsageDayDoc {
    return {
      ...this.day,
      updatedAt: new Date().toISOString(),
      routes: [...this.routes.values()],
      caches: [...this.caches].map(([name, c]) => ({ name, ...c })),
    };
  }

  /** Saves this process's totals for the day (one write, no read). Never throws. */
  async flush(): Promise<void> {
    if (!this.enabled || !this.raw || this.flushing || !this.dirty) return;
    this.flushing = true;
    this.lastFlush = Date.now();
    try {
      this.day.monitoringWrites++;
      const doc = this.snapshot();
      await this.raw.set(USAGE_COLLECTION, doc.id, doc);
      this.dirty = false;
    } catch (err) {
      this.logger.warn(`Could not save usage statistics: ${(err as Error).message.split('\n')[0]}`);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Wraps the data store so every operation is counted as Firestore bills it:
   * get = 1 read (also when missing); query = 1 per document returned (+1 for the extra
   * "has more" document, +1 for a cursor document), minimum 1; count/sum = 1 per 1,000
   * index entries, minimum 1 (sum is counted as 1 — its entries are not known without a
   * further query); create/set/update/delete = 1 write.
   */
  instrument(store: DataStore): DataStore {
    if (!this.enabled) return store;
    const s = store as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const orig = Object.fromEntries(['get', 'query', 'count', 'sum', 'create', 'set', 'update', 'delete', 'transaction'].map((k) => [k, s[k].bind(store)]));
    this.raw = { set: orig.set as DataStore['set'], kind: store.kind };
    // The in-memory store implements transaction reads with its own get/query: do not count them twice.
    const nested = () => store.kind === 'memory' && (this.als.getStore()?.txDepth ?? 0) > 0;
    s.get = async (...a) => {
      if (!nested()) this.addRead(1, 'doc');
      return orig.get(...a);
    };
    s.query = async (...a) => {
      const res = (await orig.query(...a)) as { items: unknown[]; nextCursor: string | null };
      const o = (a[1] ?? {}) as QueryOptions;
      if (!nested()) this.addRead(Math.max(1, res.items.length + (res.nextCursor ? 1 : 0)) + (o.cursor ? 1 : 0), 'query');
      return res;
    };
    s.count = async (...a) => {
      const n = (await orig.count(...a)) as number;
      if (!nested()) this.addRead(Math.max(1, Math.ceil(n / 1000)), 'aggregation');
      return n;
    };
    s.sum = async (...a) => {
      if (!nested()) this.addRead(1, 'aggregation');
      return orig.sum(...a);
    };
    for (const k of ['create', 'set', 'update', 'delete'])
      s[k] = async (...a) => {
        if (!nested()) this.addWrite();
        return orig[k](...a);
      };
    s.transaction = async (fn) => {
      const ctx = this.als.getStore();
      if (ctx) ctx.txDepth++;
      try {
        return await orig.transaction(async (tx: TransactionContext) =>
          (fn as (t: TransactionContext) => Promise<unknown>)({
            get: async (c, id) => {
              this.addRead(1, 'doc');
              return tx.get(c, id);
            },
            query: async (c, o) => {
              const r = await tx.query(c, o);
              this.addRead(Math.max(1, r.length), 'query');
              return r;
            },
            create: (c, id, d) => { this.addWrite(); tx.create(c, id, d); },
            set: (c, id, d) => { this.addWrite(); tx.set(c, id, d); },
            update: (c, id, d) => { this.addWrite(); tx.update(c, id, d); },
          } as TransactionContext),
        );
      } finally {
        if (ctx) ctx.txDepth--;
      }
    };
    return store;
  }
}

export const USAGE_COLLECTION = 'usageStats';
export const usage = new UsageMonitor();
