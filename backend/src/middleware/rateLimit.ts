import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Login is the one unauthenticated, credential-checking endpoint in the API,
 * so it is the one worth throttling: ten attempts per IP per fifteen minutes
 * makes password guessing impractical without inconveniencing a real user who
 * mistypes a few times.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many login attempts from this address. Please try again in 15 minutes.',
  },
  // Disabled in development so the demo and Postman runs are not throttled.
  skip: () => env.isDev,
});

/** Broad safety net against a single client hammering the whole API. */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  skip: () => env.isDev,
});
