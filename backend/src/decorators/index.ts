import { applyDecorators, Body, createParamDecorator, ExecutionContext, Query, SetMetadata } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import type { Permission } from '../common/permissions';
import type { AuthUser, RequestMeta } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const IS_BRIDGE = 'isBridge';

/** Skip Firebase user authentication (e.g. health check, public report verification). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Endpoint is called by the machine-bridge (device token) rather than a user. */
export const BridgeOnly = () => applyDecorators(SetMetadata(IS_PUBLIC, true), SetMetadata(IS_BRIDGE, true));

/** User must hold ALL listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 200) };
});

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

/** Validated request body + Swagger documentation from the same Zod schema. */
export const ZodBody = <T extends z.ZodType>(schema: T) => Body(new ZodValidationPipe(schema));
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: jsonSchema(schema) as never });

/** Validated query string. */
export const ZodQuery = <T extends z.ZodType>(schema: T) => Query(new ZodValidationPipe(schema));
export const ApiZodQuery = (schema: z.ZodObject) =>
  applyDecorators(
    ...Object.keys(schema.shape).map((name) => ApiQuery({ name, required: false, type: String })),
  );
