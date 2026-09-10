import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt';

/**
 * Verifies the bearer token and attaches the caller to `req.user`.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token body. That costs one indexed primary-key lookup and buys
 * immediate effect for role changes and account deactivation — otherwise a
 * disabled employee would keep full access until their token expired.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user) throw AppError.unauthorized('This account no longer exists');
  if (!user.isActive) throw AppError.forbidden('This account has been deactivated');

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
});

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 *
 *   router.post('/', authenticate, authorize('ADMIN', 'SALES'), handler)
 */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Your role (${req.user.role}) cannot perform this action. Allowed roles: ${roles.join(', ')}.`,
        ),
      );
    }

    return next();
  };
}
