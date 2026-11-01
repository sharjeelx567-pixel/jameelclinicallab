'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { ROLE_OPTIONS } from '@/constants';
import { AUTH_MODE, useAuth } from '@/features/auth/auth-provider';
import { errorMessage } from '@/lib/api-client';
import { firebaseConfigured } from '@/lib/firebase';

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

function firebaseMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'Incorrect email or password.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/user-disabled') return 'This account has been disabled. Contact the laboratory administrator.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
  return errorMessage(err);
}

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function DevLogin({ onDone }: { onDone: () => void }) {
  const { devSignIn } = useAuth();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>();
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-warning/60 bg-warning-soft p-3 text-sm text-warning">
        <Badge tone="demo" className="mb-1">Development mode</Badge>
        <p>Sign in as a seeded DEMO account. This picker exists only when the backend runs with <code>AUTH_MODE=dev</code> and is refused in production.</p>
      </div>
      <div className="grid gap-2">
        {ROLE_OPTIONS.map((r) => (
          <Button
            key={r.value}
            variant="outline"
            className="justify-between"
            loading={pending === r.value}
            disabled={!!pending}
            onClick={async () => {
              setPending(r.value);
              setError(undefined);
              try {
                await devSignIn(`dev-${r.value}`);
                onDone();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setPending(null);
              }
            }}
          >
            {r.label}
            <LogIn />
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function LoginForm() {
  const { signIn, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  React.useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Staff sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Authorised laboratory personnel only.</p>
      <div className="mt-8">
        {AUTH_MODE === 'dev' ? (
          <DevLogin onDone={() => router.replace(next)} />
        ) : !firebaseConfigured() ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-sm">
            <p className="font-medium text-destructive">Authentication is not configured</p>
            <p className="mt-1 text-muted-foreground">Set the NEXT_PUBLIC_FIREBASE_* variables (see frontend/.env.example), or run in development mode.</p>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit(async (v) => {
              setError(undefined);
              try {
                await signIn(v.email, v.password);
                router.replace(next);
              } catch (e) {
                setError(firebaseMessage(e));
              }
            })}
          >
            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" {...form.register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" {...form.register('password')} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
              Sign in
            </Button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
            </div>
          </form>
        )}
      </div>
      <p className="mt-10 text-center text-xs text-muted-foreground">There is no public sign-up. Accounts are created by the laboratory administrator.</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
