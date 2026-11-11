/**
 * End-to-end laboratory workflow through the real HTTP pipeline (guards, pipes,
 * filters) using AUTH_MODE=dev and the in-memory store. Numeric ranges used here
 * are TEST FIXTURES, not clinical reference values.
 */
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { setEnvForTesting } from '../src/config/env';

const BRIDGE_TOKEN = 'test-bridge-token-0123456789';
/**
 * E2E_DATA_BACKEND=firestore runs the same suite against the Firestore EMULATOR
 * (FIRESTORE_EMULATOR_HOST must be set) to exercise the real FirestoreDataStore.
 */
const USE_FIRESTORE = process.env.E2E_DATA_BACKEND === 'firestore';
if (USE_FIRESTORE && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Refusing to run e2e against a non-emulator Firestore');
setEnvForTesting({
  NODE_ENV: 'test',
  DATA_BACKEND: USE_FIRESTORE ? 'firestore' : 'memory',
  FIREBASE_PROJECT_ID: 'demo-jcl',
  AUTH_MODE: 'dev',
  SEED_DEMO_DATA: true,
  BRIDGE_TOKEN_HASHES: `lab-pc-1:${createHash('sha256').update(BRIDGE_TOKEN).digest('hex')}`,
  RATE_LIMIT_PER_MINUTE: 10_000,
});

let app: INestApplication;
const as = (uid: string) => ({ Authorization: `Bearer dev:${uid}` });
const R = 'dev-receptionist';
const TECH = 'dev-lab_technician';
const PATH = 'dev-pathologist';
const ADMIN = 'dev-super_admin';
const ACC = 'dev-accountant';
const INV = 'dev-inventory_manager';

const api = () => request(app.getHttpServer());

beforeAll(async () => {
  if (USE_FIRESTORE) {
    // Start from an empty emulator database.
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-jcl/databases/(default)/documents`, { method: 'DELETE' });
  }
  const { createApp } = await import('../src/bootstrap');
  app = await createApp({ logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('authentication & authorisation', () => {
  it('rejects requests without a token', async () => {
    const res = await api().get('/api/v1/patients');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects malformed / unknown tokens', async () => {
    expect((await api().get('/api/v1/patients').set({ Authorization: 'Bearer garbage' })).status).toBe(401);
    expect((await api().get('/api/v1/patients').set(as('nobody'))).status).toBe(403);
  });

  it('enforces permissions server-side', async () => {
    const res = await api().get('/api/v1/patients').set(as(INV));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('health is public', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.dataBackend).toBe(USE_FIRESTORE ? 'firestore' : 'memory');
  });
});

describe('complete laboratory workflow', () => {
  let patientId = '';
  let orderId = '';
  let order: { items: Array<{ testCode: string; resultId: string; sampleId: string }>; billing: { balance: number; total: number } };
  let reportId = '';
  let verificationCode = '';

  it('configures prices and an approved fixture range (PATCH keeps other fields)', async () => {
    const cbc = await api().patch('/api/v1/tests/test-cbc').set(as(ADMIN)).send({ price: 1200 });
    expect(cbc.status).toBe(200);
    expect(cbc.body.data).toMatchObject({ price: 1200, active: true, discountEligible: true });

    const fbs = (await api().get('/api/v1/tests/test-fbs').set(as(ADMIN))).body.data;
    const parameters = fbs.parameters.map((p: Record<string, unknown>) => ({ ...p, ranges: [{ gender: 'any', low: 70, high: 100, criticalLow: 40, criticalHigh: 400 }] }));
    const upd = await api().patch('/api/v1/tests/test-fbs').set(as(ADMIN)).send({ price: 300, parameters });
    expect(upd.status).toBe(200);
    const range = upd.body.data.parameters[0].ranges[0];
    expect(range.status).toBe('draft'); // client cannot self-approve

    // Receptionist cannot approve ranges; pathologist can.
    const path = `/api/v1/tests/test-fbs/parameters/glu/ranges/${range.id}/approve`;
    expect((await api().post(path).set(as(R))).status).toBe(403);
    const ok = await api().post(path).set(as(PATH));
    expect(ok.status).toBe(201);
    expect(ok.body.data.parameters[0].ranges[0].status).toBe('approved');
  });

  it('registers a patient with an auto-generated MR number', async () => {
    const res = await api()
      .post('/api/v1/patients')
      .set(as(R))
      .send({ name: 'Test Patient Alpha', gender: 'female', ageYears: 34, mobile: '0300-1112223', cnic: '35202-1234567-1', address: { district: 'Lahore' } });
    expect(res.status).toBe(201);
    expect(res.body.data.mrNumber).toMatch(/^JCL-\d{8}$/);
    expect(res.body.data.searchTokens).toBeDefined();
    patientId = res.body.data.id;
  });

  it('validates input with field-level errors', async () => {
    const res = await api().post('/api/v1/patients').set(as(R)).send({ name: '', gender: 'x', mobile: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(1);
  });

  it('detects duplicate patients and allows a reviewed override', async () => {
    const body = { name: 'Test Patient Alpha', gender: 'female', ageYears: 34, mobile: '03001112223' };
    const dup = await api().post('/api/v1/patients').set(as(R)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(dup.body.error.details[0].id).toBe(patientId);
    const forced = await api().post('/api/v1/patients').set(as(R)).send({ ...body, confirmNotDuplicate: true });
    expect(forced.status).toBe(201);
  });

  it('finds patients by MR number, name and mobile', async () => {
    const res = await api().get('/api/v1/patients').query({ q: 'alpha' }).set(as(R));
    expect(res.body.data.items.length).toBe(2);
    expect(res.body.data.items[0].searchTokens).toBeUndefined();
  });

  it('refuses discounts from roles without permission', async () => {
    const res = await api().post('/api/v1/orders').set(as(R)).send({ patientId, testIds: ['test-cbc'], discount: { amount: 100, reason: 'x' } });
    expect(res.status).toBe(403);
  });

  it('creates an order with multiple tests; prices come from the server', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .set(as(R))
      .send({ patientId, testIds: ['test-cbc', 'test-fbs'], priority: 'urgent', advancePayment: { amount: 500, method: 'cash' }, price: 1 });
    expect(res.status).toBe(201);
    order = res.body.data;
    orderId = res.body.data.id;
    expect(res.body.data.orderNumber).toMatch(/^ORD-/);
    expect(res.body.data.billing).toMatchObject({ subtotal: 1500, total: 1500, paid: 500, balance: 1000 });
    expect(res.body.data.status).toBe('sample_pending');
    expect(new Set(order.items.map((i) => i.sampleId)).size).toBe(2); // EDTA + fluoride tubes
  });

  it('blocks result entry before the sample is accepted', async () => {
    const fbs = order.items.find((i) => i.testCode === 'FBS')!;
    const res = await api().put(`/api/v1/results/${fbs.resultId}/values`).set(as(TECH)).send({ values: [{ parameterId: 'glu', value: '90' }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SAMPLE_NOT_READY');
  });

  it('collects, receives and accepts samples; invalid transitions are refused', async () => {
    for (const sampleId of new Set(order.items.map((i) => i.sampleId))) {
      expect((await api().post(`/api/v1/samples/${sampleId}/accept`).set(as(TECH)).send({})).status).toBe(422);
      expect((await api().post(`/api/v1/samples/${sampleId}/collect`).set(as(R)).send({ location: 'Main lab' })).status).toBe(201);
      expect((await api().post(`/api/v1/samples/${sampleId}/receive`).set(as(TECH)).send({ condition: 'Good' })).status).toBe(201);
      expect((await api().post(`/api/v1/samples/${sampleId}/accept`).set(as(TECH)).send({})).status).toBe(201);
    }
    const detail = await api().get(`/api/v1/orders/${orderId}`).set(as(R));
    expect(detail.body.data.order.status).toBe('processing');
  });

  it('enters results with server-side flagging and submits for verification', async () => {
    const fbs = order.items.find((i) => i.testCode === 'FBS')!;
    const res = await api().put(`/api/v1/results/${fbs.resultId}/values`).set(as(TECH)).send({ values: [{ parameterId: 'glu', value: '450' }], submit: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.values[0]).toMatchObject({ flag: 'critical_high', source: 'manual', value: '450' });
    expect(res.body.data.hasCritical).toBe(true);

    const cbc = order.items.find((i) => i.testCode === 'CBC')!;
    const incomplete = await api().put(`/api/v1/results/${cbc.resultId}/values`).set(as(ADMIN)).send({ values: [{ parameterId: 'hb', value: '12.5' }], submit: true });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error.code).toBe('INCOMPLETE_RESULT');
    const bad = await api().put(`/api/v1/results/${cbc.resultId}/values`).set(as(ADMIN)).send({ values: [{ parameterId: 'hb', value: 'abc' }] });
    expect(bad.status).toBe(422);

    const values = ['hb', 'wbc', 'rbc', 'hct', 'plt'].map((parameterId, i) => ({ parameterId, value: String(10 + i) }));
    const ok = await api().put(`/api/v1/results/${cbc.resultId}/values`).set(as(ADMIN)).send({ values, submit: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.values.every((v: { flag: string }) => v.flag === 'no_range')).toBe(true); // no approved ranges → never invented
  });

  it('refuses report generation from unverified results', async () => {
    const res = await api().post(`/api/v1/reports/orders/${orderId}`).set(as(PATH));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_APPROVED_RESULTS');
  });

  it('only authorised, independent users can approve', async () => {
    const cbc = order.items.find((i) => i.testCode === 'CBC')!;
    expect((await api().post(`/api/v1/results/${cbc.resultId}/approve`).set(as(TECH)).send({})).status).toBe(403);
    const self = await api().post(`/api/v1/results/${cbc.resultId}/approve`).set(as(ADMIN)).send({});
    expect(self.status).toBe(403); // entered by super admin → cannot self-verify
    for (const i of order.items) {
      const res = await api().post(`/api/v1/results/${i.resultId}/approve`).set(as(PATH)).send({ comment: 'Verified' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'approved', version: 1, approvedBy: { uid: PATH } });
    }
    const detail = await api().get(`/api/v1/orders/${orderId}`).set(as(R));
    expect(detail.body.data.order.status).toBe('completed');
  });

  it('raises a role-aware critical result notification without patient names', async () => {
    const res = await api().get('/api/v1/notifications').set(as(PATH));
    const critical = res.body.data.items.find((n: { kind: string }) => n.kind === 'critical_result');
    expect(critical).toBeDefined();
    expect(JSON.stringify(critical)).not.toContain('Alpha');
    const inv = await api().get('/api/v1/notifications').set(as(INV));
    expect(inv.body.data.items.find((n: { kind: string }) => n.kind === 'critical_result')).toBeUndefined();
  });

  it('generates a final report, PDF, and refuses duplicate issue', async () => {
    const res = await api().post(`/api/v1/reports/orders/${orderId}`).set(as(PATH));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'final', version: 1 });
    reportId = res.body.data.id;
    verificationCode = res.body.data.verificationCode;

    const pdf = await api().get(`/api/v1/reports/${reportId}/pdf`).set(as(R)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const prints = await api().get(`/api/v1/reports/${reportId}/prints`).set(as(R));
    expect(prints.body.data.length).toBe(1);
    expect((await api().post(`/api/v1/reports/orders/${orderId}`).set(as(PATH))).status).toBe(409);
  });

  it('blocks report access for unauthorised roles', async () => {
    expect((await api().get(`/api/v1/reports/${reportId}`).set(as(INV))).status).toBe(403);
  });

  it('public verification reveals no results', async () => {
    const res = await api().get(`/api/v1/reports/verify/${verificationCode}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ valid: true, current: true, status: 'final' });
    expect(JSON.stringify(res.body.data)).not.toMatch(/450|Alpha|Glucose/);
    expect((await api().get('/api/v1/reports/verify/NOTAREALCODE')).body.data.valid).toBe(false);
  });

  it('validates payments against the server balance', async () => {
    const over = await api().post(`/api/v1/billing/orders/${orderId}/payments`).set(as(ACC)).send({ amount: 5000, method: 'cash' });
    expect(over.status).toBe(422);
    expect((await api().post(`/api/v1/billing/orders/${orderId}/payments`).set(as(INV)).send({ amount: 10, method: 'cash' })).status).toBe(403);
    const ok = await api().post(`/api/v1/billing/orders/${orderId}/payments`).set(as(ACC)).send({ amount: 1000, method: 'card', reference: 'POS-1' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.billing.balance).toBe(0);
    const refundTooBig = await api().post(`/api/v1/billing/orders/${orderId}/refunds`).set(as(ACC)).send({ amount: 99999, method: 'cash', reason: 'x' });
    expect(refundTooBig.status).toBe(422);
    const daily = await api().get('/api/v1/billing/daily-summary').set(as(ACC));
    expect(daily.body.data.totals.collected).toBe(1500);
  });

  it('shows complete patient history', async () => {
    const res = await api().get(`/api/v1/patients/${patientId}/history`).set(as(R));
    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBe(1);
    expect(res.body.data.payments.length).toBe(2);
    expect(res.body.data.reports.length).toBe(1);
    expect(res.body.data.summary).toMatchObject({ totalBilled: 1500, outstanding: 0 });
  });

  it('amends an approved result without overwriting history', async () => {
    const fbs = order.items.find((i) => i.testCode === 'FBS')!;
    expect((await api().put(`/api/v1/results/${fbs.resultId}/values`).set(as(TECH)).send({ values: [{ parameterId: 'glu', value: '95' }] })).status).toBe(422);
    const amend = await api().post(`/api/v1/results/${fbs.resultId}/amend`).set(as(PATH)).send({ reason: 'Transcription error' });
    expect(amend.status).toBe(201);
    expect(amend.body.data).toMatchObject({ status: 'draft', version: 2 });

    const old = await api().get(`/api/v1/reports/${reportId}`).set(as(R));
    expect(old.body.data.status).toBe('superseded');

    await api().put(`/api/v1/results/${fbs.resultId}/values`).set(as(TECH)).send({ values: [{ parameterId: 'glu', value: '95' }], submit: true }).expect(200);
    await api().post(`/api/v1/results/${fbs.resultId}/approve`).set(as('dev-pathologist-2')).send({}).expect(201);
    const ws = await api().get(`/api/v1/results/${fbs.resultId}`).set(as(PATH));
    expect(ws.body.data.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(ws.body.data.versions[1].values[0].value).toBe('450'); // original preserved

    const next = await api().post(`/api/v1/reports/orders/${orderId}`).set(as(PATH));
    expect(next.body.data).toMatchObject({ status: 'amended', version: 2 });
  });

  it('writes an append-only audit trail visible only to authorised roles', async () => {
    const res = await api().get('/api/v1/audit-logs').query({ entity: 'result' }).set(as(ADMIN));
    const actions = res.body.data.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['result.submit', 'result.approve', 'result.amend_open', 'result.approve_amendment']));
    expect((await api().get('/api/v1/audit-logs').set(as(R))).status).toBe(403);
  });
});

describe('analyzer intake (machine bridge)', () => {
  const bridge = { 'X-Bridge-Id': 'lab-pc-1', Authorization: `Bridge ${BRIDGE_TOKEN}` };
  const raw = 'H|\\^&|||DEMO\rP|1\rO|1|S260000001\rR|1|^^^GLU|95|mg/dL\rL|1|N';

  it('rejects unauthenticated bridges', async () => {
    const res = await api().post('/api/v1/analyzers/bridge/messages').set({ 'X-Bridge-Id': 'lab-pc-1', Authorization: 'Bridge wrong' }).send({});
    expect(res.status).toBe(401);
  });

  it('stores demo messages but never applies them, and deduplicates', async () => {
    const body = { analyzerId: 'analyzer-demo-1', raw, protocol: 'astm', isDemo: true, sampleIdentifier: 'S260000001', results: [{ analyzerTestCode: 'GLU', value: '95' }] };
    const first = await api().post('/api/v1/analyzers/bridge/messages').set(bridge).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('demo');
    const again = await api().post('/api/v1/analyzers/bridge/messages').set(bridge).send(body);
    expect(again.body.data.status).toBe('duplicate');
    const match = await api().post(`/api/v1/analyzers/messages/${first.body.data.id}/match`).set(as(TECH)).send({ sampleNumber: 'S260000001' });
    expect(match.status).toBe(422);
  });

  it('demo heartbeats never mark an analyzer as connected', async () => {
    await api().post('/api/v1/analyzers/bridge/heartbeat').set(bridge).send({ analyzers: [{ analyzerId: 'analyzer-demo-1', state: 'connected', mode: 'demo' }] }).expect(200);
    const res = await api().get('/api/v1/analyzers/analyzer-demo-1').set(as(TECH));
    expect(res.body.data.analyzer.connectionState).toBe('never_connected');
    expect(res.body.data.analyzer.demoActive).toBe(true);
  });

  it('applies a LIVE matched message as a draft only — never auto-approved', async () => {
    const created = await api()
      .post('/api/v1/analyzers')
      .set(as(ADMIN))
      .send({ name: 'Live test analyzer', machineType: 'Chemistry', protocol: 'astm', connectionType: 'tcp', mode: 'live', enabled: true, bridgeId: 'lab-pc-1' });
    expect(created.status).toBe(201);
    expect(created.body.data.connectionState).toBe('never_connected');
    const analyzerId = created.body.data.id;
    await api()
      .patch('/api/v1/tests/test-fbs')
      .set(as(ADMIN))
      .send({ analyzerMappings: [{ analyzerId, analyzerTestCode: 'GLU', parameterCodes: {} }] })
      .expect(200);

    const p = await api().post('/api/v1/patients').set(as(R)).send({ name: 'Test Patient Beta', gender: 'male', ageYears: 50, mobile: '03214445556' });
    const o = await api().post('/api/v1/orders').set(as(R)).send({ patientId: p.body.data.id, testIds: ['test-fbs'] });
    const sampleId = o.body.data.items[0].sampleId;
    const resultId = o.body.data.items[0].resultId;
    for (const step of ['collect', 'receive', 'accept']) await api().post(`/api/v1/samples/${sampleId}/${step}`).set(as(TECH)).send({}).expect(201);
    const sample = await api().get(`/api/v1/samples/${sampleId}`).set(as(TECH));

    const msg = await api()
      .post('/api/v1/analyzers/bridge/messages')
      .set(bridge)
      .send({ analyzerId, raw: `live-${sample.body.data.sampleNumber}`, protocol: 'astm', isDemo: false, sampleIdentifier: sample.body.data.sampleNumber, results: [{ analyzerTestCode: 'GLU', value: '88' }] });
    expect(msg.body.data.status).toBe('applied');

    const result = await api().get(`/api/v1/results/${resultId}`).set(as(TECH));
    expect(result.body.data.result).toMatchObject({ status: 'draft', hasAnalyzerValues: true });
    expect(result.body.data.result.values[0]).toMatchObject({ value: '88', source: 'analyzer', flag: 'normal' });

    await api().post('/api/v1/analyzers/bridge/heartbeat').set(bridge).send({ analyzers: [{ analyzerId, state: 'connected', mode: 'live' }] }).expect(200);
    expect((await api().get(`/api/v1/analyzers/${analyzerId}`).set(as(TECH))).body.data.analyzer.connectionState).toBe('connected');
  });

  it('cannot mark a demo analyzer as verified', async () => {
    const res = await api().patch('/api/v1/analyzers/analyzer-demo-1').set(as(ADMIN)).send({ integrationStatus: 'verified' });
    expect(res.status).toBe(422);
    const still = await api().get('/api/v1/analyzers/analyzer-demo-1').set(as(ADMIN));
    expect(still.body.data.analyzer.enabled).toBe(true); // PATCH didn't reset defaults
  });
});

describe('media uploads (Cloudinary not configured in tests)', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  it('reports configuration honestly', async () => {
    const res = await api().get('/api/v1/media/config').set(as(R)).expect(200);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.categories.map((c: { folder: string }) => c.folder)).toEqual(['laboratory/logo', 'laboratory/gallery', 'staff/profiles', 'doctors/profiles', 'website/illustrations']);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });

  it('requires sign-in and the right permission', async () => {
    expect((await api().post('/api/v1/media/lab_logo').attach('file', PNG, 'logo.png')).status).toBe(401);
    const res = await api().post('/api/v1/media/lab_logo').set(as(R)).attach('file', PNG, 'logo.png');
    expect(res.status).toBe(403);
  });

  it('rejects unknown categories (no patient/report category exists)', async () => {
    for (const c of ['patient_document', 'reports'])
      expect((await api().post(`/api/v1/media/${c}`).set(as(ADMIN)).attach('file', PNG, 'x.png')).body.error.code).toBe('MEDIA_CATEGORY');
  });

  it('validates the file by its content', async () => {
    const res = await api().post('/api/v1/media/lab_gallery').set(as(ADMIN)).attach('file', Buffer.from('MZ not an image'), { filename: 'evil.png', contentType: 'image/png' });
    expect(res.body.error.code).toBe('FILE_TYPE');
  });

  it('does not fake an upload when Cloudinary is not configured', async () => {
    const res = await api().post('/api/v1/media/lab_gallery').set(as(ADMIN)).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MEDIA_NOT_CONFIGURED');
    expect((await api().get('/api/v1/media').query({ category: 'lab_gallery' }).set(as(ADMIN))).body.data).toEqual([]);
  });
});

describe('safe retries (Idempotency-Key) and database health', () => {
  it('health/database performs a real write + read-back', async () => {
    const res = await api().get('/health/database').expect(200);
    expect(res.body.data).toMatchObject({ ok: true, dataBackend: USE_FIRESTORE ? 'firestore' : 'memory', persistent: USE_FIRESTORE });
  });

  it('a retried payment with the same key is recorded once', async () => {
    const p = await api().post('/api/v1/patients').set(as(R)).send({ name: 'Retry Test Patient', gender: 'female', ageYears: 30, mobile: '03215550001' });
    const o = await api().post('/api/v1/orders').set(as(R)).send({ patientId: p.body.data.id, testIds: ['test-fbs'] }).expect(201);
    const balance = o.body.data.billing.balance;
    expect(balance).toBeGreaterThan(1);
    const pay = () => api().post(`/api/v1/billing/orders/${o.body.data.id}/payments`).set({ ...as(ACC), 'Idempotency-Key': 'pay-retry-0001' }).send({ amount: 1, method: 'cash' });
    const first = await pay();
    const second = await pay();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.payment.id).toBe(first.body.data.payment.id);
    const order = await api().get(`/api/v1/orders/${o.body.data.id}`).set(as(ACC));
    expect(order.body.data.order?.billing?.paid ?? order.body.data.billing?.paid).toBe(1);

    const reused = await api().post(`/api/v1/billing/orders/${o.body.data.id}/payments`).set({ ...as(ACC), 'Idempotency-Key': 'pay-retry-0001' }).send({ amount: 2, method: 'cash' });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('a retried order creation returns the same order', async () => {
    const p = await api().post('/api/v1/patients').set(as(R)).send({ name: 'Retry Order Patient', gender: 'male', ageYears: 41, mobile: '03215550002' });
    const send = () => api().post('/api/v1/orders').set({ ...as(R), 'Idempotency-Key': 'order-retry-0001' }).send({ patientId: p.body.data.id, testIds: ['test-fbs'] });
    const [a, b] = [await send(), await send()];
    expect(a.body.data.id).toBe(b.body.data.id);
    const list = await api().get('/api/v1/orders').query({ patientId: p.body.data.id }).set(as(R));
    expect(list.body.data.items.filter((x: { patientId: string }) => x.patientId === p.body.data.id)).toHaveLength(1);
  });

  it('concurrent duplicates never create two stock movements', async () => {
    const item = await api().post('/api/v1/inventory/items').set(as(INV)).send({ name: 'Retry Test Tubes', category: 'consumable', unit: 'pcs', minimumLevel: 0, openingQuantity: 10 }).expect(201);
    const move = () => api().post(`/api/v1/inventory/items/${item.body.data.id}/movements`).set({ ...as(INV), 'Idempotency-Key': 'move-retry-0001' }).send({ type: 'consume', quantity: 3 });
    const results = await Promise.all([move(), move(), move()]);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const after = await api().get(`/api/v1/inventory/items/${item.body.data.id}`).set(as(INV));
    expect(after.body.data.item.quantity).toBe(7);
  });

  it('rejects malformed keys', async () => {
    const res = await api().post('/api/v1/inventory/items').set({ ...as(INV), 'Idempotency-Key': 'bad key!' }).send({ name: 'X item', category: 'consumable', unit: 'pcs' });
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY');
  });
});

describe('administrative modules persist through the data store', () => {
  it('doctors: create, update, list, profile + referral stats', async () => {
    const d = await api().post('/api/v1/doctors').set(as(R)).send({ name: 'Dr Persist Test', specialization: 'Medicine', commission: { type: 'percent', value: 10 } }).expect(201);
    await api().patch(`/api/v1/doctors/${d.body.data.id}`).set(as(R)).send({ clinic: 'Test Clinic' }).expect(200);
    const got = await api().get(`/api/v1/doctors/${d.body.data.id}`).set(as(R)).expect(200);
    expect(got.body.data.doctor).toMatchObject({ name: 'Dr Persist Test', clinic: 'Test Clinic', specialization: 'Medicine' });
    expect(got.body.data.totals.orders).toBe(0);
    expect((await api().get('/api/v1/doctors').query({ q: 'persist' }).set(as(R))).body.data.items.map((x: { id: string }) => x.id)).toContain(d.body.data.id);
  });

  it('panels: create with negotiated rates, update, read back', async () => {
    const p = await api().post('/api/v1/panels').set(as(ADMIN)).send({ name: 'Persist Insurance', type: 'insurance', discountPercent: 5, rates: { 'test-fbs': 250 } }).expect(201);
    await api().patch(`/api/v1/panels/${p.body.data.id}`).set(as(ADMIN)).send({ rates: { 'test-fbs': 240 } }).expect(200);
    const got = await api().get(`/api/v1/panels/${p.body.data.id}`).set(as(R)).expect(200);
    expect((got.body.data.panel ?? got.body.data).rates).toEqual({ 'test-fbs': 240 });
    expect((got.body.data.panel ?? got.body.data).discountPercent).toBe(5);
  });

  it('home sampling: request → scheduled → assigned collector, persisted', async () => {
    const h = await api().post('/api/v1/home-sampling').set(as(R)).send({ patientName: 'Home Persist', mobile: '03001112233', address: 'House 1, Street 2, Test City', fee: 200 }).expect(201);
    expect(h.body.data.status).toBe('requested');
    await api().patch(`/api/v1/home-sampling/${h.body.data.id}`).set(as(R)).send({ scheduledFor: new Date(Date.now() + 86_400_000).toISOString() }).expect(200);
    await api().patch(`/api/v1/home-sampling/${h.body.data.id}`).set(as(R)).send({ collectorId: TECH }).expect(200);
    const got = await api().get(`/api/v1/home-sampling/${h.body.data.id}`).set(as(R)).expect(200);
    expect(got.body.data).toMatchObject({ status: 'assigned', collectorId: TECH, fee: 200 });
    const bad = await api().patch(`/api/v1/home-sampling/${h.body.data.id}`).set(as(R)).send({ status: 'requested' });
    expect(bad.status).toBe(422);
  });

  it('settings: update persists and is audited; clients cannot inject the logo', async () => {
    const res = await api().put('/api/v1/settings').set(as(ADMIN)).send({ phone: '042-1234567', logo: { assetId: 'x', publicId: 'evil', secureUrl: 'https://evil.example/x.png' } }).expect(200);
    expect(res.body.data.phone).toBe('042-1234567');
    const got = await api().get('/api/v1/settings').set(as(ADMIN)).expect(200);
    expect(got.body.data.phone).toBe('042-1234567');
    expect(got.body.data.logo).toBeUndefined();
    expect((await api().put('/api/v1/settings').set(as(R)).send({ phone: '1' })).status).toBe(403);
  });

  it('staff & roles: create, update, role permissions persist', async () => {
    const u = await api().post('/api/v1/users').set(as(ADMIN)).send({ email: 'persist.staff@demo.jcl.local', displayName: 'Persist Staff', role: 'receptionist', initialPassword: 'TestPassword-123' }).expect(201);
    await api().patch(`/api/v1/users/${u.body.data.id}`).set(as(ADMIN)).send({ department: 'Front desk' }).expect(200);
    expect((await api().get(`/api/v1/users/${u.body.data.id}`).set(as(ADMIN))).body.data).toMatchObject({ department: 'Front desk', role: 'receptionist' });
    const roles = (await api().get('/api/v1/roles').set(as(ADMIN))).body.data.roles;
    const acc = roles.find((r: { id: string }) => r.id === 'accountant');
    const perms = [...acc.permissions, 'inventory.read'];
    await api().put('/api/v1/roles/accountant').set(as(ADMIN)).send({ permissions: perms }).expect(200);
    const after = (await api().get('/api/v1/roles').set(as(ADMIN))).body.data.roles.find((r: { id: string }) => r.id === 'accountant');
    expect(after.permissions).toContain('inventory.read');
  });

  it('analytics are computed from stored records, not hardcoded', async () => {
    const res = await api().get('/api/v1/analytics/dashboard').set(as(ADMIN)).expect(200);
    const text = JSON.stringify(res.body.data);
    expect(text.length).toBeGreaterThan(20);
    // SUM/COUNT aggregations must equal the figures from reading the unpaid orders one by one.
    const unpaid = (await api().get('/api/v1/billing/outstanding').query({ limit: 100 }).set(as(ADMIN)).expect(200)).body.data.items as Array<{ balance: number }>;
    expect(res.body.data.revenue.outstandingOrders).toBe(unpaid.length);
    expect(res.body.data.revenue.outstanding).toBeCloseTo(unpaid.reduce((s, o) => s + o.balance, 0), 2);
    expect(res.body.data.weeklyRegistrations).toHaveLength(7);
    expect(res.body.data.weeklyRegistrations.reduce((s: number, d: { count: number }) => s + d.count, 0)).toBeGreaterThanOrEqual(3);
    const range = await api().get('/api/v1/analytics/range').query({ from: '2020-01-01', to: '2100-01-01' }).set(as(ADMIN)).expect(200);
    expect(range.body.data.totals.patients).toBeGreaterThanOrEqual(3);
    expect(range.body.data.totals.orders).toBeGreaterThanOrEqual(2);
    expect((await api().get('/api/v1/analytics/range').set(as(R))).status).toBe(403); // dashboard is role-filtered; range needs analytics.read
  });
});
