'use client';

import { FileCode, Inbox, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { AsyncBoundary, EmptyState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form-controls';
import { MESSAGE_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { analyzersService } from '@/services/admin.service';
import type { AnalyzerMessage } from '@/types';

function MessagesView() {
  const params = useSearchParams();
  const { can } = useAuth();
  const [status, setStatus] = React.useState(params.get('status') ?? '');
  const [analyzerId, setAnalyzerId] = React.useState(params.get('analyzerId') ?? '');
  const analyzers = useApi(() => analyzersService.list(), []);
  const state = useApi(() => analyzersService.messages({ status: status || undefined, analyzerId: analyzerId || undefined }), [status, analyzerId], { refreshMs: 60_000 });
  const [rawId, setRawId] = React.useState<string | null>(null);
  const raw = useApi(rawId ? () => analyzersService.message(rawId) : null, [rawId]);
  const [matching, setMatching] = React.useState<AnalyzerMessage | null>(null);
  const [sampleNumber, setSampleNumber] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const name = (id: string) => analyzers.data?.find((a) => a.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader title="Analyzer messages" description="Every message is stored with its original raw content. Matched values become DRAFT results that still require entry review and verification." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-2/3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(MESSAGE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select value={analyzerId} onChange={(e) => setAnalyzerId(e.target.value)} aria-label="Analyzer"><option value="">All analyzers</option>{analyzers.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </div>
      <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={Inbox} title="No messages" description="Messages appear here when the machine bridge forwards them." /> : null)}>
        {(d) => (
          <ul className="space-y-2">
            {d.items.map((m) => (
              <li key={m.id} className="glass rounded-2xl p-4 ">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{name(m.analyzerId)} <span className="text-xs font-normal text-muted-foreground">{m.protocol.toUpperCase()} · {formatDateTime(m.receivedAt)}</span></p>
                    <p className="text-sm">Sample ID: <span className="font-mono">{m.sampleIdentifier ?? '—'}</span> · {m.results.length} result(s)</p>
                    {m.results.length > 0 && <p className="truncate text-xs text-muted-foreground">{m.results.slice(0, 6).map((r) => `${r.analyzerTestCode}=${r.value}${r.unit ? ` ${r.unit}` : ''}`).join(' · ')}</p>}
                    {m.errors.length > 0 && <ul className="mt-1 text-xs text-destructive">{m.errors.slice(0, 3).map((e) => <li key={e}>• {e}</li>)}</ul>}
                    {m.matchedOrderId && <Link href={`/orders/${m.matchedOrderId}`} className="text-xs text-primary hover:underline">Matched order →</Link>}
                  </div>
                  <StatusBadge map={MESSAGE_STATUS} value={m.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setRawId(m.id)}><FileCode /> Raw message</Button>
                  {can('analyzers.match') && !m.isDemo && (m.status === 'unmatched' || m.status === 'matched') && (
                    <Button size="sm" variant="outline" onClick={() => { setMatching(m); setSampleNumber(m.sampleIdentifier ?? ''); }}><Link2 /> Match manually</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>

      <Dialog open={!!rawId} onOpenChange={(o) => !o && setRawId(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Raw message</DialogTitle><DialogDescription>Original content as received from the analyzer (control characters shown as ␍).</DialogDescription></DialogHeader>
          <DialogBody>
            {!raw.data ? <LoadingRows rows={3} /> : <pre className="scrollbar-thin max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">{raw.data.raw?.replace(/\r/g, '␍\n')}</pre>}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={!!matching} onOpenChange={(o) => !o && setMatching(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Match message to sample</DialogTitle>
            <DialogDescription>Use when the analyzer sent a misread or missing barcode. Values are applied as a draft and must still be submitted and verified. This action is audited.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Sample number" htmlFor="match-sn" required><Input id="match-sn" value={sampleNumber} onChange={(e) => setSampleNumber(e.target.value.toUpperCase())} className="font-mono" placeholder="S26…" /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatching(null)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!sampleNumber.trim()}
              onClick={async () => {
                if (!matching) return;
                setPending(true);
                try {
                  const res = await analyzersService.match(matching.id, sampleNumber.trim());
                  toast[res.status === 'applied' ? 'success' : 'warning'](res.status === 'applied' ? 'Values applied as draft results' : `Not applied: ${res.errors.join('; ') || res.status}`);
                  setMatching(null);
                  void state.reload();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setPending(false);
                }
              }}
            >
              Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AnalyzerMessagesPage() {
  return (
    <React.Suspense>
      <MessagesView />
    </React.Suspense>
  );
}
