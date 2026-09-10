import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { prisma } from './config/prisma';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimit';
import { asyncHandler } from './utils/asyncHandler';

export function createApp() {
  const app = express();

  // Render/Vercel sit behind a proxy; needed for correct client IPs (rate limiting).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (Postman, curl, server-to-server) which send no Origin.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use('/api', globalRateLimiter);

  // Health probe — used by Render's health check and by the frontend.
  // Reports the database separately so a reachable API with an unreachable
  // database is not mistaken for a healthy system.
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      let database: 'up' | 'down' = 'up';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = 'down';
      }

      res.status(database === 'up' ? 200 : 503).json({
        success: database === 'up',
        data: {
          status: database === 'up' ? 'ok' : 'degraded',
          database,
          environment: env.NODE_ENV,
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
      });
    }),
  );

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
