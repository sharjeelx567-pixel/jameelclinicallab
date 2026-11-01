'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CalendarX, PackageMinus, PackagePlus, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { AsyncBoundary, LoadingRows, PageHeader } from '@/components/shared/states';
import { StatCard } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { INVENTORY_CATEGORIES } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { errorMessage } from '@/lib/api-client';
import { formatDate, formatDateTime, formatMoney, titleCase, todayKey } from '@/lib/utils';
import { inventoryService } from '@/services/admin.service';
import type { InventoryItem, InventoryTransaction } from '@/types';

const catLabel = (v: string) => INVENTORY_CATEGORIES.find((c) => c.value === v)?.label ?? v;

function stockBadge(i: InventoryItem) {
  const today = todayKey();
  if (i.expiryDate && i.expiryDate < today) return <Badge tone="danger">Expired</Badge>;
  if (i.quantity <= i.minimumLevel) return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">OK</Badge>;
}

function ItemDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const idem = useIdempotencyKey();
  const [f, setF] = React.useState({ name: '', category: 'reagent', unit: '', minimumLevel: '0', openingQuantity: '0', supplier: '', purchasePrice: '', batchNumber: '', expiryDate: '', location: '' });
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (f.name.trim().length < 2 || !f.unit.trim()) return toast.error('Enter item name and unit');
    setSaving(true);
    try {
      await inventoryService.create({
        name: f.name.trim(), category: f.category, unit: f.unit.trim(), minimumLevel: Number(f.minimumLevel) || 0, openingQuantity: Number(f.openingQuantity) || 0,
        supplier: f.supplier || undefined, purchasePrice: f.purchasePrice ? Number(f.purchasePrice) : undefined, batchNumber: f.batchNumber || undefined, expiryDate: f.expiryDate || undefined, location: f.location || undefined,
      }, idem.key());
      idem.reset();
      toast.success('Item added');
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Add inventory item</DialogTitle></DialogHeader>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="i-n" required className="sm:col-span-2"><Input id="i-n" value={f.name} onChange={set('name')} /></Field>
          <Field label="Category" htmlFor="i-c"><Select id="i-c" value={f.category} onChange={set('category')}>{INVENTORY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Unit" htmlFor="i-u" required><Input id="i-u" value={f.unit} onChange={set('unit')} placeholder="box, kit, mL, pcs" /></Field>
          <Field label="Opening stock" htmlFor="i-q"><Input id="i-q" type="number" min={0} value={f.openingQuantity} onChange={set('openingQuantity')} /></Field>
          <Field label="Minimum level" htmlFor="i-min" hint="Low-stock alert threshold"><Input id="i-min" type="number" min={0} value={f.minimumLevel} onChange={set('minimumLevel')} /></Field>
          <Field label="Supplier" htmlFor="i-s"><Input id="i-s" value={f.supplier} onChange={set('supplier')} /></Field>
          <Field label="Purchase price (PKR / unit)" htmlFor="i-p"><Input id="i-p" type="number" min={0} value={f.purchasePrice} onChange={set('purchasePrice')} /></Field>
          <Field label="Batch number" htmlFor="i-b"><Input id="i-b" value={f.batchNumber} onChange={set('batchNumber')} /></Field>
          <Field label="Expiry date" htmlFor="i-e"><Input id="i-e" type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          <Field label="Storage location" htmlFor="i-l" className="sm:col-span-2"><Input id="i-l" value={f.location} onChange={set('location')} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Add item</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const state = useApi(() => inventoryService.get(id), [id]);
  const [type, setType] = React.useState<InventoryTransaction['type']>('consume');
  const [qty, setQty] = React.useState('');
  const [note, setNote] = React.useState('');
  const [batch, setBatch] = React.useState('');
  const [expiry, setExpiry] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const moveIdem = useIdempotencyKey();
  const move = async () => {
    const n = Number(qty);
    if (!(n >= 0) || (type !== 'adjust' && n <= 0)) return toast.error('Enter a valid quantity');
    if (type === 'adjust' && note.trim().length < 3) return toast.error('Explain the reason for the adjustment');
    setPending(true);
    try {
      await inventoryService.move(id, { type, quantity: n, note: note || undefined, batchNumber: batch || undefined, expiryDate: expiry || undefined }, moveIdem.key());
      moveIdem.reset();
      toast.success('Stock updated');
      setQty('');
      setNote('');
      void state.reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-lg" aria-describedby={undefined}>
        {!state.data ? <div className="p-6"><LoadingRows /></div> : (
          <div className="flex h-full flex-col">
            <div className="border-b p-5 pr-12">
              <DialogTitle>{state.data.item.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{catLabel(state.data.item.category)} · {state.data.item.quantity} {state.data.item.unit} in stock · min {state.data.item.minimumLevel}</p>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {can('inventory.write') && (
                <div className="space-y-3 rounded-xl border p-4">
                  <p className="text-sm font-medium">Record stock movement</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={type} onChange={(e) => setType(e.target.value as InventoryTransaction['type'])} aria-label="Movement type">
                      <option value="consume">Usage / consume</option><option value="receive">Receive (purchase)</option><option value="discard">Discard (expired/damaged)</option><option value="adjust">Adjust to counted qty</option>
                    </Select>
                    <Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={type === 'adjust' ? 'Counted quantity' : 'Quantity'} aria-label="Quantity" />
                    {type === 'receive' && <><Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch no." aria-label="Batch" /><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry date" /></>}
                  </div>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required for adjustments)" rows={2} />
                  <Button size="sm" loading={pending} onClick={() => void move()}>Save movement</Button>
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium">Stock ledger</p>
                {!state.data.transactions.length ? <p className="text-sm text-muted-foreground">No movements.</p> : (
                  <ul className="divide-y text-sm">
                    {state.data.transactions.map((t) => (
                      <li key={t.id} className="py-2">
                        <div className="flex justify-between gap-2"><span>{titleCase(t.type)}</span><span className={`tabular font-medium ${t.quantity < 0 || t.type === 'consume' || t.type === 'discard' ? 'text-destructive' : 'text-success'}`}>{t.type === 'consume' || t.type === 'discard' ? '−' : t.quantity > 0 ? '+' : ''}{Math.abs(t.quantity)} → {t.balanceAfter}</span></div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(t.at)} · {t.by.name}{t.note && ` · ${t.note}`}{t.batchNumber && ` · batch ${t.batchNumber}`}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const { can } = useAuth();
  const [category, setCategory] = React.useState('');
  const state = useApi(() => inventoryService.list({ category: category || undefined }), [category]);
  const alerts = useApi(() => inventoryService.alerts(), []);
  const [adding, setAdding] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const reload = () => { void state.reload(); void alerts.reload(); };

  const columns: ColumnDef<InventoryItem, unknown>[] = [
    { accessorKey: 'name', header: 'Item', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{catLabel(row.original.category)}{row.original.location && ` · ${row.original.location}`}</p></div> },
    { accessorKey: 'quantity', header: 'In stock', cell: ({ row }) => <span className="tabular font-medium">{row.original.quantity} {row.original.unit}</span> },
    { accessorKey: 'minimumLevel', header: 'Min', cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.minimumLevel}</span> },
    { accessorKey: 'batchNumber', header: 'Batch' },
    { accessorKey: 'expiryDate', header: 'Expiry', cell: ({ getValue }) => (getValue() ? formatDate(getValue() as string) : '—') },
    { accessorKey: 'supplier', header: 'Supplier' },
    { accessorKey: 'purchasePrice', header: 'Unit price', cell: ({ getValue }) => (getValue() !== undefined ? formatMoney(getValue() as number) : '—') },
    { id: 'status', header: 'Status', cell: ({ row }) => stockBadge(row.original) },
  ];

  return (
    <div>
      <PageHeader title="Inventory" description="Reagents, consumables and supplies with batch, expiry and low-stock tracking." actions={can('inventory.write') && <Button onClick={() => setAdding(true)}><Plus /> Add item</Button>} />
      {alerts.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Low stock" value={alerts.data.lowStock.length} icon={PackageMinus} tone="warning" />
          <StatCard label="Expiring soon" value={alerts.data.expiringSoon.length} icon={AlertTriangle} tone="info" />
          <StatCard label="Expired" value={alerts.data.expired.length} icon={CalendarX} tone="danger" />
        </div>
      )}
      <AsyncBoundary state={state}>
        {(items) => (
          <DataTable
            data={items}
            columns={columns}
            searchPlaceholder="Filter items…"
            onRowClick={(i) => setSelected(i.id)}
            toolbar={<Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="sm:w-48"><option value="">All categories</option>{INVENTORY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>}
            empty={{ title: 'No inventory items', action: can('inventory.write') ? <Button size="sm" onClick={() => setAdding(true)}><PackagePlus /> Add item</Button> : undefined }}
            mobileCard={(i) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.quantity} {i.unit} · min {i.minimumLevel}{i.expiryDate && ` · exp ${formatDate(i.expiryDate)}`}</p></div>
                {stockBadge(i)}
              </div>
            )}
          />
        )}
      </AsyncBoundary>
      <ItemDialog open={adding} onOpenChange={setAdding} onDone={reload} />
      {selected && <ItemDrawer id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}
