'use client';

import { CheckCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { todayKey } from '@/lib/utils';
import { catalogService, type RangeImportRow } from '@/services/lab.service';

const COLUMNS = ['code', 'testName', 'parameter', 'unit', 'gender', 'ageFrom', 'ageTo', 'low', 'high', 'normalText', 'criticalLow', 'criticalHigh'] as const;

/**
 * Reference ranges for many tests at once: download a spreadsheet of every offered
 * test/parameter, fill it from the laboratory's kit inserts, upload it (ranges are
 * created as DRAFT), then approve all drafts in one action.
 */
export function RangesBulk({ onChanged }: { onChanged?: () => void }) {
  const { can } = useAuth();
  const [busy, setBusy] = React.useState<null | 'template' | 'import' | 'approve'>(null);
  const [drafts, setDrafts] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState<RangeImportRow[] | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);

  const refreshDrafts = React.useCallback(async () => {
    try {
      setDrafts((await catalogService.draftRanges()).drafts);
    } catch {
      setDrafts(null);
    }
  }, []);
  React.useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const template = async () => {
    setBusy('template');
    try {
      const rows = await catalogService.rangesTemplate();
      downloadCsv(`normal-ranges-${todayKey()}.csv`, rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? '']))));
      toast.success(`Template downloaded: ${rows.length} rows. Fill unit, gender, age, low/high or normal text, then import it.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const readFile = async (f: File) => {
    try {
      const [header, ...lines] = parseCsv(await f.text());
      const idx = Object.fromEntries(COLUMNS.map((c) => [c, header.findIndex((h) => h.trim().toLowerCase() === c.toLowerCase())]));
      if (idx.code < 0 || idx.parameter < 0) throw new Error('The file needs at least the columns "code" and "parameter". Use the downloaded template.');
      const get = (l: string[], c: (typeof COLUMNS)[number]) => (idx[c] >= 0 ? (l[idx[c]] ?? '').trim() : '');
      const rows = lines
        .map((l) => ({ code: get(l, 'code'), parameter: get(l, 'parameter'), unit: get(l, 'unit'), gender: get(l, 'gender'), ageFrom: get(l, 'ageFrom'), ageTo: get(l, 'ageTo'), low: get(l, 'low'), high: get(l, 'high'), text: get(l, 'normalText'), criticalLow: get(l, 'criticalLow'), criticalHigh: get(l, 'criticalHigh') }))
        // Only rows where something was filled in (unit or a range) are sent.
        .filter((r) => r.code && r.parameter && (r.unit || r.low || r.high || r.text || r.criticalLow || r.criticalHigh));
      if (!rows.length) throw new Error('No filled rows found. Enter a unit, low/high or normal text for at least one parameter.');
      setPending(rows);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const runImport = async () => {
    if (!pending) return;
    setBusy('import');
    try {
      const r = await catalogService.importRanges(pending);
      setProblems(r.problems);
      toast.success(`Imported: ${r.rangesWritten} ranges and ${r.unitsSet} units in ${r.testsChanged} tests. New ranges are DRAFT until approved.`);
      setPending(null);
      await refreshDrafts();
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err), { duration: 9000 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Normal ranges — all tests at once</CardTitle>
          <CardDescription>1. Download the sheet · 2. Fill units and normal values in Excel from your kit inserts · 3. Import · 4. Approve. In normalText you can write words too; use &ldquo; | &rdquo; for a new line, e.g. Prediabetes 5.7-6.4% | Diabetes &gt;= 6.5%. Ranges are used on reports only after approval.</CardDescription>
        </div>
        {drafts !== null && drafts > 0 && <Badge tone="warning">{drafts} waiting approval</Badge>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" loading={busy === 'template'} onClick={() => void template()}><Download /> 1. Download sheet</Button>
        {can('tests.write') && (
          <>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
            <Button variant="outline" loading={busy === 'import'} onClick={() => file.current?.click()}><Upload /> 3. Import filled sheet</Button>
          </>
        )}
        {can('tests.approveRanges') && (
          <Button loading={busy === 'approve'} disabled={!drafts} onClick={() => setConfirmApprove(true)}><CheckCheck /> 4. Approve all drafts{drafts ? ` (${drafts})` : ''}</Button>
        )}
        {problems.length > 0 && (
          <div className="w-full rounded-xl border border-warning/50 bg-warning-soft/40 p-3 text-xs">
            <p className="mb-1 font-semibold">{problems.length} row(s) skipped:</p>
            <ul className="list-disc space-y-0.5 pl-4">{problems.slice(0, 15).map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Import normal ranges?"
        description={pending ? `${pending.length} filled rows. For each parameter in the file, its ranges are replaced by the file's rows; unchanged approved ranges stay approved, new or changed ones become DRAFT.` : undefined}
        confirmLabel="Import"
        onConfirm={runImport}
      />
      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title={`Approve ${drafts ?? 0} draft ranges?`}
        description="Approve only after checking the values against your laboratory's kit inserts / validated documentation. Approved ranges are printed on reports and used for H/L flags. Your name is recorded as the approver."
        confirmLabel="Approve all"
        onConfirm={async () => {
          setBusy('approve');
          try {
            const r = await catalogService.approveAllDrafts();
            toast.success(`${r.approved} ranges approved in ${r.tests} tests`);
            await refreshDrafts();
            onChanged?.();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(null);
          }
        }}
      />
    </Card>
  );
}
