'use client';

import { Banknote, ClipboardList, Pencil, Percent, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { Avatar } from '@/components/shared/cloud-image';
import { ImageUploader } from '@/components/shared/image-uploader';
import { DetailList, EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatCard, StatusBadge } from '@/components/shared/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ORDER_STATUS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { formatDate, formatMoney } from '@/lib/utils';
import { doctorsService } from '@/services/patients.service';
import { DoctorDialog } from '@/features/doctors/doctor-dialog';

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const state = useApi(() => doctorsService.stats(id), [id]);
  const [editing, setEditing] = React.useState(false);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={8} />;
  const { doctor: d, totals, tests, recentOrders, referredPatients } = state.data;
  return (
    <div>
      <PageHeader title={d.name} badge={d.photo ? <Avatar photo={d.photo} name={d.name} size={36} /> : undefined} description={[d.qualification, d.specialization, d.clinic].filter(Boolean).join(' · ')} actions={can('doctors.write') && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Referred orders" value={totals.orders} icon={ClipboardList} />
        <StatCard label="Referred patients" value={totals.patients} icon={Users} tone="info" />
        <StatCard label="Billed revenue" value={formatMoney(totals.revenue)} icon={Banknote} tone="success" />
        <StatCard label="Estimated commission" value={formatMoney(totals.estimatedCommission)} hint="Per configured rule, before settlement" icon={Percent} tone="warning" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <ImageUploader category="doctor_profile" ownerId={d.id} current={d.photo} editable={can('doctors.write')} onChange={() => state.reload()} shape="circle" label="Profile photo" />
            <DetailList className="sm:grid-cols-1" items={[['Phone', d.phone], ['Email', d.email], ['Address', d.address], ['Status', <StatusBadge key="s" map={{ active: { label: 'Active', tone: 'success' }, inactive: { label: 'Inactive', tone: 'neutral' } }} value={d.status} />]]} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Doctor-wise test statistics</CardTitle></CardHeader>
          <CardContent>
            {!tests.length ? <p className="text-sm text-muted-foreground">No referrals yet.</p> : (
              <ul className="divide-y text-sm">
                {tests.map((t) => <li key={t.testName} className="flex justify-between py-2"><span>{t.testName}</span><span className="tabular text-muted-foreground">{t.count} · {formatMoney(t.revenue)}</span></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Referral history</CardTitle></CardHeader>
          <CardContent>
            {!recentOrders.length ? <EmptyState icon={ClipboardList} title="No referred orders" /> : (
              <ul className="divide-y">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                      <span>{o.patientName} <span className="text-xs text-muted-foreground">{o.orderNumber} · {formatDate(o.createdAt)}</span></span>
                      <span className="flex items-center gap-2"><span className="tabular">{formatMoney(o.total)}</span><StatusBadge map={ORDER_STATUS} value={o.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Referred patients</CardTitle></CardHeader>
          <CardContent>
            {!referredPatients.length ? <p className="text-sm text-muted-foreground">None.</p> : (
              <ul className="divide-y text-sm">
                {referredPatients.map((p) => <li key={p.id}><Link href={`/patients/${p.id}`} className="block py-2 hover:text-primary">{p.name} <span className="text-xs text-muted-foreground">{p.mrNumber}</span></Link></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <DoctorDialog doctor={d} open={editing} onOpenChange={setEditing} onSaved={state.reload} />
    </div>
  );
}
