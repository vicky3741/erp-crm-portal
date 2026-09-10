import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from './AppError';

/**
 * Token payload.
 * `sub` holds the user id; `role` is carried so obvious authorisation checks
 * do not need a database round trip. The role is still re-read from the
 * database on every request (see `authenticate`), so a role change or a
 * disabled account takes effect immediately rather than at token expiry.
 */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sub !== 'string') {
      throw AppError.unauthorized('Malformed authentication token');
    }

    return { sub: decoded.sub, role: (decoded as jwt.JwtPayload).role as Role };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Session expired, please log in again');
    }
    throw AppError.unauthorized('Invalid authentication token');
  }
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Authentication required. Provide a Bearer token.');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) throw AppError.unauthorized('Authentication required. Provide a Bearer token.');

  return token;
}
