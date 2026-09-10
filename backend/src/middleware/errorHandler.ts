import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

/** Catches any request that matched no route. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Prisma throws objects carrying a `code` like "P2002". Detected structurally so
 *  this module does not need the generated Prisma client at import time. */
function isPrismaKnownError(err: unknown): err is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

function mapPrismaError(err: { code: string; meta?: Record<string, unknown> }): AppError {
  const target = Array.isArray(err.meta?.target)
    ? (err.meta.target as string[]).join(', ')
    : String(err.meta?.target ?? 'field');

  switch (err.code) {
    case 'P2002':
      return AppError.conflict(`A record with this ${target} already exists`);
    case 'P2003':
      return AppError.badRequest('Related record does not exist');
    case 'P2025':
      return AppError.notFound('Record not found');
    case 'P2024':
      // Connection pool exhausted — the database is up but saturated. This is
      // a capacity problem, not a bug in the request, so it gets a 503 and a
      // message a client can act on rather than a generic 500.
      return new AppError(503, 'The server is busy. Please retry in a moment.');
    case 'P2034':
      // Write conflict or deadlock in a transaction; retrying usually succeeds.
      return AppError.conflict('That record was being changed by someone else. Please try again.');
    default:
      return AppError.internal('Database error');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let normalised: AppError;

  if (err instanceof AppError) {
    normalised = err;
  } else if (err instanceof ZodError) {
    normalised = AppError.badRequest(
      'Validation failed',
      err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    );
  } else if (isPrismaKnownError(err)) {
    normalised = mapPrismaError(err);
  } else if (err instanceof SyntaxError && 'body' in err) {
    normalised = AppError.badRequest('Request body is not valid JSON');
  } else {
    normalised = AppError.internal();
  }

  // Unexpected failures always get logged; expected ones only in development.
  if (!(err instanceof AppError) || normalised.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(normalised.statusCode).json({
    success: false,
    message: normalised.message,
    ...(normalised.details ? { details: normalised.details } : {}),
    ...(env.isProd ? {} : { stack: (err as Error)?.stack }),
  });
}
