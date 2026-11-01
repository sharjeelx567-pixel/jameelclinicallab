import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { from, lastValueFrom, Observable } from 'rxjs';
import { AppError, badRequest, conflict, unprocessable } from '../common/errors';
import type { AuthUser } from '../common/types';
import { C, DataStore } from '../database/data-store';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

interface IdempotencyDoc {
  id: string;
  uid: string;
  route: string;
  bodyHash: string;
  status: 'in_progress' | 'done';
  response?: unknown;
  createdAt: string;
  /** Firestore TTL policy can be enabled on this field to purge old keys. */
  expiresAt: string;
}

/**
 * Makes a POST safe to retry. When the client sends `Idempotency-Key`, the first
 * request is executed and its result stored in Firestore; a retry with the same
 * key and body gets the stored result instead of a second payment/order/stock
 * movement. Concurrent duplicates get 409 while the first is still running.
 * Requests without the header behave exactly as before.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: DataStore) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const key = req.header('idempotency-key');
    if (!key) return next.handle();
    return from(this.run(req, key, next));
  }

  private async run(req: Request & { user?: AuthUser }, key: string, next: CallHandler): Promise<unknown> {
    if (!KEY_PATTERN.test(key)) throw badRequest('IDEMPOTENCY_KEY', 'Idempotency-Key must be 8–100 letters, digits, "-" or "_"');
    const uid = req.user?.uid ?? 'anonymous';
    const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const id = createHash('sha256').update(`${uid}\n${route}\n${key}`).digest('hex').slice(0, 40);
    const bodyHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');

    const existing = await this.store.get<IdempotencyDoc>(C.idempotencyKeys, id);
    if (existing && Date.parse(existing.expiresAt) > Date.now()) return this.replay(existing, bodyHash);
    if (existing) await this.store.delete(C.idempotencyKeys, id);

    const now = this.store.now();
    try {
      await this.store.create(C.idempotencyKeys, id, { id, uid, route, bodyHash, status: 'in_progress', createdAt: now, expiresAt: new Date(Date.now() + TTL_MS).toISOString() } satisfies IdempotencyDoc);
    } catch {
      // Another identical request created the key between our read and write.
      const winner = await this.store.get<IdempotencyDoc>(C.idempotencyKeys, id);
      if (winner) return this.replay(winner, bodyHash);
      throw conflict('IDEMPOTENCY_IN_PROGRESS', 'This request is already being processed');
    }

    try {
      const response = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await this.store.update(C.idempotencyKeys, id, { status: 'done', response: response === undefined ? null : JSON.parse(JSON.stringify(response)) });
      return response;
    } catch (err) {
      // Failed requests may be retried with the same key.
      await this.store.delete(C.idempotencyKeys, id).catch(() => undefined);
      throw err;
    }
  }

  private replay(doc: IdempotencyDoc, bodyHash: string): unknown {
    if (doc.bodyHash !== bodyHash) throw unprocessable('IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used for a different request');
    if (doc.status !== 'done') throw new AppError(HttpStatus.CONFLICT, 'IDEMPOTENCY_IN_PROGRESS', 'This request is already being processed');
    return doc.response ?? undefined;
  }
}

/** Marks a POST endpoint as safely retryable with an `Idempotency-Key` header. */
export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);
