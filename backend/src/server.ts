import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[server] ERP/CRM API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n[server] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('[server] closed');
    process.exit(0);
  });
  // Don't hang forever if sockets stay open.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] Uncaught exception:', err);
  process.exit(1);
});
