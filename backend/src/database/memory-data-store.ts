import { randomUUID } from 'node:crypto';
import {
  DataStore,
  DocData,
  QueryOptions,
  QueryResult,
  StoredDoc,
  TransactionContext,
  WhereClause,
} from './data-store';

type Table = Map<string, DocData>;

function getField(doc: DocData, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, doc);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function matches(doc: DocData, clause: WhereClause): boolean {
  const v = getField(doc, clause.field);
  switch (clause.op) {
    case '==':
      return v === clause.value;
    case '!=':
      return v !== clause.value;
    case '<':
      return v !== undefined && compare(v, clause.value) < 0;
    case '<=':
      return v !== undefined && compare(v, clause.value) <= 0;
    case '>':
      return v !== undefined && compare(v, clause.value) > 0;
    case '>=':
      return v !== undefined && compare(v, clause.value) >= 0;
    case 'array-contains':
      return Array.isArray(v) && v.includes(clause.value);
    case 'in':
      return Array.isArray(clause.value) && clause.value.includes(v);
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * DEVELOPMENT / TEST ONLY. Non-persistent, single-process store.
 * Refused in production by env validation.
 */
export class MemoryDataStore extends DataStore {
  readonly kind = 'memory' as const;
  private readonly tables = new Map<string, Table>();
  private lock: Promise<void> = Promise.resolve();
  private clock = 0;

  private table(name: string): Table {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  newId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 20);
  }

  /** Strictly increasing ISO timestamps so ordering is deterministic in tests. */
  now(): string {
    const t = Math.max(Date.now(), this.clock + 1);
    this.clock = t;
    return new Date(t).toISOString();
  }

  async get<T extends StoredDoc>(collection: string, id: string): Promise<T | null> {
    const doc = this.table(collection).get(id);
    return doc ? ({ ...clone(doc), id } as unknown as T) : null;
  }

  private runQuery(collection: string, options: QueryOptions = {}): Array<DocData & { id: string }> {
    let rows = [...this.table(collection).entries()].map(([id, d]) => ({ ...clone(d), id }));
    for (const clause of options.where ?? []) rows = rows.filter((r) => matches(r, clause));
    if (options.orderBy) {
      const { field, direction = 'asc' } = options.orderBy;
      rows.sort((a, b) => compare(getField(a, field), getField(b, field)) * (direction === 'asc' ? 1 : -1));
    }
    return rows;
  }

  async query<T extends StoredDoc>(collection: string, options: QueryOptions = {}): Promise<QueryResult<T>> {
    let rows = this.runQuery(collection, options);
    if (options.cursor) {
      const idx = rows.findIndex((r) => r.id === options.cursor);
      rows = idx >= 0 ? rows.slice(idx + 1) : [];
    }
    const limit = options.limit ?? rows.length;
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit && page.length ? page[page.length - 1].id : null;
    return { items: page as unknown as T[], nextCursor };
  }

  async count(collection: string, where?: WhereClause[]): Promise<number> {
    return this.runQuery(collection, { where }).length;
  }

  async create(collection: string, id: string, data: object): Promise<void> {
    const t = this.table(collection);
    if (t.has(id)) throw new Error(`Document ${collection}/${id} already exists`);
    t.set(id, clone(data) as DocData);
  }

  async set(collection: string, id: string, data: object): Promise<void> {
    this.table(collection).set(id, clone(data) as DocData);
  }

  async update(collection: string, id: string, patch: object): Promise<void> {
    const t = this.table(collection);
    const existing = t.get(id);
    if (!existing) throw new Error(`Document ${collection}/${id} not found`);
    t.set(id, { ...existing, ...(clone(patch) as DocData) });
  }

  async delete(collection: string, id: string): Promise<void> {
    this.table(collection).delete(id);
  }

  async transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    // Serialise transactions; stage writes and apply only if fn resolves.
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((r) => (release = r));
    await previous;
    try {
      const writes: Array<() => void> = [];
      const pendingCreates = new Set<string>();
      const tx: TransactionContext = {
        get: (c, id) => this.get(c, id),
        query: async (c, o) => (await this.query(c, o)).items as never,
        create: (c, id, data) => {
          const key = `${c}/${id}`;
          if (this.table(c).has(id) || pendingCreates.has(key)) throw new Error(`Document ${key} already exists`);
          pendingCreates.add(key);
          writes.push(() => this.table(c).set(id, clone(data) as DocData));
        },
        set: (c, id, data) => writes.push(() => this.table(c).set(id, clone(data) as DocData)),
        update: (c, id, patch) =>
          writes.push(() => {
            const existing = this.table(c).get(id);
            if (!existing) throw new Error(`Document ${c}/${id} not found`);
            this.table(c).set(id, { ...existing, ...(clone(patch) as DocData) });
          }),
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    } finally {
      release();
    }
  }
}
