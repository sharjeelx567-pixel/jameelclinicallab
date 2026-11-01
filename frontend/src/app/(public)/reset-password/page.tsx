'use client';

import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { getFirebaseAuth } from '@/lib/firebase';

/** Handles Firebase reset links when the action URL is pointed at this page (?mode=resetPassword&oobCode=…). */
function ResetForm() {
  const params = useSearchParams();
  const code = params.get('oobCode') ?? '';
  const [email, setEmail] = React.useState<string>();
  const [state, setState] = React.useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [pw, setPw] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!code) return setState('invalid');
    verifyPasswordResetCode(getFirebaseAuth(), code)
      .then((e) => {
        setEmail(e);
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, [code]);

  if (state === 'checking') return <p className="text-sm text-muted-foreground">Checking reset link…</p>;
  if (state === 'invalid')
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">This reset link is invalid or has expired.</p>
        <Button asChild className="mt-6"><Link href="/forgot-password">Request a new link</Link></Button>
      </div>
    );
  if (state === 'done')
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Password updated</h1>
        <Button asChild className="mt-6"><Link href="/login">Sign in</Link></Button>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 10) return setError('Use at least 10 characters');
        if (pw !== pw2) return setError('Passwords do not match');
        setPending(true);
        try {
          await confirmPasswordReset(getFirebaseAuth(), code, pw);
          setState('done');
        } catch {
          setError('Could not update the password. The link may have expired.');
        } finally {
          setPending(false);
        }
      }}
    >
      <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
      <p className="text-sm text-muted-foreground">For {email}</p>
      <Field label="New password" htmlFor="pw" hint="At least 10 characters">
        <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2" error={error}>
        <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetForm />
    </React.Suspense>
  );
}
