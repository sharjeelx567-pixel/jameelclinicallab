import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QueuedMessage {
  id: string; // sha256(analyzerId + raw) — same key the backend uses for dedupe
  analyzerId: string;
  protocol: 'astm' | 'hl7';
  isDemo: boolean;
  raw: string;
  sampleIdentifier?: string;
  results: Array<{ analyzerTestCode: string; value: string; unit?: string; flags?: string }>;
  parseErrors: string[];
  receivedAt: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

/**
 * Durable on-disk queue. A message is written (atomically, via rename) BEFORE the
 * analyzer is acknowledged at application level, so nothing is lost if the PC or
 * network goes down. Files are removed only after the backend confirms receipt.
 * Messages the backend permanently rejects move to `failed/` for manual review.
 */
export class FileQueue {
  private readonly pending: string;
  private readonly failed: string;

  constructor(dir: string) {
    this.pending = join(dir, 'pending');
    this.failed = join(dir, 'failed');
    mkdirSync(this.pending, { recursive: true });
    mkdirSync(this.failed, { recursive: true });
  }

  static idFor(analyzerId: string, raw: string): string {
    return createHash('sha256').update(`${analyzerId}\n${raw}`).digest('hex');
  }

  /** Returns false if an identical message is already queued (duplicate). */
  enqueue(msg: Omit<QueuedMessage, 'id' | 'attempts' | 'nextAttemptAt'>): { id: string; duplicate: boolean } {
    const id = FileQueue.idFor(msg.analyzerId, msg.raw);
    const file = join(this.pending, `${id}.json`);
    if (existsSync(file) || existsSync(join(this.failed, `${id}.json`))) return { id, duplicate: true };
    const full: QueuedMessage = { ...msg, id, attempts: 0, nextAttemptAt: 0 };
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(full), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, file);
    return { id, duplicate: false };
  }

  due(now = Date.now()): QueuedMessage[] {
    return this.all()
      .filter((m) => m.nextAttemptAt <= now)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  all(): QueuedMessage[] {
    return readdirSync(this.pending)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(join(this.pending, f), 'utf8')) as QueuedMessage];
        } catch {
          return [];
        }
      });
  }

  depth(): { pending: number; failed: number } {
    return {
      pending: readdirSync(this.pending).filter((f) => f.endsWith('.json')).length,
      failed: readdirSync(this.failed).filter((f) => f.endsWith('.json')).length,
    };
  }

  ack(id: string): void {
    const file = join(this.pending, `${id}.json`);
    if (existsSync(file)) unlinkSync(file);
  }

  retryLater(msg: QueuedMessage, error: string): void {
    const attempts = msg.attempts + 1;
    // Exponential backoff capped at 10 minutes; retries continue indefinitely.
    const delay = Math.min(600_000, 2000 * 2 ** Math.min(attempts, 12));
    const next: QueuedMessage = { ...msg, attempts, nextAttemptAt: Date.now() + delay, lastError: error.slice(0, 300) };
    const file = join(this.pending, `${msg.id}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(next), 'utf8');
    renameSync(`${file}.tmp`, file);
  }

  moveToFailed(msg: QueuedMessage, error: string): void {
    const src = join(this.pending, `${msg.id}.json`);
    writeFileSync(join(this.failed, `${msg.id}.json`), JSON.stringify({ ...msg, lastError: error.slice(0, 500) }), 'utf8');
    if (existsSync(src)) unlinkSync(src);
  }
}
