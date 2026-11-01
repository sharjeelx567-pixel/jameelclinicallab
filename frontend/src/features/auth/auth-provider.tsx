'use client';

import { onIdTokenChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { api, ApiError, configureApiClient } from '@/lib/api-client';
import { getFirebaseAuth } from '@/lib/firebase';
import type { Me } from '@/types';

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === 'dev' ? 'dev' : 'firebase';
const DEV_KEY = 'jcl.devUid';
/** Idle timeout for shared laboratory workstations. */
const IDLE_MS = 30 * 60_000;

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: Me | null;
  can: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  devSignIn: (uid: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<AuthState['status']>('loading');
  const [user, setUser] = React.useState<Me | null>(null);
  const fbUser = React.useRef<User | null>(null);
  const devUid = React.useRef<string | null>(null);

  const getToken = React.useCallback(async () => {
    if (AUTH_MODE === 'dev') return devUid.current ? `dev:${devUid.current}` : null;
    return fbUser.current ? fbUser.current.getIdToken() : null;
  }, []);

  const clear = React.useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const loadMe = React.useCallback(async () => {
    try {
      setUser(await api.get<Me>('/auth/me'));
      setStatus('authenticated');
    } catch (err) {
      clear();
      if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_PROVISIONED') toast.error(err.message);
      throw err;
    }
  }, [clear]);

  const signOut = React.useCallback(
    async (reason?: string) => {
      await api.post('/auth/session-events', { event: 'logout' }).catch(() => undefined);
      if (AUTH_MODE === 'dev') {
        devUid.current = null;
        sessionStorage.removeItem(DEV_KEY);
      } else {
        await fbSignOut(getFirebaseAuth()).catch(() => undefined);
        fbUser.current = null;
      }
      clear();
      if (reason) toast.info(reason);
      router.replace('/login');
    },
    [clear, router],
  );

  React.useEffect(() => {
    configureApiClient({
      getToken,
      onUnauthenticated: (code) => {
        if (code === 'SESSION_EXPIRED' || code === 'UNAUTHENTICATED') void signOut('Your session has ended. Please sign in again.');
      },
    });
  }, [getToken, signOut]);

  // Restore session
  React.useEffect(() => {
    if (AUTH_MODE === 'dev') {
      devUid.current = sessionStorage.getItem(DEV_KEY);
      if (devUid.current) loadMe().catch(() => sessionStorage.removeItem(DEV_KEY));
      else setStatus('unauthenticated');
      return;
    }
    let unsub = () => undefined as void;
    try {
      unsub = onIdTokenChanged(getFirebaseAuth(), (u) => {
        fbUser.current = u;
        if (u) loadMe().catch(() => undefined);
        else clear();
      });
    } catch {
      setStatus('unauthenticated');
    }
    return () => unsub();
  }, [clear, loadMe]);

  // Idle logout
  React.useEffect(() => {
    if (status !== 'authenticated') return;
    let timer = setTimeout(() => void signOut('Signed out after 30 minutes of inactivity.'), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void signOut('Signed out after 30 minutes of inactivity.'), IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [status, signOut]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      fbUser.current = cred.user;
      await loadMe();
      await api.post('/auth/session-events', { event: 'login' }).catch(() => undefined);
    },
    [loadMe],
  );

  const devSignIn = React.useCallback(
    async (uid: string) => {
      devUid.current = uid;
      sessionStorage.setItem(DEV_KEY, uid);
      await loadMe();
      await api.post('/auth/session-events', { event: 'login' }).catch(() => undefined);
    },
    [loadMe],
  );

  const value = React.useMemo<AuthState>(
    () => ({ status, user, can: (p) => !!user?.permissions.includes(p), signIn, devSignIn, signOut, refresh: loadMe }),
    [status, user, signIn, devSignIn, signOut, loadMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
