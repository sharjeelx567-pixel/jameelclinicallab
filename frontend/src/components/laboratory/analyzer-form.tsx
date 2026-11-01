'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form-controls';
import { errorMessage } from '@/lib/api-client';
import { analyzersService } from '@/services/admin.service';
import type { Analyzer } from '@/types';

export function AnalyzerDialog({ analyzer, open, onOpenChange, onSaved }: { analyzer?: Analyzer; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const init = () => ({
    name: analyzer?.name ?? '',
    brand: analyzer?.brand ?? 'BIOELAB',
    model: analyzer?.model ?? '',
    serialNumber: analyzer?.serialNumber ?? '',
    machineType: analyzer?.machineType ?? '',
    connectionType: analyzer?.connectionType ?? 'none',
    host: analyzer?.host ?? '',
    port: analyzer?.port ? String(analyzer.port) : '',
    serialPort: analyzer?.serialPort ?? '',
    baudRate: analyzer?.baudRate ? String(analyzer.baudRate) : '',
    protocol: analyzer?.protocol ?? 'unconfirmed',
    mode: analyzer?.mode ?? 'demo',
    enabled: analyzer?.enabled ?? false,
    integrationStatus: analyzer?.integrationStatus ?? 'pending_documentation',
    bridgeId: analyzer?.bridgeId ?? '',
    notes: analyzer?.notes ?? '',
  });
  const [f, setF] = React.useState(init);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) setF(init());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    if (f.name.trim().length < 2 || !f.machineType.trim()) return toast.error('Enter the analyzer name and machine type');
    setSaving(true);
    const body = {
      ...f,
      model: f.model || undefined,
      serialNumber: f.serialNumber || undefined,
      host: f.host || undefined,
      port: f.port ? Number(f.port) : undefined,
      serialPort: f.serialPort || undefined,
      baudRate: f.baudRate ? Number(f.baudRate) : undefined,
      bridgeId: f.bridgeId || undefined,
      notes: f.notes || undefined,
    };
    try {
      if (analyzer) await analyzersService.update(analyzer.id, body);
      else await analyzersService.create(body);
      toast.success('Analyzer configuration saved (audited)');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{analyzer ? 'Edit analyzer' : 'Register analyzer'}</DialogTitle>
          <DialogDescription>Enter the exact model, serial number and interface settings from the vendor documentation. Saving a configuration does not connect the machine.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="a-name" required><Input id="a-name" value={f.name} onChange={set('name')} /></Field>
          <Field label="Brand" htmlFor="a-brand"><Input id="a-brand" value={f.brand} onChange={set('brand')} /></Field>
          <Field label="Exact model number" htmlFor="a-model"><Input id="a-model" value={f.model} onChange={set('model')} placeholder="From the device rating plate" /></Field>
          <Field label="Serial number" htmlFor="a-sn"><Input id="a-sn" value={f.serialNumber} onChange={set('serialNumber')} /></Field>
          <Field label="Machine type" htmlFor="a-type" required><Input id="a-type" value={f.machineType} onChange={set('machineType')} placeholder="Haematology, chemistry, immunoassay…" /></Field>
          <Field label="Protocol" htmlFor="a-proto" hint="Leave unconfirmed until verified in the manual">
            <Select id="a-proto" value={f.protocol} onChange={set('protocol')}>
              <option value="unconfirmed">Unconfirmed</option><option value="astm">ASTM (E1381/E1394)</option><option value="hl7">HL7 v2</option><option value="vendor">Vendor-specific</option>
            </Select>
          </Field>
          <Field label="Connection type" htmlFor="a-conn">
            <Select id="a-conn" value={f.connectionType} onChange={set('connectionType')}>
              <option value="none">Not set</option><option value="tcp">TCP/IP</option><option value="serial">RS-232 serial</option><option value="file">File exchange</option><option value="vendor_api">Vendor SDK / API</option>
            </Select>
          </Field>
          <Field label="Bridge ID" htmlFor="a-bridge" hint="The machine-bridge PC that talks to this analyzer"><Input id="a-bridge" value={f.bridgeId} onChange={set('bridgeId')} placeholder="lab-pc-1" /></Field>
          {f.connectionType === 'tcp' && (
            <>
              <Field label="IP address / host" htmlFor="a-host"><Input id="a-host" value={f.host} onChange={set('host')} /></Field>
              <Field label="Port" htmlFor="a-port"><Input id="a-port" type="number" min={1} max={65535} value={f.port} onChange={set('port')} /></Field>
            </>
          )}
          {f.connectionType === 'serial' && (
            <>
              <Field label="Serial port" htmlFor="a-sp"><Input id="a-sp" value={f.serialPort} onChange={set('serialPort')} placeholder="COM3" /></Field>
              <Field label="Baud rate" htmlFor="a-baud"><Input id="a-baud" type="number" value={f.baudRate} onChange={set('baudRate')} placeholder="9600" /></Field>
            </>
          )}
          <Field label="Mode" htmlFor="a-mode" hint="Demo messages are never applied to patient results">
            <Select id="a-mode" value={f.mode} onChange={set('mode')}><option value="demo">DEMO (simulated)</option><option value="live">Live</option></Select>
          </Field>
          <Field label="Integration status" htmlFor="a-int">
            <Select id="a-int" value={f.integrationStatus} onChange={set('integrationStatus')}>
              <option value="pending_documentation">Pending vendor documentation</option><option value="configured">Configured — not yet verified</option><option value="verified">Verified with real messages</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.enabled} onCheckedChange={(v) => setF((x) => ({ ...x, enabled: v }))} /> Enabled (accept messages from the bridge)</label>
          <Field label="Notes" htmlFor="a-notes" className="sm:col-span-2"><Textarea id="a-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
