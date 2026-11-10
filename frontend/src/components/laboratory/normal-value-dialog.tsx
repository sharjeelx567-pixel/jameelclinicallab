'use client';

import { PencilLine } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { catalogService } from '@/services/lab.service';

export interface NormalValueParam {
  id: string;
  name: string;
  unit?: string;
  inputType: 'numeric' | 'text' | 'select';
  options?: string[];
  approvedRange?: { low?: number; high?: number; text?: string } | null;
}

const WORD_ANSWERS = ['Negative', 'Non-Reactive', 'Not Detected', 'Nil', 'Not Seen', 'Absent', 'Normal'];

/**
 * Small pencil button next to a result's normal value. Opens a simple form:
 * a word answer (e.g. Negative) for word results, lowest/highest for number results.
 */
export function NormalValueButton({ testId, param, onSaved, className }: { testId: string; param: NormalValueParam; onSaved: () => void; className?: string }) {
  const { can } = useAuth();
  const [open, setOpen] = React.useState(false);
  if (!can('tests.write')) return null;
  const isSet = !!param.approvedRange;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10', className)}
        aria-label={`${isSet ? 'Change' : 'Set'} normal value for ${param.name}`}
      >
        <PencilLine className="size-3.5" /> {isSet ? 'Change' : 'Set normal value'}
      </button>
      {open && <NormalValueDialog testId={testId} param={param} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}

function NormalValueDialog({ testId, param, onClose, onSaved }: { testId: string; param: NormalValueParam; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const numeric = param.inputType === 'numeric';
  const r = param.approvedRange;
  const [text, setText] = React.useState(r?.text ?? '');
  const [low, setLow] = React.useState(r?.low !== undefined ? String(r.low) : '');
  const [high, setHigh] = React.useState(r?.high !== undefined ? String(r.high) : '');
  const [unit, setUnit] = React.useState(param.unit ?? '');
  const [saving, setSaving] = React.useState(false);
  const answers = param.inputType === 'select' && param.options?.length ? param.options : WORD_ANSWERS;

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const lowN = num(low);
  const highN = num(high);
  const badNumber = (lowN !== undefined && !Number.isFinite(lowN)) || (highN !== undefined && !Number.isFinite(highN));
  const empty = !text.trim() && lowN === undefined && highN === undefined;

  const save = async () => {
    if (badNumber) return toast.error('Lowest and highest must be numbers');
    if (lowN !== undefined && highN !== undefined && lowN > highN) return toast.error('Lowest normal must not be more than highest normal');
    setSaving(true);
    try {
      const res = await catalogService.setNormalValue(testId, param.id, {
        text: text.trim() || undefined,
        low: numeric ? lowN : undefined,
        high: numeric ? highN : undefined,
        unit: numeric ? unit.trim() : undefined,
      });
      toast.success(res.approved ? 'Normal value saved — flags updated' : 'Normal value saved as draft — the pathologist must approve it in Test catalogue');
      onClose();
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Normal value — {param.name}</DialogTitle>
          <DialogDescription>
            {numeric ? 'Results below the lowest are marked L, above the highest are marked H.' : 'Write the answer that is normal. Any other answer is marked Abnormal.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {numeric ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Lowest normal" htmlFor="nv-low"><Input id="nv-low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} placeholder="e.g. 4" autoFocus /></Field>
                <Field label="Highest normal" htmlFor="nv-high"><Input id="nv-high" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} placeholder="e.g. 11" /></Field>
                <Field label="Unit" htmlFor="nv-unit"><Input id="nv-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mg/dL" maxLength={30} /></Field>
              </div>
              <Field label="Text to print (optional)" htmlFor="nv-text" hint="Leave empty to print the numbers. Press Enter for a new line.">
                <Textarea id="nv-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={'Prediabetes 5.7-6.4%\nDiabetes >= 6.5%'} />
              </Field>
            </>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-medium">Tap the normal answer</p>
                <div className="flex flex-wrap gap-2">
                  {answers.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setText(a)}
                      className={cn('rounded-full border px-3 py-1 text-sm transition', text.trim().toLowerCase() === a.toLowerCase() ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary hover:text-primary')}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Or write it" htmlFor="nv-text" hint='Two answers both normal: "Pale Yellow / Yellow". Several lines are printed as written and not marked.'>
                <Textarea id="nv-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
              </Field>
            </>
          )}
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            This applies to every patient. Separate male / female or age values can be added in Test catalogue.
            {!can('tests.approveRanges') && ' It will be used after the pathologist approves it.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={empty || badNumber} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
