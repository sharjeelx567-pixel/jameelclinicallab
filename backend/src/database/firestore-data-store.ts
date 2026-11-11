import { AggregateField, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import { DataStore, DocData, QueryOptions, QueryResult, StoredDoc, TransactionContext, WhereClause } from './data-store';

/** Remove undefined values — Firestore rejects them. */
function clean(data: object): DocData {
  return JSON.parse(JSON.stringify(data)) as DocData;
}

export class FirestoreDataStore extends DataStore {
  readonly kind = 'firestore' as const;

  constructor(private readonly db: Firestore) {
    super();
  }

  newId(): string {
    return this.db.collection('_ids').doc().id;
  }

  /**
   * Timestamps are generated on the API server (never the browser), so the client
   * cannot influence them. Stored as ISO-8601 UTC strings: sortable and portable.
   */
  now(): string {
    return new Date().toISOString();
  }

  private applyWhere(q: Query, where: WhereClause[] = []): Query {
    return where.reduce((acc, w) => acc.where(w.field, w.op, w.value), q);
  }

  async get<T extends StoredDoc>(collection: string, id: string): Promise<T | null> {
    const snap = await this.db.collection(collection).doc(id).get();
    return snap.exists ? ({ ...snap.data(), id: snap.id } as T) : null;
  }

  private async buildQuery(collection: string, options: QueryOptions): Promise<Query> {
    let q: Query = this.applyWhere(this.db.collection(collection), options.where);
    if (options.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
    if (options.cursor) {
      const cursorSnap = await this.db.collection(collection).doc(options.cursor).get();
      if (cursorSnap.exists) q = q.startAfter(cursorSnap);
    }
    return q;
  }

  async query<T extends StoredDoc>(collection: string, options: QueryOptions = {}): Promise<QueryResult<T>> {
    let q = await this.buildQuery(collection, options);
    const limit = options.limit;
    if (limit) q = q.limit(limit + 1);
    const snap = await q.get();
    const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    if (limit && docs.length > limit) {
      const page = docs.slice(0, limit);
      return { items: page, nextCursor: page[page.length - 1].id };
    }
    return { items: docs, nextCursor: null };
  }

  async count(collection: string, where?: WhereClause[]): Promise<number> {
    const snap = await this.applyWhere(this.db.collection(collection), where).count().get();
    return snap.data().count;
  }

  /** Server-side SUM aggregation: billed as 1 read per 1,000 matched index entries, not 1 per document. */
  async sum(collection: string, field: string, where?: WhereClause[]): Promise<number> {
    const snap = await this.applyWhere(this.db.collection(collection), where).aggregate({ total: AggregateField.sum(field) }).get();
    return snap.data().total ?? 0;
  }

  async create(collection: string, id: string, data: object): Promise<void> {
    await this.db.collection(collection).doc(id).create(clean(data));
  }

  async set(collection: string, id: string, data: object): Promise<void> {
    await this.db.collection(collection).doc(id).set(clean(data));
  }

  async update(collection: string, id: string, patch: object): Promise<void> {
    await this.db.collection(collection).doc(id).update(clean(patch));
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  async transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (t: Transaction) => {
      const ctx: TransactionContext = {
        get: async <T extends StoredDoc>(c: string, id: string) => {
          const snap = await t.get(this.db.collection(c).doc(id));
          return snap.exists ? ({ ...snap.data(), id: snap.id } as T) : null;
        },
        query: async <T extends StoredDoc>(c: string, o: QueryOptions) => {
          let q = await this.buildQuery(c, o);
          if (o.limit) q = q.limit(o.limit);
          const snap = await t.get(q);
          return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
        },
        create: (c, id, data) => void t.create(this.db.collection(c).doc(id), clean(data)),
        set: (c, id, data) => void t.set(this.db.collection(c).doc(id), clean(data)),
        update: (c, id, patch) => void t.update(this.db.collection(c).doc(id), clean(patch)),
      };
      return fn(ctx);
    });
  }
}
