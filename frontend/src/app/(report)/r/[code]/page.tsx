'use client';

import { useParams } from 'next/navigation';
import { PublicReportView } from '@/components/reports/public-report-view';
import { reportsService } from '@/services/lab.service';

/** QR code on the BILL: opens the order's current report (once ready and fully paid). */
export default function BillReportPage() {
  const { code } = useParams<{ code: string }>();
  return <PublicReportView load={() => reportsService.byOrderCode(code)} pdf={() => reportsService.publicPdfByOrderCode(code)} />;
}
