'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from 'firebase/auth';

/**
 * Firebase Web SDK (PUBLIC config only). Admin credentials never exist in this
 * application — privileged operations go through the backend API.
 */
let auth: Auth | null = null;

export const firebaseConfigured = () => !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  if (!firebaseConfigured()) throw new Error('Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local');
  const app: FirebaseApp = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
  auth = getAuth(app);
  // Session-scoped persistence: closing the browser ends the session on shared lab PCs.
  void setPersistence(auth, browserSessionPersistence);
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR) connectAuthEmulator(auth, process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR, { disableWarnings: true });
  return auth;
}
