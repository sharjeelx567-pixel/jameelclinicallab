'use client';

import { useParams } from 'next/navigation';
import { PublicReportView } from '@/components/reports/public-report-view';
import { reportsService } from '@/services/lab.service';

/** QR code on a printed REPORT. */
export default function VerifyReportPage() {
  const { code } = useParams<{ code: string }>();
  return <PublicReportView load={() => reportsService.verify(code)} pdf={() => reportsService.publicPdf(code)} />;
}
