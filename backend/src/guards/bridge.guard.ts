import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getEnv, parseBridgeTokenHashes } from '../config/env';
import { AppError } from '../common/errors';
import { IS_BRIDGE } from '../decorators';
import { safeEqualHex, sha256 } from '../utils';

export interface BridgeRequest extends Request {
  bridgeId?: string;
}

/**
 * Authenticates the on-premise machine-bridge. Each bridge holds a random token;
 * the backend only stores its SHA-256 hash (BRIDGE_TOKEN_HASHES). Headers:
 *   X-Bridge-Id: <bridgeId>
 *   Authorization: Bridge <token>
 */
@Injectable()
export class BridgeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(IS_BRIDGE, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<BridgeRequest>();
    const bridgeId = String(req.headers['x-bridge-id'] ?? '');
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bridge ') ? auth.slice(7).trim() : '';
    const expected = parseBridgeTokenHashes(getEnv().BRIDGE_TOKEN_HASHES).get(bridgeId);
    if (!bridgeId || !token || !expected || !safeEqualHex(sha256(token), expected)) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'BRIDGE_UNAUTHENTICATED', 'Bridge authentication failed');
    }
    req.bridgeId = bridgeId;
    return true;
  }
}
