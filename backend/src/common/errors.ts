import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code and a safe user-facing message. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (entity: string) => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${entity} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
