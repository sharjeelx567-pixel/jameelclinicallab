import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { quotaDay, usage, USAGE_COLLECTION, type UsageDayDoc } from '../../common/usage-monitor';
import { C } from '../../database/data-store';
import { MemoryDataStore } from '../../database/memory-data-store';
import { UsageService } from './usage.module';

/** Runs `work` as if it were an API request to `route`, through the monitor's middleware. */
async function request(method: string, route: string, url: string, work: () => Promise<unknown>) {
  const res = new EventEmitter() as unknown as Response;
  const req = { method, originalUrl: url, url, route: { path: route } } as unknown as Request;
  await new Promise<void>((done) => usage.middleware(req, res, (async () => { await work(); done(); }) as unknown as NextFunction));
  (res as unknown as EventEmitter).emit('finish');
}

describe('usage monitor', () => {
  it('counts per route and workflow, saves without reading, and reports with anomalies', async () => {
    const store = usage.instrument(new MemoryDataStore());
    await store.create(C.patients, 'p1', { id: 'p1', name: 'Secret Name' });
    for (let i = 0; i < 12; i++) await request('POST', '/api/v1/samples/:id/collect', '/api/v1/samples/abcdefghijklmnopqrst/collect', () => store.get(C.patients, 'p1'));

    const snap = usage.snapshot();
    const r = snap.routes.find((x) => x.route === 'POST /api/v1/samples/:id/collect')!;
    expect(r).toMatchObject({ workflow: 'sample_processing', requests: 12, reads: 12 });
    expect(JSON.stringify(snap)).not.toMatch(/abcdefghijklmnopqrst|Secret Name/);

    // Saving: one write, no read.
    const spy = jest.spyOn(store, 'get');
    await usage.flush();
    expect(spy).not.toHaveBeenCalled();
    const saved = await store.get<UsageDayDoc>(USAGE_COLLECTION, `${quotaDay()}_${usage.instanceId}`);
    expect(saved?.reads).toBeGreaterThanOrEqual(12);

    // An earlier day with 1 read per collect → today's average of 5 per collect is flagged.
    const yesterday = new Date(Date.parse(`${quotaDay()}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await store.set(USAGE_COLLECTION, `${yesterday}_old`, {
      ...saved!, id: `${yesterday}_old`, date: yesterday, instanceId: 'old', reads: 20, requests: 20,
      routes: [{ route: 'POST /api/v1/samples/:id/collect', workflow: 'sample_processing', requests: 20, reads: 20, writes: 0, queries: 0, maxReads: 1 }],
      heavyRequests: [], caches: [],
    });
    for (let i = 0; i < 12; i++)
      await request('POST', '/api/v1/samples/:id/collect', '/x', async () => {
        for (let k = 0; k < 9; k++) await store.get(C.patients, 'p1'); // 9 reads per request instead of 1
      });
    const rep = await new UsageService(store).report(7);
    expect(rep.days).toHaveLength(7);
    expect(rep.days.find((d) => d.date === yesterday)?.reads).toBe(20);
    expect(rep.today.workflows.find((w) => w.name === 'sample_processing')?.requests).toBe(24);
    expect(rep.anomalies.some((a) => a.message.includes('POST /api/v1/samples/:id/collect'))).toBe(true);
  });
});
