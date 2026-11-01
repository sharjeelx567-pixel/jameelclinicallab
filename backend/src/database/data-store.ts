/**
 * Storage abstraction used by every domain module.
 *
 * Production implementation: FirestoreDataStore (Cloud Firestore via Admin SDK).
 * Development/test implementation: MemoryDataStore (clearly labelled, non-persistent).
 *
 * Keeping the interface narrow means business rules are written once and run
 * identically against both stores, which is what lets the workflow tests run
 * without a live Firebase project.
 */

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';

export interface WhereClause {
  field: string;
  op: WhereOp;
  value: unknown;
}

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
  /** Document id to start after (cursor pagination). */
  cursor?: string;
}

export interface QueryResult<T> {
  items: T[];
  nextCursor: string | null;
}

export type DocData = Record<string, unknown>;

export interface StoredDoc {
  id: string;
}

export interface TransactionContext {
  get<T extends StoredDoc>(collection: string, id: string): Promise<T | null>;
  /** Reads inside a transaction must happen before any write (Firestore rule). */
  query<T extends StoredDoc>(collection: string, options: QueryOptions): Promise<T[]>;
  create(collection: string, id: string, data: object): void;
  set(collection: string, id: string, data: object): void;
  update(collection: string, id: string, patch: object): void;
}

export abstract class DataStore {
  abstract readonly kind: 'firestore' | 'memory';
  abstract newId(): string;
  abstract now(): string;
  abstract get<T extends StoredDoc>(collection: string, id: string): Promise<T | null>;
  abstract query<T extends StoredDoc>(collection: string, options?: QueryOptions): Promise<QueryResult<T>>;
  abstract count(collection: string, where?: WhereClause[]): Promise<number>;
  abstract create(collection: string, id: string, data: object): Promise<void>;
  abstract update(collection: string, id: string, patch: object): Promise<void>;
  abstract set(collection: string, id: string, data: object): Promise<void>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}

/** Firestore collection names — single source of truth (see docs/DATA_MODEL.md). */
export const C = {
  users: 'users',
  roles: 'roles',
  loginActivity: 'loginActivity',
  patients: 'patients',
  doctors: 'doctors',
  tests: 'tests',
  testCategories: 'testCategories',
  orders: 'orders',
  samples: 'samples',
  results: 'results',
  resultVersions: 'resultVersions',
  reports: 'reports',
  reportPrints: 'reportPrints',
  payments: 'payments',
  insurancePanels: 'insurancePanels',
  homeSamplingRequests: 'homeSamplingRequests',
  analyzers: 'analyzers',
  analyzerMessages: 'analyzerMessages',
  inventoryItems: 'inventoryItems',
  inventoryTransactions: 'inventoryTransactions',
  notifications: 'notifications',
  auditLogs: 'auditLogs',
  laboratorySettings: 'laboratorySettings',
  counters: 'counters',
  labelPrints: 'labelPrints',
  mediaAssets: 'mediaAssets',
  idempotencyKeys: 'idempotencyKeys',
  systemHealth: 'systemHealth',
} as const;
