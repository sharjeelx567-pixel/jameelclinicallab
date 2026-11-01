import { randomUUID } from 'node:crypto';
import { getEnv } from '../config/env';
import { C, DataStore } from './data-store';

export interface DatabaseHealth {
  ok: boolean;
  dataBackend: 'firestore' | 'memory';
  /** false for the in-memory development store: data is lost on restart. */
  persistent: boolean;
  projectId: string | null;
  emulator: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Proves connectivity with a real round trip: writes a random token to
 * systemHealth/ping and reads it back. Initialising the SDK alone proves nothing.
 * Always the same single document, so repeated checks never grow the database.
 */
export async function checkDatabase(store: DataStore): Promise<DatabaseHealth> {
  const env = getEnv();
  const started = Date.now();
  const base = {
    dataBackend: store.kind,
    persistent: store.kind === 'firestore',
    projectId: store.kind === 'firestore' ? (env.FIREBASE_PROJECT_ID ?? null) : null,
    emulator: store.kind === 'firestore' && !!process.env.FIRESTORE_EMULATOR_HOST,
  };
  try {
    const token = randomUUID();
    await store.set(C.systemHealth, 'ping', { id: 'ping', token, at: store.now() });
    const back = await store.get<{ id: string; token: string }>(C.systemHealth, 'ping');
    const ok = back?.token === token;
    return { ...base, ok, latencyMs: Date.now() - started, ...(ok ? {} : { error: 'Read-back did not match the written value' }) };
  } catch (err) {
    const e = err as { code?: number | string; message?: string };
    // Map the common Firestore failures to an actionable, credential-free message.
    const hint =
      e.code === 7 || e.code === 'permission-denied'
        ? 'Permission denied — the service account lacks Firestore access'
        : e.code === 16 || e.code === 'unauthenticated'
          ? 'Not authenticated — check GOOGLE_APPLICATION_CREDENTIALS / service-account key'
          : e.code === 5 || e.code === 'not-found'
            ? 'Firestore database not found in this project'
            : (e.message ?? 'Unknown error').split('\n')[0].slice(0, 200);
    return { ...base, ok: false, latencyMs: Date.now() - started, error: hint };
  }
}
