/**
 * Responsive + smoke check against a RUNNING stack:
 *   backend: DATA_BACKEND=memory AUTH_MODE=dev SEED_DEMO_DATA=true (port 4000)
 *   frontend: NEXT_PUBLIC_AUTH_MODE=dev build (port 3000)
 *
 * 1. Seeds one clearly-fictional workflow through the API (patient → order →
 *    samples → results → verification → report) so pages have content.
 * 2. Visits key pages at every required viewport width and fails on:
 *    - page-level horizontal overflow (scrollWidth > viewport),
 *    - elements extending beyond the viewport that are not inside an
 *      intentional horizontal scroll container,
 *    - uncaught page errors / console errors.
 *
 * Usage: node scripts/responsive-check.mjs [--screenshots]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const WIDTHS = [1920, 1600, 1440, 1366, 1280, 1024, 768, 430, 390, 375, 360];
const SHOTS = process.argv.includes('--screenshots');

async function call(uid, method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer dev:${uid}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error)}`);
  return json.data;
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function seed() {
  const A = 'dev-super_admin', R = 'dev-receptionist', T = 'dev-lab_technician', P = 'dev-pathologist';
  await call(A, 'PATCH', '/tests/test-cbc', { price: 1200 });
  await call(A, 'PATCH', '/tests/test-fbs', { price: 350 });
  const patient = await call(R, 'POST', '/patients', {
    name: 'Demo Patient Responsive Check', guardianName: 'Demo Guardian', guardianRelation: 'father', gender: 'female', ageYears: 41,
    mobile: '03001234567', cnic: '00000-0000000-1', address: { province: 'Punjab', district: 'Lahore', line: 'DEMO ADDRESS — fictional record for UI testing' },
    confirmNotDuplicate: true,
  });
  const order = await call(R, 'POST', '/orders', { patientId: patient.id, testIds: ['test-cbc', 'test-fbs', 'test-hbsag'], priority: 'urgent', advancePayment: { amount: 500, method: 'cash' } });
  for (const sid of new Set(order.items.map((i) => i.sampleId))) {
    await call(R, 'POST', `/samples/${sid}/collect`, { location: 'Main lab' });
    await call(T, 'POST', `/samples/${sid}/receive`, { condition: 'Good' });
    await call(T, 'POST', `/samples/${sid}/accept`, {});
  }
  const byCode = Object.fromEntries(order.items.map((i) => [i.testCode, i.resultId]));
  await call(T, 'PUT', `/results/${byCode.CBC}/values`, { values: ['hb', 'wbc', 'rbc', 'hct', 'plt'].map((p, i) => ({ parameterId: p, value: String(10 + i) })), submit: true });
  await call(T, 'PUT', `/results/${byCode.FBS}/values`, { values: [{ parameterId: 'glu', value: '96' }], submit: true });
  await call(T, 'PUT', `/results/${byCode.HBSAG}/values`, { values: [{ parameterId: 'hbsag', value: 'Non-reactive' }] });
  await call(P, 'POST', `/results/${byCode.CBC}/approve`, { comment: 'Demo verification' });
  await call(P, 'POST', `/results/${byCode.FBS}/approve`, {});
  const report = await call(P, 'POST', `/reports/orders/${order.id}`);
  await call(A, 'POST', '/inventory/items', { name: 'EDTA tubes (demo item)', category: 'tube', unit: 'pcs', minimumLevel: 100, openingQuantity: 40, expiryDate: '2027-01-31' });
  await call(A, 'POST', '/doctors', { name: 'Dr. Demo Referrer', specialization: 'Medicine', clinic: 'Demo Clinic', commission: { type: 'percent', value: 5 } });
  await call(A, 'POST', '/panels', { name: 'Demo Corporate Panel', type: 'corporate', discountPercent: 10 });
  return { patient, order, report, resultId: byCode.HBSAG };
}

const overflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  const pageOverflow = document.documentElement.scrollWidth - vw;
  const scrollParent = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p instanceof SVGElement) continue; // SVGs report overflow:hidden by default — not a scroll container
      const s = getComputedStyle(p);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) return p;
    }
    return null;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue; // judge icons by their <svg> box
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || s.visibility === 'hidden') continue;
      const sp = scrollParent(el);
      if (sp) {
        const pr = sp.getBoundingClientRect();
        if (pr.right <= vw + 1 && pr.left >= -1) continue; // contained by an intentional scroll/clip container
      }
      offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} [${Math.round(r.left)}→${Math.round(r.right)}]`);
      if (offenders.length >= 5) break;
    }
  }
  return { pageOverflow, offenders };
};

async function main() {
  await waitFor(`${API.replace('/api/v1', '')}/health`);
  await waitFor(`${WEB}/login`);
  const data = await seed();
  const pages = [
    '/login',
    '/dashboard',
    '/patients',
    `/patients/${data.patient.id}`,
    '/patients/new',
    '/orders',
    '/orders/new',
    `/orders/${data.order.id}`,
    '/samples',
    '/results',
    `/results/${data.resultId}`,
    '/verification',
    '/reports',
    `/reports/${data.report.id}`,
    `/billing/invoice/${data.order.id}`,
    '/billing',
    '/tests',
    '/tests/test-cbc',
    '/doctors',
    '/panels',
    '/home-sampling',
    '/inventory',
    '/analyzers',
    '/analyzers/analyzer-demo-1',
    '/analyzers/messages',
    '/staff',
    '/notifications',
    '/analytics',
    '/audit-logs',
    '/settings',
    '/profile',
    `/verify/${data.report.verificationCode}`,
  ];

  const browser = await chromium.launch();
  const failures = [];
  let checks = 0;
  if (SHOTS) mkdirSync('test-results/responsive', { recursive: true });

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => sessionStorage.setItem('jcl.devUid', 'dev-super_admin'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));

    for (const path of pages) {
      errors.length = 0;
      try {
        await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        failures.push({ width, path, problems: [`did not settle: ${e.message.split('\n')[0]}`] });
        continue;
      }
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(150);
      const { pageOverflow, offenders } = await page.evaluate(overflowProbe);
      checks++;
      const problems = [];
      if (pageOverflow > 1) problems.push(`page overflows horizontally by ${pageOverflow}px`);
      if (offenders.length) problems.push(`elements outside viewport: ${offenders.join('; ')}`);
      if (errors.length) problems.push(...errors);
      if (problems.length) failures.push({ width, path, problems });
      if (SHOTS && [1440, 768, 390].includes(width)) await page.screenshot({ path: `test-results/responsive/${width}${path.replace(/[\/]/g, '_') || '_root'}.png`, fullPage: true });
    }

    // Mobile navigation drawer opens and links work
    if (width < 1024) {
      try {
        await page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Open navigation' }).click({ timeout: 10000 });
        await page.getByRole('dialog').getByRole('link', { name: 'Patients' }).click({ timeout: 10000 });
        await page.waitForURL('**/patients', { timeout: 10000 });
      } catch (e) {
        failures.push({ width, path: 'mobile navigation drawer', problems: [e.message.split('\n')[0]] });
      }
      checks++;
    }
    await context.close();
  }
  await browser.close();

  console.log(`Responsive check: ${checks} page×viewport checks across ${WIDTHS.length} widths.`);
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    for (const f of failures) console.log(`  [${f.width}px] ${f.path}\n    - ${f.problems.join('\n    - ')}`);
    process.exit(1);
  }
  console.log('All pages passed: no horizontal overflow, no out-of-viewport elements, no console errors.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
