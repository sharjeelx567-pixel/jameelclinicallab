'use client';

import { TestEditor } from '@/components/laboratory/test-editor';
import { PageHeader } from '@/components/shared/states';

export default function NewTestPage() {
  return (
    <div>
      <PageHeader title="New test" description="Define the test, its parameters and (optionally) reference ranges for approval." />
      <TestEditor />
    </div>
  );
}
