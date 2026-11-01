/**
 * Provision the FIRST Super Admin in a real Firebase project (there is no public signup).
 *
 *   1. Create the user in Firebase Console → Authentication (email + password).
 *   2. npm run bootstrap:admin -- --email admin@yourlab.pk --name "Full Name"
 *
 * Further staff accounts are created from the app (Staff → Add staff).
 */
import 'reflect-metadata';
import { loadDotEnv } from '../config/load-dotenv';

async function run() {
  loadDotEnv();
  const { FirebaseService } = await import('../firebase/firebase.service');
  const { FirestoreDataStore } = await import('../database/firestore-data-store');
  const { C } = await import('../database/data-store');

  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = arg('email');
  const name = arg('name');
  if (!email || !name) throw new Error('Usage: npm run bootstrap:admin -- --email <email> --name "<full name>"');

  const firebase = new FirebaseService();
  const record = await firebase.auth.getUserByEmail(email);
  const store = new FirestoreDataStore(firebase.firestore);
  const now = store.now();
  await store.set(C.users, record.uid, { id: record.uid, email: email.toLowerCase(), displayName: name, role: 'super_admin', status: 'active', createdAt: now, updatedAt: now });
  await store.create(C.auditLogs, store.newId(), { action: 'user.bootstrap_super_admin', entity: 'user', entityId: record.uid, actor: { uid: 'system', name: 'bootstrap script', role: 'system' }, at: now });
  console.warn(`Super Admin provisioned for ${email} (uid ${record.uid}).`);
}

run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
