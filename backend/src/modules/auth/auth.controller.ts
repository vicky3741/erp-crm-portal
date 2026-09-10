import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { ok } from '../../utils/response';
import * as authService from './auth.service';
import type { LoginInput } from './auth.schema';

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body as LoginInput);
  return ok(res, result, 'Logged in successfully');
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const user = await authService.getProfile(req.user.id);
  return ok(res, user);
});

/**
 * JWTs are stateless, so there is no server-side session to destroy — the
 * client discards the token. The endpoint exists so the frontend has one
 * documented place to call, and so a future token-blocklist can be added
 * here without changing the client.
 */
export const logout = asyncHandler(async (_req, res) => {
  return ok(res, null, 'Logged out successfully. Discard the token on the client.');
});
