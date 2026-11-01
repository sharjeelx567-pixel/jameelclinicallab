import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
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
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(`${req.method} ${req.path} → ${status} ${body.code}`);
    }
    res.status(status).json({ success: false, error: body });
  }
}
