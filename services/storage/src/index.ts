import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { FileStorageService } from './services/FileStorageService.js';

const storage = new FileStorageService();
await storage.initialize();
await prisma.$connect();
privacyDatabase.startCleanup();
serviceBus.start(new ServiceRequestHandler().handle);
const cleanup = setInterval(
  () =>
    void storage
      .cleanup()
      .catch(() => console.error('Storage cleanup failed.')),
  3600000,
);
const server = createApp(
  new PostgresReadinessCheck(env.DATABASE_URL),
  storage,
).listen(env.PORT, env.HOST, () =>
  console.info(`Storage listening on ${env.HOST}:${env.PORT}.`),
);
async function shutdown() {
  await serviceBus.stop();
  await privacyDatabase.close();
  clearInterval(cleanup);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
