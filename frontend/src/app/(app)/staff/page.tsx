'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Save, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/shared/cloud-image';
import { DataTable } from '@/components/shared/data-table';
import { ImageUploader } from '@/components/shared/image-uploader';
import { AsyncBoundary, LoadingRows, PageHeader } from '@/components/shared/states';
import { DemoBadge } from '@/components/shared/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { ROLE_OPTIONS } from '@/constants';
import { useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/utils';
import { usersService } from '@/services/admin.service';
import type { RoleId, StaffUser } from '@/types';

const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

function AddStaffDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [f, setF] = React.useState({ displayName: '', email: '', role: 'receptionist', phone: '', department: '', initialPassword: '' });
  const [saving, setSaving] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (f.displayName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email)) return toast.error('Enter a name and a valid email');
    if (f.initialPassword.length < 10) return toast.error('Initial password must be at least 10 characters');
    setSaving(true);
    try {
      await usersService.create({ ...f, role: f.role as RoleId, displayName: f.displayName.trim(), phone: f.phone || undefined, department: f.department || undefined });
      toast.success('Staff account created. Share the initial password securely and ask them to change it.');
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
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add staff member</DialogTitle><DialogDescription>Creates a Firebase Authentication account and assigns a role. There is no self-signup.</DialogDescription></DialogHeader>
        <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="s-n" required><Input id="s-n" value={f.displayName} onChange={set('displayName')} /></Field>
          <Field label="Email" htmlFor="s-e" required><Input id="s-e" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Role" htmlFor="s-r" required><Select id="s-r" value={f.role} onChange={set('role')}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
          <Field label="Department" htmlFor="s-d"><Input id="s-d" value={f.department} onChange={set('department')} /></Field>
          <Field label="Phone" htmlFor="s-p"><Input id="s-p" type="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Initial password" htmlFor="s-pw" required hint="Min 10 characters"><Input id="s-pw" type="password" autoComplete="new-password" value={f.initialPassword} onChange={set('initialPassword')} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} onClick={() => void save()}>Create account</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffDrawer({ user, onClose, onChanged }: { user: StaffUser; onClose: () => void; onChanged: () => void }) {
  const { user: me, can } = useAuth();
  const activity = useApi(can('audit.read') ? () => usersService.activity(user.id) : null, [user.id]);
  const [role, setRole] = React.useState(user.role);
  const [photo, setPhoto] = React.useState(user.photo ?? null);
  const self = me?.uid === user.id;
  const update = async (body: Parameters<typeof usersService.update>[1], msg: string) => {
    try {
      await usersService.update(user.id, body);
      toast.success(msg);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{user.displayName}</DialogTitle><DialogDescription>{user.email}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-5">
          <ImageUploader category="staff_profile" ownerId={user.id} current={photo} editable={can('users.manage') || self} onChange={(p) => { setPhoto(p); onChanged(); }} shape="circle" label="Profile photo" />
          {can('users.manage') && !self && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Role" htmlFor="u-role" className="flex-1"><Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as RoleId)}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
              <Button disabled={role === user.role} onClick={() => void update({ role }, 'Role updated')}>Change role</Button>
            </div>
          )}
          {self && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">You cannot change your own role or status.</p>}
          <div>
            <p className="mb-2 text-sm font-medium">Recent activity</p>
            {!can('audit.read') ? <p className="text-sm text-muted-foreground">Requires audit permission.</p> : !activity.data ? <LoadingRows rows={3} /> : !activity.data.length ? <p className="text-sm text-muted-foreground">No activity.</p> : (
              <ul className="max-h-64 divide-y overflow-y-auto text-sm">
                {activity.data.map((a) => <li key={a.id} className="py-1.5"><span>{titleCase(a.action.replace(/\./g, ' '))}</span> <span className="text-xs text-muted-foreground">{formatDateTime(a.at)}</span></li>)}
              </ul>
            )}
          </div>
        </DialogBody>
        {can('users.manage') && !self && (
          <DialogFooter>
            {user.status === 'active' ? (
              <Button variant="destructive" onClick={() => void update({ status: 'disabled' }, 'Account disabled and sessions revoked')}>Disable account</Button>
            ) : (
              <Button onClick={() => void update({ status: 'active' }, 'Account re-enabled')}>Enable account</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RolesMatrix() {
  const { can } = useAuth();
  const state = useApi(() => usersService.roles(), []);
  const [draft, setDraft] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (state.data) setDraft(Object.fromEntries(state.data.roles.map((r) => [r.id, r.permissions])));
  }, [state.data]);
  if (!state.data) return <LoadingRows />;
  const perms = Object.entries(state.data.permissions);
  const groups = [...new Set(perms.map(([k]) => k.split('.')[0]))];
  const editable = can('roles.manage');
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Permissions are enforced by the backend on every request. Changes take effect within seconds and are audited.</p>
      <div className="scrollbar-thin overflow-x-auto glass rounded-2xl ">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 bg-muted/80 text-xs">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Permission</th>
              {state.data.roles.map((r) => (
                <th key={r.id} className="px-2 py-3 text-center font-semibold">
                  <span className="block">{roleLabel(r.id).split(' /')[0]}</span>
                  {editable && (
                    <Button size="sm" variant="ghost" className="mt-1 h-6 px-2 text-[11px]" loading={saving === r.id} disabled={JSON.stringify([...(draft[r.id] ?? [])].sort()) === JSON.stringify([...r.permissions].sort())}
                      onClick={async () => {
                        setSaving(r.id);
                        try {
                          await usersService.updateRole(r.id, draft[r.id]);
                          toast.success(`${roleLabel(r.id)} permissions saved`);
                          void state.reload();
                        } catch (err) {
                          toast.error(errorMessage(err));
                        } finally {
                          setSaving(null);
                        }
                      }}
                    ><Save className="size-3" /> Save</Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr className="bg-muted/30"><td colSpan={state.data!.roles.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titleCase(g.replace(/([A-Z])/g, ' $1'))}</td></tr>
                {perms.filter(([k]) => k.startsWith(`${g}.`)).map(([k, label]) => (
                  <tr key={k} className="border-t">
                    <td className="px-3 py-2"><span className="block">{label}</span><span className="font-mono text-[11px] text-muted-foreground">{k}</span></td>
                    {state.data!.roles.map((r) => (
                      <td key={r.id} className="px-2 py-2 text-center">
                        <Checkbox
                          checked={draft[r.id]?.includes(k) ?? false}
                          disabled={!editable}
                          aria-label={`${roleLabel(r.id)}: ${label}`}
                          onCheckedChange={(v) => setDraft((d) => ({ ...d, [r.id]: v ? [...(d[r.id] ?? []), k] : (d[r.id] ?? []).filter((p) => p !== k) }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const { can } = useAuth();
  const state = useApi(() => usersService.list(), []);
  const [adding, setAdding] = React.useState(false);
  const [selected, setSelected] = React.useState<StaffUser | null>(null);
  const columns: ColumnDef<StaffUser, unknown>[] = [
    { accessorKey: 'displayName', header: 'Name', cell: ({ row }) => <div className="flex items-center gap-3"><Avatar photo={row.original.photo} name={row.original.displayName} size={32} /><div className="min-w-0"><p className="font-medium">{row.original.displayName} {row.original.isDemo && <DemoBadge />}</p><p className="text-xs text-muted-foreground">{row.original.email}</p></div></div> },
    { accessorKey: 'role', header: 'Role', cell: ({ getValue }) => roleLabel(String(getValue())) },
    { accessorKey: 'department', header: 'Department' },
    { accessorKey: 'phone', header: 'Contact' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => (getValue() === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>) },
    { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => formatDateTime(getValue() as string) },
  ];
  return (
    <div>
      <PageHeader title="Staff & roles" description="Accounts, role assignment and permission configuration." actions={can('users.manage') && <Button onClick={() => setAdding(true)}><UserPlus /> Add staff</Button>} />
      <Tabs defaultValue="staff">
        <TabsList><TabsTrigger value="staff">Staff accounts</TabsTrigger><TabsTrigger value="roles">Roles & permissions</TabsTrigger></TabsList>
        <TabsContent value="staff">
          <AsyncBoundary state={state}>
            {(users) => (
              <DataTable data={users} columns={columns} onRowClick={setSelected} searchPlaceholder="Filter staff…"
                mobileCard={(u) => <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{u.displayName}</p><p className="break-all text-xs text-muted-foreground">{roleLabel(u.role)} · {u.email}</p></div>{u.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Disabled</Badge>}</div>}
              />
            )}
          </AsyncBoundary>
        </TabsContent>
        <TabsContent value="roles">
          <Card>
            <CardHeader><div><CardTitle>Permission matrix</CardTitle><CardDescription>Super Admin always retains account and role management to prevent lock-out.</CardDescription></div></CardHeader>
            <CardContent><RolesMatrix /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AddStaffDialog open={adding} onOpenChange={setAdding} onDone={state.reload} />
      {selected && <StaffDrawer user={selected} onClose={() => setSelected(null)} onChanged={state.reload} />}
    </div>
  );
}
