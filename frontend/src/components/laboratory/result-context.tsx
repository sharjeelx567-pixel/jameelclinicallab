'use client';

import { History } from 'lucide-react';
import { DetailList } from '@/components/shared/states';
import { FlagBadge, StatusBadge } from '@/components/shared/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PRIORITY, SAMPLE_STATUS } from '@/constants';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';
import type { ResultWorkspace } from '@/types';

/** Patient / order / sample panel + previous results + version history, shared by entry & verification. */
export function ResultContext({ ws }: { ws: ResultWorkspace }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Patient & order</CardTitle></CardHeader>
        <CardContent>
          <DetailList
            className="sm:grid-cols-2 xl:grid-cols-1"
            items={[
              ['Patient', `${ws.patient.name} · ${ws.patient.mrNumber}`],
              ['Age / gender', `${ws.patient.ageYears ?? '—'} Y / ${titleCase(ws.patient.gender)}`],
              ['Order', ws.order.orderNumber],
              ['Priority', <StatusBadge key="p" map={PRIORITY} value={ws.order.priority} />],
              ['Referring doctor', ws.order.doctorName ?? 'Self'],
              ['Clinical notes', ws.order.clinicalNotes],
              ['Sample', ws.sample ? `${ws.sample.sampleNumber} · ${ws.sample.sampleType}` : '—'],
              ['Sample status', ws.sample ? <StatusBadge key="s" map={SAMPLE_STATUS} value={ws.sample.status} /> : '—'],
              ['Collected', formatDateTime(ws.sample?.collectedAt)],
              ['Condition', ws.sample?.condition],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Previous results</CardTitle></CardHeader>
        <CardContent>
          {!ws.previousResults.length ? (
            <p className="text-sm text-muted-foreground">No earlier verified results for this test.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {ws.previousResults.map((p) => (
                <li key={p.id}>
                  <p className="text-xs font-medium text-muted-foreground">{formatDate(p.approvedAt)} · {p.orderNumber}</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.values.map((v) => {
                      const param = ws.parameters.find((x) => x.id === v.parameterId);
                      return (
                        <li key={v.parameterId} className="flex items-center justify-between gap-2">
                          <span className="truncate">{param?.name ?? v.parameterId}</span>
                          <span className="tabular flex items-center gap-2">{v.value} {v.unit}{v.flag !== 'normal' && v.flag !== 'no_range' && <FlagBadge flag={v.flag} />}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ws.versions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Approved versions</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {ws.versions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3">
                  <p className="font-medium">Version {v.version} {v.supersededAt ? <span className="text-xs text-muted-foreground">(superseded {formatDateTime(v.supersededAt)})</span> : <span className="text-xs text-success">(current)</span>}</p>
                  <p className="text-xs text-muted-foreground">Approved by {v.approvedBy.name} · {formatDateTime(v.approvedAt)}</p>
                  {v.amendmentReason && <p className="mt-1 text-xs">Amendment reason: {v.amendmentReason}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{v.values.map((x) => `${x.parameterName}: ${x.value}`).join(' · ')}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
