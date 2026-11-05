import { serviceBus, privacyDatabase } from './config/service-bus.js';
import { ServiceRequestHandler } from './services/ServiceRequestHandler.js';
import { PostgresReadinessCheck } from '@event-sharing/common';
import { REALTIME_SIGNAL_TYPES } from '@event-sharing/contracts';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ChatEventConsumer } from './consumers/ChatEventConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { ChatProjectionRepository } from './repositories/ChatProjectionRepository.js';
import { MessageRealtimeServer } from './realtime/MessageRealtimeServer.js';
import { ChatOutboxWorker } from './workers/ChatOutboxWorker.js';

await connectDatabase();
privacyDatabase.startCleanup();
const realtime = new MessageRealtimeServer();
serviceBus.start(
  new ServiceRequestHandler((users, eventId) =>
    realtime.publish(users, {
      type: REALTIME_SIGNAL_TYPES.messagesChanged,
      eventId,
    }),
  ).handle,
);
const brokers = env.KAFKA_BROKERS.split(',').map((broker) => broker.trim());
const consumer = new ChatEventConsumer(
  brokers,
  new ChatProjectionRepository((userIds, eventId) =>
    realtime.publish(userIds, {
      type: REALTIME_SIGNAL_TYPES.messagesChanged,
      eventId,
    }),
  ),
);
await consumer.start();
const outbox = new ChatOutboxWorker(brokers);
await outbox.start();
const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL), realtime);
const server = app.listen(env.PORT, env.HOST, () =>
  console.info(`Messages listening on ${env.HOST}:${env.PORT}.`),
);
realtime.attach(server);
async function shutdown() {
  await serviceBus.stop();
  await privacyDatabase.close();
  realtime.close();
  server.close(async () => {
    await consumer.stop();
    await outbox.stop();
    await disconnectDatabase();
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
