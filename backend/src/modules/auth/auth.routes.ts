import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginRateLimiter } from '../../middleware/rateLimit';
import { ok } from '../../utils/response';
import { loginSchema } from './auth.schema';
import * as authController from './auth.controller';

const router = Router();

// POST /api/auth/login — public, throttled
router.post('/login', loginRateLimiter, validate({ body: loginSchema }), authController.login);

// GET /api/auth/me — any authenticated user
router.get('/me', authenticate, authController.me);

// POST /api/auth/logout — any authenticated user
router.post('/logout', authenticate, authController.logout);

/**
 * Demonstration endpoint for role-based access control.
 * Reachable only by an ADMIN; every other role receives a 403 naming the
 * roles that would be accepted. Used in the API walkthrough and the Postman
 * collection to show authorisation working independently of any feature.
 */
router.get('/admin-check', authenticate, authorize('ADMIN'), (req, res) =>
  ok(res, {
    message: 'Access granted — this route is restricted to the ADMIN role.',
    user: req.user,
  }),
);

export default router;
