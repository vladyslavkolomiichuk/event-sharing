import { PostgresReadinessCheck } from '@event-sharing/common';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { IdentityOutboxWorker } from './workers/IdentityOutboxWorker.js';
import { AuthMailOutboxWorker } from './workers/AuthMailOutboxWorker.js';

await connectDatabase();

const outboxWorker = env.KAFKA_BROKERS
  ? new IdentityOutboxWorker(
      env.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
    )
  : null;
const mailOutboxWorker = env.KAFKA_BROKERS
  ? new AuthMailOutboxWorker(
      env.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
    )
  : null;

if (outboxWorker) {
  await outboxWorker.start();
  await mailOutboxWorker?.start();
} else {
  console.info(
    'Identity events remain in the outbox until Kafka is configured.',
  );
}

const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL));
let server: ReturnType<typeof app.listen>;
await new Promise<void>((resolve, reject) => {
  server = app.listen(env.PORT, env.HOST, () => resolve());
  server.once('error', reject);
});

console.info(`Auth listening on ${env.HOST}:${env.PORT}.`);

async function shutdown(): Promise<void> {
  server.close(async () => {
    await outboxWorker?.stop();
    await mailOutboxWorker?.stop();
    await disconnectDatabase();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
