'use client';

import { Archive, ArchiveRestore, ClipboardList, FileText, Paperclip, Pencil, Plus, Printer, Receipt, ScrollText, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Barcode } from '@/components/shared/codes';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { Logo } from '@/components/shared/logo';
import { DetailList, EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatCard, StatusBadge } from '@/components/shared/status';
import { fromPatient, PatientForm } from '@/components/patients/patient-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { BRAND, ORDER_STATUS, REPORT_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime, formatMoney, titleCase } from '@/lib/utils';
import { patientsService } from '@/services/patients.service';

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => patientsService.history(id), [id]);
  const [editing, setEditing] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const { patient: p, orders, payments, reports, timeline, summary, referringDoctor } = state.data;
  const archived = p.status === 'archived';
  const address = [p.address.line, p.address.unionCouncil, p.address.tehsil, p.address.district, p.address.division, p.address.province].filter(Boolean).join(', ');

  return (
    <div>
      {/* Print-only registration slip */}
      <section className="hidden print:block">
        <div className="flex items-start justify-between border-b pb-3">
          <Logo />
          <div className="text-right text-xs">
            <p className="font-semibold">{BRAND.name}</p>
            <p className="italic text-slate-500">{BRAND.tagline}</p>
          </div>
        </div>
        <h2 className="mt-4 text-lg font-semibold">Patient registration</h2>
        <div className="mt-2 flex items-start justify-between gap-6">
          <DetailList items={[['MR number', p.mrNumber], ['Name', p.name], ['Father / husband', p.guardianName], ['Age / gender', `${p.ageYears ?? '—'} Y / ${titleCase(p.gender)}`], ['Mobile', p.mobile], ['CNIC', p.cnic], ['Address', address], ['Registered', formatDateTime(p.createdAt)]]} />
          <Barcode value={p.mrNumber} height={44} />
        </div>
      </section>

      <div className="no-print">
        <PageHeader
          title={p.name}
          badge={archived ? <Badge tone="danger">Archived</Badge> : undefined}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono font-medium text-foreground">{p.mrNumber}</span>
              <span>{p.ageYears ?? '—'} Y · {titleCase(p.gender)}</span>
              <span>{p.mobile}</span>
              {referringDoctor && <span>Ref: {referringDoctor.name}</span>}
            </span>
          }
          actions={
            <>
              {can('orders.create') && !archived && <Button asChild><Link href={`/orders/new?patientId=${p.id}`}><Plus /> New order</Link></Button>}
              {can('patients.write') && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
              <Button variant="outline" onClick={() => window.print()}><Printer /> Print slip</Button>
              {can('patients.archive') && (
                <Button variant="ghost" onClick={() => setArchiving(true)}>{archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}</Button>
              )}
            </>
          }
        />

        <div className="mb-6 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Orders" value={summary.totalOrders} icon={ClipboardList} />
          <StatCard label="Total billed" value={formatMoney(summary.totalBilled)} icon={Receipt} tone="info" />
          <StatCard label="Paid" value={formatMoney(summary.totalPaid)} icon={Receipt} tone="success" />
          <StatCard label="Outstanding" value={formatMoney(summary.outstanding)} icon={Receipt} tone={summary.outstanding > 0 ? 'danger' : 'success'} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Profile</TabsTrigger>
            <TabsTrigger value="orders"><ClipboardList /> Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="reports"><FileText /> Reports ({reports.length})</TabsTrigger>
            <TabsTrigger value="payments"><Receipt /> Payments ({payments.length})</TabsTrigger>
            <TabsTrigger value="timeline"><ScrollText /> Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader><CardTitle>Demographics</CardTitle></CardHeader>
                <CardContent>
                  <DetailList
                    items={[
                      ['Father / husband', p.guardianName ? `${p.guardianName}${p.guardianRelation ? ` (${titleCase(p.guardianRelation)})` : ''}` : undefined],
                      ['Date of birth', p.dateOfBirth ? formatDate(p.dateOfBirth) : undefined],
                      ['CNIC', p.cnic],
                      ['Email', p.email],
                      ['Alternate mobile', p.alternateMobile],
                      ['Category', p.category],
                      ['Address', address],
                      ['Sample collection location', p.sampleCollectionLocation],
                      ['Registered', `${formatDateTime(p.createdAt)} by ${p.createdBy.name}`],
                      ['Last updated', formatDateTime(p.updatedAt)],
                      ['Notes', p.notes],
                    ]}
                  />
                </CardContent>
              </Card>
              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>MR barcode</CardTitle></CardHeader>
                  <CardContent className="flex justify-center overflow-hidden"><Barcode value={p.mrNumber} /></CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Attachments</CardTitle>
                    {can('patients.write') && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            if (f.size > 5 * 1024 * 1024) return toast.error('File must be 5 MB or smaller');
                            try {
                              await patientsService.attach(p.id, f);
                              toast.success('Attachment uploaded');
                              void state.reload();
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        />
                        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Upload</Button>
                      </>
                    )}
                  </CardHeader>
                  <CardContent>
                    {p.attachments.length ? (
                      <ul className="space-y-2 text-sm">
                        {p.attachments.map((a) => (
                          <li key={a.path} className="flex items-center gap-2"><Paperclip className="size-4 text-muted-foreground" /> <span className="truncate">{a.name}</span></li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No photograph or documents attached. PNG, JPEG or PDF up to 5 MB.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="orders">
            {!orders.length ? (
              <EmptyState icon={ClipboardList} title="No orders yet" action={can('orders.create') && !archived ? <Button asChild size="sm"><Link href={`/orders/new?patientId=${p.id}`}>Create order</Link></Button> : undefined} />
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex flex-col gap-2 glass rounded-2xl p-4  transition hover:shadow-elevated sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{o.orderNumber} <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDateTime(o.createdAt)}</span></p>
                      <p className="truncate text-sm text-muted-foreground">{o.items.map((i) => i.testName).join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-sm">{formatMoney(o.billing.total)}</span>
                      {o.billing.balance > 0 && <Badge tone="danger">Due {formatMoney(o.billing.balance)}</Badge>}
                      <StatusBadge map={ORDER_STATUS} value={o.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports">
            {!reports.length ? (
              <EmptyState icon={FileText} title="No reports issued" description="Reports appear here once results are verified and a report is generated." />
            ) : (
              <div className="space-y-2">
                {reports.map((r) => (
                  <Link key={r.id} href={`/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 glass rounded-2xl p-4  hover:shadow-elevated">
                    <div>
                      <p className="font-medium">{r.reportNumber} · v{r.version}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(r.generatedAt)} · printed {r.printCount}×</p>
                    </div>
                    <StatusBadge map={REPORT_STATUS} value={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments">
            {!payments.length ? (
              <EmptyState icon={Receipt} title="No payments recorded" />
            ) : (
              <div className="scrollbar-thin glass overflow-x-auto rounded-2xl">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Recorded</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.map((pm) => (
                      <tr key={pm.id}>
                        <td className="px-4 py-3 font-mono text-xs">{pm.receiptNumber}</td>
                        <td className="px-4 py-3">{pm.orderNumber}</td>
                        <td className="px-4 py-3">{titleCase(pm.method)}{pm.type === 'refund' && <Badge tone="danger" className="ml-2">Refund</Badge>}</td>
                        <td className={`tabular px-4 py-3 text-right ${pm.type === 'refund' ? 'text-destructive' : ''}`}>{pm.type === 'refund' ? '−' : ''}{formatMoney(pm.amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(pm.recordedAt)} · {pm.recordedBy.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            {!timeline.length ? (
              <EmptyState icon={ScrollText} title="No activity recorded" />
            ) : (
              <ol className="relative space-y-4 border-l pl-6">
                {timeline.map((t) => (
                  <li key={t.id} className="relative">
                    <span className="absolute -left-[29px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
                    <p className="text-sm font-medium">{titleCase(t.action.replace('patient.', ''))}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.at)} · {t.actor.name}</p>
                    {t.changes && <p className="mt-1 text-xs text-muted-foreground">Changed: {Object.keys(t.changes).join(', ')}</p>}
                    {t.note && <p className="mt-1 text-xs">{t.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="xl">
          <DialogHeader><DialogTitle>Edit patient — {p.mrNumber}</DialogTitle></DialogHeader>
          <DialogBody>
            <PatientForm
              defaultValues={fromPatient(p)}
              submitLabel="Save changes"
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                try {
                  await patientsService.update(p.id, input);
                  toast.success('Patient updated — change recorded in audit trail');
                  setEditing(false);
                  void state.reload();
                } catch (err) {
                  toast.error(errorMessage(err));
                  throw err;
                }
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={archived ? 'Restore patient?' : 'Archive patient?'}
        description={archived ? 'The patient will appear in searches again.' : 'Archived patients are hidden from searches and cannot receive new orders. History is preserved.'}
        destructive={!archived}
        confirmLabel={archived ? 'Restore' : 'Archive'}
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          try {
            await patientsService.archive(p.id, !archived, reason);
            toast.success(archived ? 'Patient restored' : 'Patient archived');
            void state.reload();
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}
