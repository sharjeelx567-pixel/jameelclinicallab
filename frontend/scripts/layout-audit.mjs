/**
 * Layout audit — finds problems the responsive check cannot see:
 *   CUT      text hidden by an overflow:hidden ancestor (content not fully showing)
 *   SPILL    text wider/taller than its own box, spilling over neighbours
 *   OVERLAP  two pieces of visible text drawn on top of each other
 *   ELLIPSIS text truncated with "…" and no tooltip (title) to read it in full
 *
 * Runs against a RUNNING dev-auth stack that already has data (run
 * responsive-check.mjs first, it seeds a workflow).
 *   WEB_URL=http://localhost:3100 API_URL=http://localhost:4100/api/v1 node scripts/layout-audit.mjs [--shots dir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const WIDTHS = (process.env.WIDTHS ?? '1920,1440,1366,1280,1024,768,430,390,360').split(',').map(Number);
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const get = (path) => fetch(`${API}${path}`, { headers: { Authorization: 'Bearer dev:dev-super_admin' } }).then((r) => r.json()).then((j) => j.data);

const probe = () => {
  const out = [];
  const label = (el) => {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    const text = (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}> "${text}"`;
  };
  const hiddenByAria = (el) => !!el.closest('[aria-hidden="true"], .sr-only, [hidden], svg');
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  // Leaves = elements that directly contain visible text.
  const leaves = [];
  for (const el of document.querySelectorAll('body *')) {
    if (hiddenByAria(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(el.tagName)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    const isField = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName);
    if ((hasText || (isField && el.tagName !== 'BUTTON')) && isVisible(el)) leaves.push(el);
  }
  const textRect = (el) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return el.getBoundingClientRect();
    const range = document.createRange();
    let rect = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        rect = rect ? { left: Math.min(rect.left, r.left), top: Math.min(rect.top, r.top), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
    }
    return rect;
  };

  for (const el of leaves) {
    const s = getComputedStyle(el);
    const r = textRect(el);
    if (!r) continue;
    // ELLIPSIS / SPILL on the element itself
    if (el.scrollWidth > el.clientWidth + 2 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      if (s.textOverflow === 'ellipsis') {
        if (!el.title && !el.closest('[title]')) out.push(`ELLIPSIS ${label(el)}`);
      } else if (s.overflowX === 'visible') out.push(`SPILL-X ${label(el)} (+${el.scrollWidth - el.clientWidth}px)`);
    }
    if (s.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 3 && s.display !== 'inline' && !s.webkitLineClamp?.match(/\d/)) out.push(`SPILL-Y ${label(el)} (+${el.scrollHeight - el.clientHeight}px)`);
    // CUT: text outside a clipping ancestor
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (['auto', 'scroll'].includes(as.overflowX) || ['auto', 'scroll'].includes(as.overflowY)) break;
      const clipX = ['hidden', 'clip'].includes(as.overflowX);
      const clipY = ['hidden', 'clip'].includes(as.overflowY);
      if (!clipX && !clipY) continue;
      const ar = a.getBoundingClientRect();
      const cutX = clipX && (r.left < ar.left - 1 || r.right > ar.right + 1) && s.textOverflow !== 'ellipsis';
      const cutY = clipY && (r.top < ar.top - 1 || r.bottom > ar.bottom + 1);
      if ((cutX || cutY) && !(as.webkitLineClamp && as.webkitLineClamp !== 'none')) {
        out.push(`CUT ${label(el)} clipped by ${label(a).split('"')[0].trim()} (${cutX ? 'width' : ''}${cutX && cutY ? '+' : ''}${cutY ? 'height' : ''})`);
        break;
      }
    }
  }
  // OVERLAP between unrelated text leaves
  const visibleRect = (el) => {
    let r = textRect(el);
    if (!r) return null;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      r = { left: Math.max(r.left, ar.left), right: Math.min(r.right, ar.right), top: Math.max(r.top, ar.top), bottom: Math.min(r.bottom, ar.bottom) };
      if (r.right - r.left < 1 || r.bottom - r.top < 1) return null;
    }
    return r;
  };
  const rects = leaves.map((el) => ({ el, r: visibleRect(el) })).filter((x) => x.r);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) {
        const smaller = Math.min((a.r.right - a.r.left) * (a.r.bottom - a.r.top), (b.r.right - b.r.left) * (b.r.bottom - b.r.top));
        if ((w * h) / smaller > 0.15) out.push(`OVERLAP ${label(a.el)} ⟷ ${label(b.el)}`);
      }
    }
  return [...new Set(out)];
};

async function main() {
  const [patients, orders, reports, doctors, panels, inventory] = await Promise.all([
    get('/patients?limit=1'), get('/orders?limit=1'), get('/reports?limit=1'), get('/doctors?limit=1'), get('/panels'), get('/inventory/items?limit=1'),
  ]);
  const p = patients.items[0], o = orders.items[0], r = reports.items[0];
  const pages = [
    '/login', '/dashboard', '/patients', '/patients/new', `/patients/${p.id}`, '/orders', '/orders/new', `/orders/${o.id}`,
    '/samples', '/results', `/results/${o.items[0].resultId}`, '/verification', '/reports', `/reports/${r.id}`, `/billing/invoice/${o.id}`,
    '/billing', '/tests', '/tests/new', '/tests/test-cbc', '/doctors', ...(doctors.items[0] ? [`/doctors/${doctors.items[0].id}`] : []),
    '/panels', ...(panels[0] ? [`/panels/${panels[0].id}`] : []), '/home-sampling', '/inventory', '/analyzers', '/analyzers/analyzer-demo-1',
    '/analyzers/messages', '/staff', '/notifications', '/analytics', '/audit-logs', '/settings', '/profile', `/verify/${r.verificationCode}`,
  ].filter((x) => !ONLY || ONLY.test(x));
  void inventory;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const findings = new Map(); // issue -> widths
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 } });
    await ctx.addInitScript(() => {
      if (!location.pathname.startsWith('/login')) sessionStorage.setItem('jcl.devUid', 'dev-super_admin');
      // Freeze animations so we audit the settled layout.
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}';
        document.head.appendChild(st);
      });
    });
    const page = await ctx.newPage();
    for (const path of pages) {
      await page.goto(WEB + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => undefined);
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      for (const issue of await page.evaluate(probe)) {
        const k = `${path.replace(/[0-9A-Za-z]{16,}/g, ':id')} | ${issue}`;
        findings.set(k, [...(findings.get(k) ?? []), width]);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}${path.replace(/\//g, '_')}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
  const sorted = [...findings.entries()].sort();
  for (const [k, w] of sorted) console.log(`${k}  @ ${w.join(',')}`);
  console.log(`\n${sorted.length} distinct layout findings across ${pages.length} pages × ${WIDTHS.length} widths.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
