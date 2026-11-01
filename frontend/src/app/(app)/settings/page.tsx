'use client';

import { Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ImageUploader, MediaGallery } from '@/components/shared/image-uploader';
import { ErrorState, LoadingRows, PageHeader } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useTheme } from '@/components/layout/theme';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { settingsService } from '@/services/admin.service';
import type { LabSettings } from '@/types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `x-${Date.now()}`;

export default function SettingsPage() {
  const { can } = useAuth();
  const { theme, setTheme } = useTheme();
  const state = useApi(() => settingsService.get(), []);
  const [s, setS] = React.useState<LabSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (state.data) setS(state.data);
  }, [state.data]);
  const editable = can('settings.write');

  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!s) return <LoadingRows rows={8} />;
  const set = <K extends keyof LabSettings>(k: K, v: LabSettings[K]) => setS({ ...s, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const { updatedAt: _u, logoPath: _l, logo: _logo, ...body } = s;
      const saved = await settingsService.update(body);
      setS(saved);
      toast.success('Settings saved (audited)');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const SaveBar = () => editable ? <div className="flex justify-end"><Button loading={saving} onClick={() => void save()}><Save /> Save settings</Button></div> : null;

  return (
    <div>
      <PageHeader title="Settings" description={`Laboratory configuration · last updated ${formatDateTime(s.updatedAt)}`} />
      <Tabs defaultValue="lab">
        <TabsList>
          <TabsTrigger value="lab">Laboratory</TabsTrigger>
          <TabsTrigger value="branches">Branches & centres</TabsTrigger>
          <TabsTrigger value="clinical">Results & billing</TabsTrigger>
          <TabsTrigger value="print">Reports & labels</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="lab" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Laboratory profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Laboratory name" htmlFor="s-name" required><Input id="s-name" value={s.name} onChange={(e) => set('name', e.target.value)} disabled={!editable} /></Field>
              <Field label="Tagline" htmlFor="s-tag"><Input id="s-tag" value={s.tagline} onChange={(e) => set('tagline', e.target.value)} disabled={!editable} /></Field>
              <Field label="Address" htmlFor="s-addr" className="sm:col-span-2"><Textarea id="s-addr" rows={2} value={s.address} onChange={(e) => set('address', e.target.value)} disabled={!editable} /></Field>
              <Field label="Phone" htmlFor="s-phone"><Input id="s-phone" value={s.phone} onChange={(e) => set('phone', e.target.value)} disabled={!editable} /></Field>
              <Field label="Email" htmlFor="s-email"><Input id="s-email" value={s.email} onChange={(e) => set('email', e.target.value)} disabled={!editable} /></Field>
              <Field label="Website" htmlFor="s-web"><Input id="s-web" value={s.website ?? ''} onChange={(e) => set('website', e.target.value || undefined)} disabled={!editable} /></Field>
              <ImageUploader
                category="lab_logo"
                label="Logo (screen and printed reports)"
                current={s.logo}
                editable={editable}
                onChange={(logo) => setS((prev) => (prev ? { ...prev, logo: logo ?? undefined } : prev))}
                className="sm:col-span-2"
              />
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        <TabsContent value="branches" className="space-y-6">
          {(['branches', 'collectionCenters'] as const).map((key) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{key === 'branches' ? 'Branches' : 'Collection centres'}</CardTitle>
                {editable && <Button size="sm" variant="outline" onClick={() => set(key, [...s[key], { id: '', name: '', active: true }] as never)}><Plus /> Add</Button>}
              </CardHeader>
              <CardContent className="space-y-2">
                {!s[key].length && <p className="text-sm text-muted-foreground">None configured.</p>}
                {s[key].map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input className="min-w-0 flex-1" value={b.name} placeholder="Name" disabled={!editable} onChange={(e) => set(key, s[key].map((x, j) => (j === i ? { ...x, name: e.target.value, id: x.id || slug(e.target.value) } : x)) as never)} aria-label="Name" />
                    <label className="flex items-center gap-2 text-sm"><Switch checked={b.active} disabled={!editable} onCheckedChange={(v) => set(key, s[key].map((x, j) => (j === i ? { ...x, active: v } : x)) as never)} /> Active</label>
                    {editable && !(key === 'branches' && s.branches.length === 1) && <Button size="icon-sm" variant="ghost" onClick={() => set(key, s[key].filter((_, j) => j !== i) as never)} aria-label="Remove"><Trash2 /></Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle>Patient categories</CardTitle></CardHeader>
            <CardContent><Field label="Categories (comma separated)" htmlFor="s-cats"><Input id="s-cats" value={s.patientCategories.join(', ')} disabled={!editable} onChange={(e) => set('patientCategories', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field></CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6">
          <Card>
            <CardHeader><div><CardTitle>Result verification</CardTitle><CardDescription>Critical-result escalation and independence of verification.</CardDescription></div></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-start gap-3 text-sm sm:col-span-2"><Switch checked={s.results.allowSelfVerification} disabled={!editable} onCheckedChange={(v) => set('results', { ...s.results, allowSelfVerification: v })} /><span><span className="font-medium">Allow self-verification</span><span className="block text-muted-foreground">When off (recommended), the person who entered a result cannot approve it.</span></span></label>
              <Field label="Critical result escalation window (minutes)" htmlFor="s-crit"><Input id="s-crit" type="number" min={5} max={1440} value={s.results.criticalEscalationMinutes} disabled={!editable} onChange={(e) => set('results', { ...s.results, criticalEscalationMinutes: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-3 text-sm"><Switch checked={s.notifications.criticalResults} disabled={!editable} onCheckedChange={(v) => set('notifications', { ...s.notifications, criticalResults: v })} /> Critical result notifications</label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Maximum discount (% of eligible tests)" htmlFor="s-disc"><Input id="s-disc" type="number" min={0} max={100} value={s.billing.maxDiscountPercent} disabled={!editable} onChange={(e) => set('billing', { ...s.billing, maxDiscountPercent: Number(e.target.value) })} /></Field>
              <Field label="Currency" htmlFor="s-cur"><Input id="s-cur" value={s.billing.currency} disabled /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Inventory alerts</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm"><Switch checked={s.notifications.lowStock} disabled={!editable} onCheckedChange={(v) => set('notifications', { ...s.notifications, lowStock: v })} /> Low stock alerts</label>
              <Field label="Expiry warning (days ahead)" htmlFor="s-exp"><Input id="s-exp" type="number" min={1} max={365} value={s.notifications.expiryDays} disabled={!editable} onChange={(e) => set('notifications', { ...s.notifications, expiryDays: Number(e.target.value) })} /></Field>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        <TabsContent value="print" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Report header & footer</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <Field label="Header note" htmlFor="s-hn"><Input id="s-hn" value={s.reportHeaderNote ?? ''} disabled={!editable} onChange={(e) => set('reportHeaderNote', e.target.value || undefined)} /></Field>
              <Field label="Footer / disclaimer" htmlFor="s-ft" hint="Printed at the bottom of every report page"><Textarea id="s-ft" rows={3} value={s.reportFooter ?? ''} disabled={!editable} onChange={(e) => set('reportFooter', e.target.value || undefined)} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Barcode labels</CardTitle><CardDescription>CODE128 labels printed through the browser to any label printer driver.</CardDescription></div></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Label width (mm)" htmlFor="s-lw"><Input id="s-lw" type="number" min={20} max={120} value={s.barcode.labelWidthMm} disabled={!editable} onChange={(e) => set('barcode', { ...s.barcode, labelWidthMm: Number(e.target.value) })} /></Field>
              <Field label="Label height (mm)" htmlFor="s-lh"><Input id="s-lh" type="number" min={10} max={80} value={s.barcode.labelHeightMm} disabled={!editable} onChange={(e) => set('barcode', { ...s.barcode, labelHeightMm: Number(e.target.value) })} /></Field>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        <TabsContent value="images" className="space-y-6">
          <Card>
            <CardHeader><div><CardTitle>Laboratory gallery</CardTitle><CardDescription>Photos of the laboratory, equipment and facilities. Stored on Cloudinary and delivered in optimised formats.</CardDescription></div></CardHeader>
            <CardContent><MediaGallery category="lab_gallery" editable={editable} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Website illustrations</CardTitle><CardDescription>Artwork for the website and printed material.</CardDescription></div></CardHeader>
            <CardContent><MediaGallery category="website_illustration" editable={editable} /></CardContent>
          </Card>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            Images here are publicly viewable by link. Never upload patient documents, prescriptions or reports here — those belong in the patient record, which keeps them private.
          </p>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader><div><CardTitle>Data retention</CardTitle><CardDescription>Retention targets used by the documented backup & archival procedure (docs/BACKUP_AND_RECOVERY.md).</CardDescription></div></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Audit log retention (years)" htmlFor="s-ra"><Input id="s-ra" type="number" min={1} max={50} value={s.retention.auditLogYears} disabled={!editable} onChange={(e) => set('retention', { ...s.retention, auditLogYears: Number(e.target.value) })} /></Field>
              <Field label="Report retention (years)" htmlFor="s-rr"><Input id="s-rr" type="number" min={1} max={50} value={s.retention.reportYears} disabled={!editable} onChange={(e) => set('retention', { ...s.retention, reportYears: Number(e.target.value) })} /></Field>
              <p className="text-sm text-muted-foreground sm:col-span-2">Backups are configured in Google Cloud (Firestore scheduled exports / point-in-time recovery), not from this screen. See the backup guide for the procedure and restore drill.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Appearance (this device)</CardTitle></CardHeader>
            <CardContent><label className="flex items-center gap-3 text-sm"><Switch checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} /> Dark theme</label></CardContent>
          </Card>
          <SaveBar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
