'use client';

import { ArrowLeft, FilePlus2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PatientBill } from '@/components/billing/patient-bill';
import { ErrorState, LoadingRows } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { billingService } from '@/services/admin.service';

/** Bill preview inside the app. Printing happens on the separate print page (document only, with logo). */
export default function PatientBillPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const state = useApi(() => billingService.invoice(orderId), [orderId]);
  const printUrl = `/print/bill/${orderId}?auto=1`;

  // Old links with ?print=1 go straight to the print page.
  React.useEffect(() => {
    if (params.get('print') === '1') router.replace(printUrl);
  }, [params, router, printUrl]);

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/orders/${orderId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Order {state.data.order.orderNumber}</Link>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/register"><FilePlus2 /> New registration</Link></Button>
          <Button onClick={() => window.open(printUrl, '_blank', 'noopener')}><Printer /> Print bill</Button>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto bg-muted/40 px-4 py-6 sm:mx-0 sm:rounded-xl">
        <PatientBill inv={state.data} />
      </div>
    </div>
  );
}
