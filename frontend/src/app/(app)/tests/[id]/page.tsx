'use client';

import { useParams } from 'next/navigation';
import { TestEditor } from '@/components/laboratory/test-editor';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/utils';
import { catalogService } from '@/services/lab.service';

export default function EditTestPage() {
  const { id } = useParams<{ id: string }>();
  const state = useApi(() => catalogService.get(id), [id]);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const t = state.data;
  return (
    <div>
      <PageHeader title={t.name} badge={<Badge tone="outline" className="font-mono">{t.code}</Badge>} description={`Last updated ${formatDateTime(t.updatedAt)}`} />
      <TestEditor key={t.updatedAt} test={t} />
    </div>
  );
}
