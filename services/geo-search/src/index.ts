import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { EventProjectionConsumer } from './consumers/EventProjectionConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { SearchProjectionRepository } from './repositories/SearchProjectionRepository.js';
import { SearchOutboxWorker } from './workers/SearchOutboxWorker.js';

await connectDatabase();
const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
const consumer = new EventProjectionConsumer(
  brokers,
  new SearchProjectionRepository(),
);
const outbox = new SearchOutboxWorker(brokers);
await consumer.start();
await outbox.start();
const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
const server = app.listen(env.PORT, env.HOST, () =>
  console.info(`Geo Search listening on ${env.HOST}:${env.PORT}.`),
);

async function shutdown(): Promise<void> {
  server.close(async () => {
    await consumer.stop();
    await outbox.stop();
    await disconnectDatabase();
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
