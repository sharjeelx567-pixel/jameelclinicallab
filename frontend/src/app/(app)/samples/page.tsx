'use client';

import { ScanBarcode, TestTubes } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { SampleActions } from '@/components/laboratory/sample-actions';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/form-controls';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { SAMPLE_STATUS } from '@/constants';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { samplesService } from '@/services/lab.service';
import type { Sample } from '@/types';

const TABS = [
  { value: 'pending_collection', label: 'To collect' },
  { value: 'collected', label: 'To receive' },
  { value: 'received', label: 'To accept' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'processing', label: 'Processing' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
];

export default function SamplesPage() {
  const [tab, setTab] = React.useState('pending_collection');
  const [scan, setScan] = React.useState('');
  const [scanned, setScanned] = React.useState<Sample | null>(null);
  const state = useApi(() => samplesService.list({ status: tab, limit: 100 }), [tab]);

  // Handheld scanners type the code and press Enter.
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    try {
      setScanned(await samplesService.byBarcode(code));
      setScan('');
    } catch (err) {
      setScanned(null);
      toast.error(errorMessage(err));
    }
  };

  const refresh = () => {
    void state.reload();
    if (scanned) samplesService.get(scanned.id).then(setScanned).catch(() => setScanned(null));
  };

  return (
    <div>
      <PageHeader title="Sample collection & tracking" description="Scan a barcode or work through each queue. Every step is time-stamped and attributed on the server." />

      <Card className="mb-6">
        <CardContent className="p-4">
          <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type sample barcode (e.g. S26…)" className="pl-9 font-mono" aria-label="Sample barcode" autoComplete="off" />
            </div>
            <Button type="submit" variant="secondary">Find sample</Button>
          </form>
          {scanned && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-primary-soft/30 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{scanned.sampleNumber}</p>
                <p className="text-sm">{scanned.sampleType} · <Link href={`/orders/${scanned.orderId}`} className="text-primary hover:underline">{scanned.orderNumber}</Link></p>
                <p className="text-xs text-muted-foreground">Last update {timeAgo(scanned.timeline.at(-1)?.at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge map={SAMPLE_STATUS} value={scanned.status} />
                <SampleActions sample={scanned} onChanged={refresh} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="mt-4">
        <AsyncBoundary state={state} empty={(d) => (!d.items.length ? <EmptyState icon={TestTubes} title="Queue is clear" description={`No samples are ${SAMPLE_STATUS[tab]?.label.toLowerCase()}.`} /> : null)}>
          {(d) => (
            <ul className="space-y-2">
              {d.items.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 glass rounded-2xl p-4  md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="font-mono">{s.sampleNumber}</span> · {s.sampleType}
                      {s.containerType && <span className="text-sm font-normal text-muted-foreground"> ({s.containerType})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/orders/${s.orderId}`} className="hover:text-primary">{s.orderNumber}</Link> · created {formatDateTime(s.createdAt)}
                      {s.collectedAt && ` · collected ${timeAgo(s.collectedAt)}`}
                    </p>
                    {s.rejectionReason && <p className="text-xs text-destructive">Reason: {s.rejectionReason}</p>}
                  </div>
                  <SampleActions sample={s} onChanged={refresh} />
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>
    </div>
  );
}
