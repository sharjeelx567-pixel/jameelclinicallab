import { Injectable, Logger } from '@nestjs/common';
import { App, cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getEnv } from '../config/env';

/**
 * The ONLY place Firebase Admin credentials are used. Never import this from
 * anywhere that ends up in the frontend — the frontend is a separate app and
 * only uses the public Firebase Web SDK config for sign-in.
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;

  private getApp(): App {
    if (this.app) return this.app;
    const existing = getApps()[0];
    if (existing) return (this.app = existing);

    const env = getEnv();
    const credential =
      env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY
        ? cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          })
        : applicationDefault();

    this.app = initializeApp({
      credential,
      projectId: env.FIREBASE_PROJECT_ID,
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });
    this.logger.log(`Firebase Admin initialised for project "${env.FIREBASE_PROJECT_ID ?? '(default)'}"`);
    return this.app;
  }

  get firestore(): Firestore {
    return getFirestore(this.getApp());
  }

  get auth(): Auth {
    return getAuth(this.getApp());
  }

  get bucket() {
    const env = getEnv();
    if (!env.FIREBASE_STORAGE_BUCKET) return null;
    return getStorage(this.getApp()).bucket(env.FIREBASE_STORAGE_BUCKET);
  }
}
