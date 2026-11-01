'use client';

import { sendPasswordResetEmail } from 'firebase/auth';
import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { AUTH_MODE } from '@/features/auth/auth-provider';
import { getFirebaseAuth } from '@/lib/firebase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();

  return (
    <div>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
      {sent ? (
        <div className="glass mt-6 rounded-2xl p-5 text-sm">
          <MailCheck className="mb-2 size-6 text-success" />
          If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox and follow the link to choose a new password.
        </div>
      ) : AUTH_MODE === 'dev' ? (
        <p className="mt-4 text-sm text-muted-foreground">Password reset is not available in development mode (demo accounts have no passwords).</p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address');
            setPending(true);
            setError(undefined);
            try {
              await sendPasswordResetEmail(getFirebaseAuth(), email, { url: `${window.location.origin}/login` });
            } catch (err) {
              // Don't reveal whether the account exists, but surface real failures.
              const code = (err as { code?: string }).code;
              if (code && code !== 'auth/user-not-found') {
                setError(code === 'auth/too-many-requests' ? 'Too many requests. Try again later.' : 'Could not send the reset email. Try again.');
                setPending(false);
                return;
              }
            }
            setPending(false);
            setSent(true);
          }}
        >
          <p className="text-sm text-muted-foreground">Enter the email address of your staff account.</p>
          <Field label="Email" htmlFor="email" error={error}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>Send reset link</Button>
        </form>
      )}
    </div>
  );
}
