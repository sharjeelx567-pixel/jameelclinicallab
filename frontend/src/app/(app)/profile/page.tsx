'use client';

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { KeyRound, LogIn, LogOut } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ImageUploader } from '@/components/shared/image-uploader';
import { DetailList, LoadingRows, PageHeader } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form-controls';
import { AUTH_MODE, useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { getFirebaseAuth } from '@/lib/firebase';
import { formatDateTime } from '@/lib/utils';
import { authService } from '@/services/admin.service';

function ChangePassword() {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [pending, setPending] = React.useState(false);
  if (AUTH_MODE === 'dev') return <p className="text-sm text-muted-foreground">Not available for development demo accounts.</p>;
  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(undefined);
        if (next.length < 10) return setError('New password must be at least 10 characters');
        if (next !== confirm) return setError('Passwords do not match');
        const user = getFirebaseAuth().currentUser;
        if (!user?.email) return setError('Session not found — sign in again');
        setPending(true);
        try {
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
          await updatePassword(user, next);
          toast.success('Password changed');
          setCurrent('');
          setNext('');
          setConfirm('');
        } catch (err) {
          const code = (err as { code?: string }).code;
          setError(code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Current password is incorrect' : code === 'auth/weak-password' ? 'Choose a stronger password' : 'Could not change password. Try again.');
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New password" htmlFor="np" hint="At least 10 characters"><Input id="np" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Field label="Confirm new password" htmlFor="np2" error={error}><Input id="np2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      <Button type="submit" loading={pending} className="justify-self-start"><KeyRound /> Change password</Button>
    </form>
  );
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const activity = useApi(() => authService.loginActivity(), []);
  if (!user) return <LoadingRows />;
  return (
    <div>
      <PageHeader title="My profile & security" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <ImageUploader category="staff_profile" ownerId={user.uid} current={user.photo} editable onChange={() => void refresh()} shape="circle" label="Profile photo" />
            <DetailList items={[['Name', user.displayName], ['Email', user.email], ['Role', <Badge key="r" tone="primary">{user.roleLabel}</Badge>], ['Permissions', `${user.permissions.length} granted by role`]]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Change password</CardTitle><CardDescription>You will be asked for your current password.</CardDescription></div></CardHeader>
          <CardContent><ChangePassword /></CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Login activity</CardTitle></CardHeader>
          <CardContent>
            {!activity.data ? <LoadingRows rows={3} /> : !activity.data.length ? <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p> : (
              <ul className="divide-y text-sm">
                {activity.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">{a.event === 'login' ? <LogIn className="size-4 text-success" /> : <LogOut className="size-4 text-muted-foreground" />}{a.event === 'login' ? 'Signed in' : 'Signed out'}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.at)}{a.ip && ` · ${a.ip}`}{a.userAgent && ` · ${a.userAgent.slice(0, 60)}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
