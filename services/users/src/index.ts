import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { IdentityEventConsumer } from './consumers/IdentityEventConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { UserProfileRepository } from './repositories/UserProfileRepository.js';
import { UserProfileOutboxWorker } from './workers/UserProfileOutboxWorker.js';

const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
await connectDatabase();

privacyDatabase.startCleanup();
serviceBus.start(new ServiceRequestHandler().handle);
const repository = new UserProfileRepository();
const consumer = new IdentityEventConsumer(brokers, repository);
const outboxWorker = new UserProfileOutboxWorker(brokers);
await consumer.start();
await outboxWorker.start();

const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`Users listening on ${env.HOST}:${env.PORT}.`);
});

async function shutdown(): Promise<void> {
  await serviceBus.stop();
  await privacyDatabase.close();
  server.close(async () => {
    await consumer.stop();
    await outboxWorker.stop();
    await disconnectDatabase();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
