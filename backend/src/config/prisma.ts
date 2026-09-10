import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * A single PrismaClient for the whole process.
 *
 * In development `tsx watch` reloads this module on every save; without the
 * globalThis cache each reload would open a new connection pool and eventually
 * exhaust the database's connection limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

/** Verifies the database is reachable before the server starts accepting traffic. */
export async function connectDatabase() {
  await prisma.$connect();
  // eslint-disable-next-line no-console
  console.log('[db] connected');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
