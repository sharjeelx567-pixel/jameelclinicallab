import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map, tap } from 'rxjs';
import type { AuthUser } from '../common/types';

/** Wraps JSON responses as { success: true, data }. Streams (PDFs) pass through untouched. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data: unknown) => (data instanceof StreamableFile ? data : { success: true, data: data ?? null })));
  }
}

/**
 * Structured request log. Deliberately records NO request bodies, query strings
 * or patient identifiers — only method, route, status, duration and user id.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            JSON.stringify({ method: req.method, route, status: res.statusCode, ms: Date.now() - started, uid: req.user?.uid }),
          ),
      }),
    );
  }
}
