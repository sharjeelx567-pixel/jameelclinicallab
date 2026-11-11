import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Database/credential failures explained in plain words (no secrets or internals), so a
 * lab admin can see why nothing loads: daily quota used up, or the server key is wrong.
 */
export function databaseProblem(exception: unknown): [number, ErrorBody] | null {
  const e = exception as { code?: unknown; message?: unknown };
  const code = e?.code;
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (code === 8 || /RESOURCE_EXHAUSTED|quota exceeded/i.test(msg))
    return [HttpStatus.SERVICE_UNAVAILABLE, { code: 'DATABASE_QUOTA_EXCEEDED', message: 'Database daily limit reached (Firebase free plan). It resets automatically after about 1 PM Pakistan time, or upgrade Firebase to the Blaze plan.' }];
  if (code === 7 || code === 16 || code === 'app/invalid-credential' || /invalid_grant|invalid-credential|PERMISSION_DENIED|UNAUTHENTICATED|Could not load the default credentials|Failed to parse private key/i.test(msg))
    return [HttpStatus.SERVICE_UNAVAILABLE, { code: 'DATABASE_KEY_INVALID', message: 'Server cannot open the database: the Firebase service-account key in Vercel is missing, wrong or was deleted. Update it in Vercel (backend → Settings → Environment Variables) and redeploy.' }];
  if (code === 14 || code === 4 || /UNAVAILABLE|DEADLINE_EXCEEDED/.test(msg))
    return [HttpStatus.SERVICE_UNAVAILABLE, { code: 'DATABASE_UNAVAILABLE', message: 'Database is not reachable right now. Please try again in a minute.' }];
  return null;
}

/**
 * Consistent error envelope: { success: false, error: { code, message, details? } }.
 * Unexpected errors are logged server-side (without request data) and the client
 * receives a generic message — internal details never leak.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'code' in response) {
        body = response as ErrorBody;
      } else {
        const message =
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ?? exception.message);
        body = {
          code: status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          message: Array.isArray(message) ? message.join(', ') : message,
        };
      }
    } else {
      const err = exception as Error;
      this.logger.error(`${req.method} ${req.path} failed: ${err?.message ?? 'unknown'}`, err?.stack);
      const known = databaseProblem(exception);
      if (known) [status, body] = known;
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(`${req.method} ${req.path} → ${status} ${body.code}`);
    }
    res.status(status).json({ success: false, error: body });
  }
}
