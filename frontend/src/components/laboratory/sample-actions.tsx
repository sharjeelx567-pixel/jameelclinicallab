'use client';

import { Ban, CheckCircle2, Inbox, PlayCircle, Syringe } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';
import { samplesService, type SampleAction } from '@/services/lab.service';
import type { Sample } from '@/types';

const CONDITIONS = ['Good', 'Haemolysed', 'Lipaemic', 'Clotted', 'Insufficient volume', 'Leaking container', 'Unlabelled / mislabelled'];

const NEXT: Record<string, { action: SampleAction; label: string; icon: typeof Syringe; perm: string } | undefined> = {
  pending_collection: { action: 'collect', label: 'Collect', icon: Syringe, perm: 'samples.collect' },
  collected: { action: 'receive', label: 'Receive in lab', icon: Inbox, perm: 'samples.collect' },
  received: { action: 'accept', label: 'Accept', icon: CheckCircle2, perm: 'samples.process' },
  accepted: { action: 'process', label: 'Start processing', icon: PlayCircle, perm: 'samples.process' },
};

export function SampleActions({ sample, onChanged, size = 'sm' }: { sample: Sample; onChanged: () => void; size?: 'sm' | 'default' }) {
  const { can } = useAuth();
  const [dialog, setDialog] = React.useState<SampleAction | null>(null);
  const [location, setLocation] = React.useState(sample.collectionLocation ?? '');
  const [condition, setCondition] = React.useState('Good');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const next = NEXT[sample.status];
  const canReject = ['collected', 'received', 'accepted'].includes(sample.status) && can('samples.process');

  const run = async (action: SampleAction) => {
    if (action === 'reject' && reason.trim().length < 3) return toast.error('Enter the rejection reason');
    setPending(true);
    try {
      const res = await samplesService.act(sample.id, action, {
        location: action === 'collect' ? location || undefined : undefined,
        condition: action === 'collect' || action === 'receive' ? condition : undefined,
        reason: action === 'reject' ? reason.trim() : undefined,
      });
      toast.success(action === 'reject' ? `Sample rejected. Recollection queued as ${res.replacement?.sampleNumber}` : `Sample ${sample.sampleNumber}: ${action} recorded`);
      setDialog(null);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {next && can(next.perm) && (
        <Button size={size} onClick={() => (next.action === 'collect' || next.action === 'receive' ? setDialog(next.action) : void run(next.action))} loading={pending && !dialog}>
          <next.icon /> {next.label}
        </Button>
      )}
      {canReject && (
        <Button size={size} variant="outline" onClick={() => setDialog('reject')}>
          <Ban /> Reject
        </Button>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{dialog === 'reject' ? 'Reject sample' : dialog === 'collect' ? 'Record collection' : 'Receive sample in laboratory'}</DialogTitle>
            <DialogDescription>
              {sample.sampleNumber} · {sample.sampleType}
              {dialog === 'reject' && '. A replacement sample will be queued for recollection automatically.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {dialog === 'collect' && (
              <Field label="Collection location" htmlFor="loc">
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main lab — collection room" />
              </Field>
            )}
            {(dialog === 'collect' || dialog === 'receive') && (
              <Field label="Sample condition" htmlFor="cond">
                <Select id="cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
            )}
            {dialog === 'reject' && (
              <Field label="Rejection reason" htmlFor="reason" required>
                <Select id="reason-preset" value="" onChange={(e) => e.target.value && setReason(e.target.value)} aria-label="Common reasons" className="mb-2">
                  <option value="">Common reasons…</option>
                  {CONDITIONS.slice(1).map((c) => <option key={c}>{c}</option>)}
                </Select>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </Field>
            )}
            <p className="text-xs text-muted-foreground">Date, time and your name are recorded automatically by the server.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant={dialog === 'reject' ? 'destructive' : 'default'} loading={pending} onClick={() => dialog && void run(dialog)}>
              {dialog === 'reject' ? 'Reject sample' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
