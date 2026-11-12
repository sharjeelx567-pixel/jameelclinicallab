import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getEnv } from '../config/env';
import { AppError } from '../common/errors';
import type { Permission } from '../common/permissions';
import type { AuthUser } from '../common/types';
import { IS_PUBLIC, PERMISSIONS_KEY } from '../decorators';
import { FirebaseService } from '../firebase/firebase.service';
import { AccessService } from '../modules/auth/access.service';

const unauthorized = (message = 'Authentication required') =>
  new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message);

/**
 * Global guard:
 *  1. verifies the Firebase ID token (or a dev token in AUTH_MODE=dev),
 *  2. loads the staff profile and current role permissions from the database
 *     (never trusts role/permission claims sent by the client),
 *  3. enforces @RequirePermissions on the handler.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();

    const uid = await this.verify(token);
    // Reads (GET/HEAD) may use the short-lived profile copy; anything that changes data re-reads it.
    const user = await this.access.loadAuthUser(uid, !['GET', 'HEAD'].includes(req.method));
    if (!user) throw new AppError(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_PROVISIONED', 'Your account is not authorised for this system');
    req.user = user;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission to perform this action', {
        missing,
      });
    }
    return true;
  }

  private async verify(token: string): Promise<string> {
    const env = getEnv();
    if (env.AUTH_MODE === 'dev') {
      // DEVELOPMENT ONLY — refused in production by env validation.
      if (!token.startsWith('dev:')) throw unauthorized('Invalid development token');
      const uid = token.slice(4);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(uid)) throw unauthorized('Invalid development token');
      return uid;
    }
    try {
      // checkRevoked=true: disabled accounts and revoked sessions are rejected immediately.
      const decoded = await this.firebase.auth.verifyIdToken(token, true);
      return decoded.uid;
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'unknown';
      if (code === 'auth/id-token-expired') throw new AppError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      this.logger.warn(`Token verification failed (${code})`);
      throw unauthorized('Invalid or revoked session');
    }
  }
}
