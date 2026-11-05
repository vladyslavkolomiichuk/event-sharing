import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ParticipationEventConsumer } from './consumers/ParticipationEventConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { EventRepository } from './repositories/EventRepository.js';
import { ParticipantAccessRepository } from './repositories/ParticipantAccessRepository.js';
import { EventOutboxWorker } from './workers/EventOutboxWorker.js';
import { EventLifecycleWorker } from './workers/EventLifecycleWorker.js';

const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
await connectDatabase();
privacyDatabase.startCleanup();
serviceBus.start(new ServiceRequestHandler().handle);
const consumer = new ParticipationEventConsumer(
  brokers,
  new EventRepository(),
  new ParticipantAccessRepository(),
);
const outboxWorker = new EventOutboxWorker(brokers);
const lifecycleWorker = new EventLifecycleWorker();
await consumer.start();
await outboxWorker.start();
lifecycleWorker.start();

const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`Events listening on ${env.HOST}:${env.PORT}.`);
});

async function shutdown(): Promise<void> {
  await serviceBus.stop();
  await privacyDatabase.close();
  server.close(async () => {
    lifecycleWorker.stop();
    await consumer.stop();
    await outboxWorker.stop();
    await disconnectDatabase();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
