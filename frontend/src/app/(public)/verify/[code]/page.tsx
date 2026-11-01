'use client';

import { BadgeCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DetailList, ErrorState } from '@/components/shared/states';
import { Skeleton } from '@/components/ui/misc';
import { useApi } from '@/hooks/use-api';
import { formatDateTime, titleCase } from '@/lib/utils';
import { reportsService } from '@/services/lab.service';

/** Public authenticity check for printed reports (QR code). Shows no clinical results. */
export default function VerifyReportPage() {
  const { code } = useParams<{ code: string }>();
  const state = useApi(() => reportsService.verify(code), [code]);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Skeleton className="h-48 w-full rounded-xl" />;
  const r = state.data;
  if (!r.valid)
    return (
      <div className="text-center">
        <ShieldX className="mx-auto mb-3 size-12 text-destructive" />
        <h1 className="font-display text-2xl font-semibold">Report not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">No report matches verification code <span className="font-mono">{code}</span>. This document may not be genuine — contact the laboratory.</p>
      </div>
    );
  return (
    <div>
      {r.current ? <BadgeCheck className="mb-3 size-12 text-success" /> : <TriangleAlert className="mb-3 size-12 text-warning" />}
      <h1 className="font-display text-2xl font-semibold">{r.current ? 'Genuine report' : 'Superseded report'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.current ? `This report was issued by ${r.laboratory}.` : 'This report was genuine but has been replaced by an amended version. Request the current report from the laboratory.'}
      </p>
      <div className="glass mt-6 rounded-2xl p-5">
        <DetailList
          items={[
            ['Report number', r.reportNumber],
            ['Version', r.version],
            ['Status', titleCase(r.status ?? '')],
            ['Issued', formatDateTime(r.generatedAt)],
            ['Patient', r.patientInitials],
            ['MR number', r.mrNumberMasked],
          ]}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">For privacy, results are not shown here.</p>
    </div>
  );
}
