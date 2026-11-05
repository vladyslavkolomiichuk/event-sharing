import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { EventLogConsumer } from './consumers/EventLogConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { EventLogRepository } from './repositories/EventLogRepository.js';
import { EventLogRetentionWorker } from './workers/EventLogRetentionWorker.js';

await connectDatabase();
privacyDatabase.startCleanup();
serviceBus.start(new ServiceRequestHandler().handle);
const repository = new EventLogRepository();
const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
const consumer = new EventLogConsumer(
  brokers,
  repository,
  env.EVENT_LOG_RETENTION_DAYS,
);
const retention = new EventLogRetentionWorker(
  repository,
  env.EVENT_LOG_RETENTION_DAYS,
);
await consumer.start();
retention.start();
const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
const server = app.listen(env.PORT, env.HOST, () =>
  console.info(`Event Log listening on ${env.HOST}:${env.PORT}.`),
);

async function shutdown(): Promise<void> {
  await serviceBus.stop();
  await privacyDatabase.close();
  retention.stop();
  server.close(async () => {
    await consumer.stop();
    await disconnectDatabase();
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
