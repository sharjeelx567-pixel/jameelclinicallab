/**
 * Public report page opened from the QR code on a printed report: no sign-in,
 * no sidebar — just the document (and a plain message when it cannot be shown).
 */
export default function PublicReportLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root min-h-dvh bg-slate-100 text-slate-900 print:min-h-0 print:bg-white">{children}</div>;
}
