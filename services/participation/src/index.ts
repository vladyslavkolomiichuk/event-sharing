import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { RegistrationPolicyConsumer } from './consumers/RegistrationPolicyConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { RegistrationPolicyRepository } from './repositories/RegistrationPolicyRepository.js';
import { ParticipationOutboxWorker } from './workers/ParticipationOutboxWorker.js';

const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
await connectDatabase();

privacyDatabase.startCleanup();
serviceBus.start(new ServiceRequestHandler().handle);
const consumer = new RegistrationPolicyConsumer(
  brokers,
  new RegistrationPolicyRepository(),
);
const outboxWorker = new ParticipationOutboxWorker(brokers);
await consumer.start();
await outboxWorker.start();

const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`Participation listening on ${env.HOST}:${env.PORT}.`);
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
