'use client';

import { ListChecks, Rows3 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/shared/brand-loader';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';
import { catalogService, type StandardRowsResult } from '@/services/lab.service';

type Item = StandardRowsResult['tests'][number];

/**
 * One click: tests imported with a single "Result" box (Urine C/E, Stool C/E, Semen,
 * thyroid profiles, coagulation, GTT, bilirubin, cardiac enzymes) get separate rows
 * with units, choice lists, default values and DRAFT normal values.
 */
export function StandardRows({ onChanged }: { onChanged?: () => void }) {
  const { can } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<StandardRowsResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = async () => {
    setData(null);
    try {
      setData(await catalogService.standardRows());
    } catch (err) {
      toast.error(errorMessage(err));
      setOpen(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await catalogService.applyStandardRows();
      setData(r);
      toast.success(`${r.applied} tests now have separate result rows. Their normal values are waiting for approval below (step 4).`, { duration: 10000 });
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  if (!can('tests.write')) return null;
  const todo = data?.tests.filter((t) => t.action === 'replace' || t.action === 'add') ?? [];
  const waiting = data?.tests.filter((t) => t.action === 'skipped_open_results') ?? [];
  const done = data?.tests.filter((t) => t.action === 'up_to_date' || t.action === 'skipped_custom') ?? [];

  return (
    <Card className="mb-6">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Rows3 className="size-5 text-primary" /> Separate result rows for multi-result tests</CardTitle>
          <CardDescription>
            Urine C/E, Stool C/E, Semen analysis, thyroid profiles, PT/INR, coagulation profile, GTT, bilirubin (D + I), cardiac enzymes and extra LFT rows. Rows come with choice lists and normal defaults (Nil, Not Seen…), so staff change only abnormal values.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button onClick={() => { setOpen(true); void load(); }}><ListChecks /> Set up result rows</Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up separate result rows</DialogTitle>
            <DialogDescription>
              The single &ldquo;Result&rdquo; box of these tests is replaced by separate rows. Their normal values are textbook / WHO values created as DRAFT — the pathologist should check and approve them (step 4 below) before they print on reports.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[60vh] space-y-4 overflow-y-auto">
            {!data ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking your test list…</p>
            ) : (
              <>
                <Section title={data.applied ? `Done — ${data.applied} tests updated` : `Will be set up (${todo.length})`} tone="success" items={data.applied ? [] : todo} empty={data.applied ? undefined : 'Nothing to set up — all matching tests already have their rows.'} />
                <Section
                  title={`Waiting — results being entered (${waiting.length})`}
                  tone="warning"
                  items={waiting}
                  note="These tests have results not yet approved. Finish those results, then press “Set up result rows” again."
                />
                <Section title={`Already have their own rows (${done.length})`} tone="neutral" items={done} compact />
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>{data?.applied ? 'Close' : 'Cancel'}</Button>
            {!data?.applied && <Button loading={busy} disabled={!todo.length} onClick={() => void apply()}><ListChecks /> Set up {todo.length} tests</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Section({ title, items, tone, note, empty, compact }: { title: string; items: Item[]; tone: 'success' | 'warning' | 'neutral'; note?: string; empty?: string; compact?: boolean }) {
  if (!items.length && !empty) return tone === 'success' ? <p className="text-sm font-semibold text-success">{title}</p> : null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Badge tone={tone}>{items.length}</Badge> {title}</p>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      {!items.length && empty && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.testId} className="rounded-lg border px-3 py-2 text-sm">
            <span className="font-medium">{t.name}</span> <span className="text-xs text-muted-foreground">{t.code}</span>
            {!compact && t.rows.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.action === 'add' ? 'Adds: ' : ''}{t.rows.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
