/**
 * Measures Firestore document reads and writes per screen / action through the real HTTP
 * pipeline, counted the way Firestore bills them:
 *  - get: 1 read (also when the document does not exist);
 *  - query: 1 read per document returned (plus the extra "has more" document fetched for
 *    pagination, plus the cursor document), minimum 1 read even when nothing matches;
 *  - count/sum aggregation: 1 read per 1,000 matched index entries, minimum 1;
 *  - create/set/update/delete: 1 write (also inside transactions).
 * Run with E2E_DATA_BACKEND=firestore (npm run test:e2e:firestore) to use the Firestore
 * emulator; the counts are the same on the in-memory store because they are taken at the
 * DataStore boundary. Budgets below fail the build if a change makes these paths expensive.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setEnvForTesting } from '../src/config/env';
import { DataStore, type QueryOptions, type TransactionContext, type WhereClause } from '../src/database/data-store';

const USE_FIRESTORE = process.env.E2E_DATA_BACKEND === 'firestore';
if (USE_FIRESTORE && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Refusing to run against a non-emulator Firestore');
setEnvForTesting({ NODE_ENV: 'test', DATA_BACKEND: USE_FIRESTORE ? 'firestore' : 'memory', FIREBASE_PROJECT_ID: 'demo-jcl', AUTH_MODE: 'dev', SEED_DEMO_DATA: true, RATE_LIMIT_PER_MINUTE: 10_000 });

let app: INestApplication;
const meter = { reads: 0, writes: 0 };
const as = (uid: string) => ({ Authorization: `Bearer dev:${uid}` });
const [R, TECH, PATH, ADMIN, ACC] = ['dev-receptionist', 'dev-lab_technician', 'dev-pathologist', 'dev-super_admin', 'dev-accountant'];
const api = () => request(app.getHttpServer());
const results: Array<{ action: string; reads: number; writes: number }> = [];

async function cost(action: string, fn: () => Promise<unknown>) {
  const before = { ...meter };
  await fn();
  const c = { action, reads: meter.reads - before.reads, writes: meter.writes - before.writes };
  results.push(c);
  return c;
}

/** Wraps the app's DataStore so every operation is billed like Firestore bills it. */
function instrument(store: DataStore) {
  const s = store as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const orig = Object.fromEntries(['get', 'query', 'count', 'sum', 'create', 'set', 'update', 'delete', 'transaction'].map((k) => [k, s[k].bind(store)]));
  const entries = (c: string, where?: WhereClause[]) => orig.count(c, where) as Promise<number>; // not billed: helper only
  const queryReads = (n: number, o: QueryOptions = {}, more = false) => Math.max(1, n + (more ? 1 : 0)) + (o.cursor ? 1 : 0);
  s.get = async (...a) => { meter.reads++; return orig.get(...a); };
  s.query = async (c, o) => {
    const r = (await orig.query(c, o)) as { items: unknown[]; nextCursor: string | null };
    meter.reads += queryReads(r.items.length, o as QueryOptions, !!r.nextCursor);
    return r;
  };
  s.count = async (c, w) => { const n = (await orig.count(c, w)) as number; meter.reads += Math.max(1, Math.ceil(n / 1000)); return n; };
  s.sum = async (c, f, w) => { meter.reads += Math.max(1, Math.ceil((await entries(c as string, w as WhereClause[])) / 1000)); return orig.sum(c, f, w); };
  for (const k of ['create', 'set', 'update', 'delete']) s[k] = async (...a) => { meter.writes++; return orig[k](...a); };
  s.transaction = async (fn) =>
    orig.transaction(async (tx: TransactionContext) =>
      (fn as (t: TransactionContext) => Promise<unknown>)({
        get: async (c, id) => { meter.reads++; return tx.get(c, id); },
        query: async (c, o) => { const r = await tx.query(c, o); meter.reads += Math.max(1, r.length); return r; },
        create: (c, id, d) => { meter.writes++; tx.create(c, id, d); },
        set: (c, id, d) => { meter.writes++; tx.set(c, id, d); },
        update: (c, id, d) => { meter.writes++; tx.update(c, id, d); },
      } as TransactionContext),
    );
}

beforeAll(async () => {
  if (USE_FIRESTORE) await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-jcl/databases/(default)/documents`, { method: 'DELETE' });
  const { createApp } = await import('../src/bootstrap');
  app = await createApp({ logger: false });
  await app.init();
  instrument(app.get(DataStore));
});

afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`Firestore cost per action (${USE_FIRESTORE ? 'Firestore emulator' : 'memory store'}):\n` + results.map((r) => `${r.action.padEnd(58)} reads ${String(r.reads).padStart(4)}   writes ${String(r.writes).padStart(3)}`).join('\n'));
  await app?.close();
});

/** One complete patient visit: register → order 2 tests → samples → results → verify → report → pay. */
async function patientVisit(i: number, steps = false) {
  const step = (name: string, fn: () => Promise<unknown>) => (steps ? cost(`  · ${name}`, fn) : fn());
  let p: { id: string } = { id: '' };
  let o: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  await step('register patient', async () => { p = (await api().post('/api/v1/patients').set(as(R)).send({ name: `Cost Patient ${String.fromCharCode(65 + i)}`, gender: i % 2 ? 'male' : 'female', ageYears: 30 + i, mobile: `0321${String(7000000 + i)}` }).expect(201)).body.data; });
  await step('create order (2 tests)', async () => { o = (await api().post('/api/v1/orders').set(as(R)).send({ patientId: p.id, testIds: ['test-cbc', 'test-fbs'] }).expect(201)).body.data; });
  await step('collect + receive + accept 2 samples', async () => {
    for (const sid of new Set<string>(o.items.map((x: { sampleId: string }) => x.sampleId)))
      for (const st of ['collect', 'receive', 'accept']) await api().post(`/api/v1/samples/${sid}/${st}`).set(as(TECH)).send({}).expect(201);
  });
  const fbs = o.items.find((x: { testCode: string }) => x.testCode === 'FBS');
  const cbc = o.items.find((x: { testCode: string }) => x.testCode === 'CBC');
  await step('enter + submit 2 results', async () => {
  await api().put(`/api/v1/results/${fbs.resultId}/values`).set(as(TECH)).send({ values: [{ parameterId: 'glu', value: '95' }], submit: true }).expect(200);
  await api().put(`/api/v1/results/${cbc.resultId}/values`).set(as(TECH)).send({ values: ['hb', 'wbc', 'rbc', 'hct', 'plt'].map((parameterId) => ({ parameterId, value: '10' })), submit: true }).expect(200);
  });
  await step('approve 2 results', async () => { for (const rid of [fbs.resultId, cbc.resultId]) await api().post(`/api/v1/results/${rid}/approve`).set(as(PATH)).send({}).expect(201); });
  await step('generate report', () => api().post(`/api/v1/reports/orders/${o.id}`).set(as(PATH)).expect(201));
  await step('take payment', () => api().post(`/api/v1/billing/orders/${o.id}/payments`).set({ ...as(ACC), 'Idempotency-Key': `cost-pay-${i}-0001` }).send({ amount: o.billing.balance, method: 'cash' }).expect(201));
}

describe('read and write cost of common actions', () => {
  it('measures and stays within budget', async () => {
    await api().get('/api/v1/auth/me').set(as(ADMIN)).expect(200); // warm role cache
    for (const [id, price] of [['test-cbc', 1200], ['test-fbs', 300]] as const) await api().patch(`/api/v1/tests/${id}`).set(as(ADMIN)).send({ price }).expect(200);
    for (let i = 0; i < 3; i++) await patientVisit(i); // some history and notifications

    const visit = await cost('Complete patient visit (2 tests, register → paid report)', () => patientVisit(3, true));
    const me = await cost('Any authenticated request (GET /auth/me)', () => api().get('/api/v1/auth/me').set(as(ADMIN)).expect(200));

    const full = await cost('Bell: full list (first load / bell opened)', () => api().get('/api/v1/notifications').set(as(ADMIN)).expect(200));
    const fullAgain = await cost('Bell: full list again within 50 s (same server)', () => api().get('/api/v1/notifications').set(as(PATH)).expect(200));
    const cursor = (await api().get('/api/v1/notifications').set(as(ADMIN))).body.data.cursor as string;
    expect(cursor).toBeTruthy();
    const poll = await cost('Bell: 2-minute poll, nothing new', () => api().get('/api/v1/notifications').query({ after: cursor }).set(as(ADMIN)).expect(200));
    const pollR = await cost('Bell: 2-minute poll, nothing new (reception)', () => api().get('/api/v1/notifications').query({ after: cursor }).set(as(R)).expect(200));
    await patientVisit(4); // creates new notifications
    const pollNew = await cost('Bell: poll after one more patient visit', async () => {
      const res = await api().get('/api/v1/notifications').query({ after: cursor }).set(as(ADMIN)).expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    const dashCold = await cost('Dashboard, first open (all sections)', () => api().get('/api/v1/analytics/dashboard').set(as(ADMIN)).expect(200));
    const dashWarm = await cost('Dashboard, opened again', () => api().get('/api/v1/analytics/dashboard').set(as(ADMIN)).expect(200));

    const testsWarm = await cost('Test catalogue list (unchanged catalogue)', () => api().get('/api/v1/tests').set(as(ADMIN)).expect(200));
    const edit = await cost('Edit one test (price)', () => api().patch('/api/v1/tests/test-cbc').set(as(ADMIN)).send({ price: 1300 }).expect(200));
    const testsAfter = await cost('Test catalogue list after the edit (same server)', async () => {
      const list = (await api().get('/api/v1/tests').set(as(ADMIN)).expect(200)).body.data as Array<{ id: string; price: number }>;
      expect(list.find((t) => t.id === 'test-cbc')!.price).toBe(1300);
    });
    const queue = await cost('Verification queue refresh (nothing pending)', () => api().get('/api/v1/results').query({ status: 'submitted', limit: 100 }).set(as(PATH)).expect(200));
    const h1 = await cost('Public /health/database', () => api().get('/health/database').expect(200));
    const h2 = await cost('Public /health/database again within 30 s', () => api().get('/health/database').expect(200));

    // Register & bill page: catalogue, letterhead settings and the doctor list.
    const registerData = () => Promise.all([
      api().get('/api/v1/tests/catalog').set(as(R)).expect(200),
      api().get('/api/v1/settings/reference').set(as(R)).expect(200),
      api().get('/api/v1/doctors').query({ status: 'active', limit: 100 }).set(as(R)).expect(200),
    ]);
    const reg1 = await cost('Register & bill page data (first load)', registerData);
    const reg2 = await cost('Register & bill page data (next patient)', registerData);
    await api().post('/api/v1/doctors').set(as(ADMIN)).send({ name: 'Dr Cache Check', specialization: 'Medicine' }).expect(201);
    const reg3 = await cost('Register & bill page data after adding a doctor', async () => {
      const [, , docs] = await registerData();
      expect((docs.body.data.items as Array<{ name: string }>).some((d) => d.name === 'Dr Cache Check')).toBe(true); // new doctor visible at once
    });
    const report2 = await cost('Another complete patient visit (warm server)', async () => {
      await patientVisit(5);
    });

    // Budgets: fail the build when a change makes these paths expensive again.
    expect(me.reads).toBeLessThanOrEqual(1); // profile shared by the guard and /auth/me
    expect(poll.reads).toBeLessThanOrEqual(2);
    expect(pollR.reads).toBeLessThanOrEqual(2);
    expect(pollNew.reads).toBeLessThanOrEqual(15);
    expect(full.reads).toBeLessThanOrEqual(62);
    expect(fullAgain.reads).toBeLessThanOrEqual(1);
    expect(dashCold.reads).toBeLessThanOrEqual(80);
    expect(dashWarm.reads).toBeLessThanOrEqual(1); // same figures reused for 30 s
    expect(testsWarm.reads).toBeLessThanOrEqual(2);
    expect(testsAfter.reads).toBeLessThanOrEqual(2);
    expect(edit.writes).toBeLessThanOrEqual(4);
    expect(queue.reads).toBeLessThanOrEqual(2);
    expect(h2.writes).toBe(0);
    expect(h1.writes).toBe(1);
    expect(visit.reads).toBeLessThan(400);
    expect(reg2.reads).toBeLessThanOrEqual(3);
    expect(reg3.reads).toBeLessThan(reg1.reads + 2);
    expect(report2.reads).toBeLessThan(400);
  });
});
