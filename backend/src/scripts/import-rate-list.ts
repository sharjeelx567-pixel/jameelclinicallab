/**
 * Import / refresh the laboratory rate list into the configured database.
 *
 *   npm run import:rates                       # backend/data/rate-list.csv
 *   npm run import:rates -- --file other.csv   # columns: code,name,price,sample,reportingTime
 *   npm run import:rates -- --update-names     # also overwrite names of existing codes
 *
 * Existing tests (matched by code) keep their parameters and approved reference
 * ranges; only price, sample and reporting time are refreshed. No reference
 * ranges are created.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnv } from '../config/load-dotenv';

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', quoted = false;
  const endField = () => {
    row.push(cur);
    cur = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cur += ch;
  }
  if (cur || row.length) endRow();
  return rows.filter((r) => r.some((c) => c.trim()));
}

async function run() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const fileArg = args.indexOf('--file');
  const file = resolve(process.cwd(), fileArg >= 0 ? args[fileArg + 1] : 'data/rate-list.csv');

  const { getEnv } = await import('../config/env');
  const { FirebaseService } = await import('../firebase/firebase.service');
  const { FirestoreDataStore } = await import('../database/firestore-data-store');
  const { AuditService } = await import('../modules/audit-logs/audit.service');
  const { TestsService } = await import('../modules/tests/tests.service');
  const { RateRow } = await import('../modules/tests/rate-list');

  if (getEnv().DATA_BACKEND !== 'firestore') throw new Error('DATA_BACKEND must be "firestore" to import into the real database');
  const [header, ...lines] = parseCsv(readFileSync(file, 'utf8'));
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = { code: col('code'), name: col('name'), price: col('price'), sample: col('sample'), reportingTime: col('reportingTime') };
  if (idx.code < 0 || idx.name < 0 || idx.price < 0) throw new Error('CSV needs at least the columns: code, name, price');
  const rows = lines.map((l, i) => {
    const parsed = RateRow.safeParse({ code: l[idx.code], name: l[idx.name], price: l[idx.price], sample: idx.sample >= 0 ? l[idx.sample] : '', reportingTime: idx.reportingTime >= 0 ? l[idx.reportingTime] : '' });
    if (!parsed.success) throw new Error(`Row ${i + 2}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    return parsed.data;
  });

  const firebase = new FirebaseService();
  const store = new FirestoreDataStore(firebase.firestore);
  const tests = new TestsService(store, new AuditService(store));
  const actor = { uid: 'system', email: 'system@local', displayName: 'Rate list import', role: 'super_admin' as const, permissions: [] };
  const started = Date.now();
  const result = await tests.importRateList(rows, actor, { updateNames: args.includes('--update-names') });
  process.stdout.write(`Imported ${file}\n  rows: ${result.rows}\n  created: ${result.created}\n  updated: ${result.updated}\n  unchanged: ${result.unchanged}\n  time: ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
}

if (require.main === module)
  run().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
