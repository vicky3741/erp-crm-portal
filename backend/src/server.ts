import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/prisma';

let server: Server | undefined;

async function start() {
  // Fail before accepting traffic if the database is unreachable.
  await connectDatabase();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] ERP/CRM API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

async function shutdown(signal: string, exitCode = 0) {
  // eslint-disable-next-line no-console
  console.log(`\n[server] ${signal} received, shutting down gracefully...`);

  // Don't hang forever if sockets stay open.
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  try {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await disconnectDatabase();
    // eslint-disable-next-line no-console
    console.log('[server] closed');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] error during shutdown:', err);
    process.exit(1);
  }

  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] Unhandled promise rejection:', reason);
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] Uncaught exception:', err);
  process.exit(1);
});

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});
