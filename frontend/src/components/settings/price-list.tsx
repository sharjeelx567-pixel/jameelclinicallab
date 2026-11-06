'use client';

import { Download, RotateCcw, Save, Search, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Input, Select, Switch } from '@/components/ui/form-controls';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { cn, formatMoney, todayKey } from '@/lib/utils';
import { catalogService, type RateListRow } from '@/services/lab.service';
import { BrandLoader } from '@/components/shared/brand-loader';

const PAGE = 100;

/**
 * Laboratory price list: every test's rate in one table. Edits are saved in one
 * bulk request (audited); CSV export/import keeps the list in sync with a
 * spreadsheet. Changing a price never changes bills already issued.
 */
export function PriceList({ editable }: { editable: boolean }) {
  const state = useApi(() => catalogService.index(), []);
  const [q, setQ] = React.useState('');
  const [dept, setDept] = React.useState('');
  const [show, setShow] = React.useState<'active' | 'inactive' | 'all'>('all');
  const [limit, setLimit] = React.useState(PAGE);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [importRows, setImportRows] = React.useState<RateListRow[] | null>(null);
  const [updateNames, setUpdateNames] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const data = state.data;
  const deptName = React.useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c.name])), [data]);
  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.tests ?? []).filter(
      (t) => (!dept || t.categoryId === dept) && (show === 'all' || (show === 'active') === t.active) && (!s || t.name.toLowerCase().includes(s) || t.code.toLowerCase().startsWith(s)),
    );
  }, [data, q, dept, show]);
  React.useEffect(() => setLimit(PAGE), [q, dept, show]);

  const changes = Object.entries(edits)
    .map(([testId, v]) => ({ testId, price: Number(v), before: data?.tests.find((t) => t.id === testId)?.price }))
    .filter((c) => c.before !== undefined && Number.isFinite(c.price) && c.price >= 0 && c.price !== c.before);
  const invalid = Object.values(edits).some((v) => v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await catalogService.updatePrices(changes.map(({ testId, price }) => ({ testId, price })));
      toast.success(`${res.updated} price${res.updated === 1 ? '' : 's'} updated (recorded in the audit log)`);
      setEdits({});
      await state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    setToggling(id);
    try {
      await catalogService.update(id, { active });
      state.setData((d) => (d ? { ...d, tests: d.tests.map((t) => (t.id === id ? { ...t, active } : t)) } : d));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `price-list-${todayKey()}.csv`,
      (data?.tests ?? []).map((t) => ({ code: t.code, name: t.name, price: t.price, sample: t.sampleType, reportingTime: t.reportingTime ?? '', department: deptName.get(t.categoryId) ?? '', active: t.active ? 'yes' : 'no' })),
    );

  const readFile = async (file: File) => {
    try {
      const [header, ...lines] = parseCsv(await file.text());
      const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase());
      const c = { code: col('code'), name: col('name'), price: col('price'), sample: col('sample'), reportingTime: col('reportingTime') };
      if (c.code < 0 || c.name < 0 || c.price < 0) throw new Error('The CSV needs the columns: code, name, price (optional: sample, reportingTime)');
      const problems: string[] = [];
      const rows: RateListRow[] = [];
      lines.forEach((l, i) => {
        if (l.every((v) => !v?.trim())) return; // blank line (Excel often adds these)
        const n = i + 2;
        const code = (l[c.code] ?? '').trim();
        const name = (l[c.name] ?? '').trim();
        const rawPrice = String(l[c.price] ?? '').replace(/[,\s]|rs\.?/gi, '');
        const price = Number(rawPrice);
        const sample = c.sample >= 0 ? (l[c.sample] ?? '').trim() : undefined;
        const reportingTime = c.reportingTime >= 0 ? (l[c.reportingTime] ?? '').trim() : undefined;
        if (l.some((v) => /[\r\n]/.test(v ?? ''))) {
          problems.push(`Row ${n} (code ${code || '?'}): a quote mark (") is opened but not closed, so several rows were joined — remove that quote in Excel`);
          return;
        }
        if (!code) problems.push(`Row ${n}: code is empty`);
        else if (code.length > 40) problems.push(`Row ${n}: code is too long`);
        if (!name) problems.push(`Row ${n}: test name is empty`);
        else if (name.length > 200) problems.push(`Row ${n}: test name is too long`);
        if (!rawPrice || !Number.isFinite(price) || price < 0) problems.push(`Row ${n}: price "${l[c.price] ?? ''}" is not a valid number`);
        if (sample && sample.length > 200) problems.push(`Row ${n}: sample text is too long`);
        if (reportingTime && reportingTime.length > 120) problems.push(`Row ${n}: reporting time is too long`);
        rows.push({ code, name, price, sample, reportingTime });
      });
      if (problems.length) throw new Error(`Fix these rows in the file and import again: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` … and ${problems.length - 5} more` : ''}`);
      if (!rows.length) throw new Error('The CSV has no rows');
      setImportRows(rows);
    } catch (err) {
      toast.error(errorMessage(err), { duration: 12000 });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Price list</CardTitle>
          <CardDescription>All tests and their rates. New prices apply to new bills only; issued bills never change.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}><Download /> Export CSV</Button>
          {editable && (
            <>
              <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Upload /> Import CSV</Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search test name or code" className="pl-9" aria-label="Search price list" />
          </div>
          <div className="shrink-0 md:w-56"><Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {data?.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></div>
          <div className="shrink-0 md:w-40"><Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Status">
            <option value="all">All tests</option><option value="active">Offered</option><option value="inactive">Not offered</option>
          </Select></div>
        </div>

        {state.error ? (
          <p className="text-sm text-destructive">{errorMessage(state.error)} <button className="underline" onClick={() => void state.reload()}>Retry</button></p>
        ) : !data ? (
          <BrandLoader size="section" label="Loading price list…" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{filtered.length} of {data.tests.length} tests</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Test</th><th className="px-3 py-2">Sample · reporting</th><th className="px-3 py-2 text-center">Offered</th><th className="w-36 px-3 py-2 text-right">Price (Rs)</th></tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.slice(0, limit).map((t) => {
                    const v = edits[t.id];
                    const dirty = v !== undefined && Number(v) !== t.price;
                    return (
                      <tr key={t.id} className={cn(!t.active && 'text-muted-foreground', dirty && 'bg-warning-soft/40')}>
                        <td className="px-3 py-1.5 font-mono text-xs">{t.code}</td>
                        <td className="px-3 py-1.5"><span className="font-medium">{t.name}</span><span className="block text-xs text-muted-foreground">{deptName.get(t.categoryId)}</span></td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{t.sampleType}{t.reportingTime ? ` · ${t.reportingTime.toLowerCase()}` : ''}</td>
                        <td className="px-3 py-1.5 text-center">
                          <Switch checked={t.active} disabled={!editable || toggling === t.id} onCheckedChange={(on) => void toggleActive(t.id, on)} aria-label={`${t.name} offered`} />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={v ?? String(t.price)}
                            disabled={!editable}
                            onChange={(e) => setEdits((s) => ({ ...s, [t.id]: e.target.value }))}
                            className="tabular h-8 text-right"
                            aria-label={`Price of ${t.name}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > limit && <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</Button></div>}
          </>
        )}

        {editable && (changes.length > 0 || invalid) && (
          <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-popover/95 p-3 shadow-elevated backdrop-blur">
            <span className="text-sm">{invalid ? <span className="text-destructive">Some prices are empty or invalid.</span> : <><Badge tone="warning">{changes.length}</Badge> price change{changes.length === 1 ? '' : 's'} not saved</>}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEdits({})}><RotateCcw /> Discard</Button>
              <Button size="sm" loading={saving} disabled={invalid || !changes.length} onClick={() => void save()}><Save /> Save prices</Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!importRows}
        onOpenChange={(o) => !o && setImportRows(null)}
        title="Import price list?"
        description={importRows ? `${importRows.length} rows. Tests are matched by code: existing tests get the new price, sample and reporting time; new codes are added. Parameters and approved reference ranges are never changed.` : undefined}
        confirmLabel="Import"
        onConfirm={async () => {
          if (!importRows) return;
          try {
            const r = await catalogService.importRateList(importRows, updateNames);
            toast.success(`Imported: ${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged`);
            setImportRows(null);
            await state.reload();
          } catch (err) {
            toast.error(errorMessage(err), { duration: 12000 });
          }
        }}
      >
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={updateNames} onCheckedChange={(v) => setUpdateNames(v === true)} /> Also update test names from the file</label>
        {importRows && <p className="text-xs text-muted-foreground">Total of all prices in the file: {formatMoney(importRows.reduce((s, r) => s + r.price, 0))}</p>}
      </ConfirmDialog>
    </Card>
  );
}
