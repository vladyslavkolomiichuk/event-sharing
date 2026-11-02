import { PostgresReadinessCheck } from '@event-sharing/common';
import { REALTIME_SIGNAL_TYPES } from '@event-sharing/contracts';
import { MailMessageCipher } from '@event-sharing/messaging';
import { createApp } from './app.js';
import { SmtpEmailClient } from './clients/SmtpEmailClient.js';
import { env } from './config/env.js';
import { AuthMailConsumer } from './consumers/AuthMailConsumer.js';
import { DomainEventConsumer } from './consumers/DomainEventConsumer.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { EmailDeliveryRepository } from './repositories/EmailDeliveryRepository.js';
import { EmailDeliveryWorker } from './workers/EmailDeliveryWorker.js';
import { NotificationOutboxWorker } from './workers/NotificationOutboxWorker.js';
import { NotificationEventService } from './services/NotificationEventService.js';
import { NotificationRealtimeServer } from './realtime/NotificationRealtimeServer.js';

await connectDatabase();
const realtime = new NotificationRealtimeServer();
const changed = (userIds: string[]) =>
  realtime.publish(userIds, {
    type: REALTIME_SIGNAL_TYPES.notificationsChanged,
  });
const repository = new EmailDeliveryRepository();
const brokers = env.KAFKA_BROKERS?.split(',').map((broker) => broker.trim());
const consumer = brokers ? new AuthMailConsumer(brokers, repository) : null;
await consumer?.start();
const domainConsumer = brokers
  ? new DomainEventConsumer(
      brokers,
      new NotificationEventService(undefined, undefined, changed),
    )
  : null;
await domainConsumer?.start();
const outbox = brokers ? new NotificationOutboxWorker(brokers) : null;
await outbox?.start();

const smtp =
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM
    ? new SmtpEmailClient({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === 'true',
        from: env.SMTP_FROM,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      })
    : null;
const deliveryWorker =
  smtp && env.MAIL_ENCRYPTION_KEY
    ? new EmailDeliveryWorker(
        repository,
        new MailMessageCipher(env.MAIL_ENCRYPTION_KEY),
        smtp,
      )
    : null;
deliveryWorker?.start();
if (!deliveryWorker) {
  console.info('Email delivery is waiting for SMTP configuration.');
}

const app = createApp(new PostgresReadinessCheck(env.DATABASE_URL), realtime);
let server!: ReturnType<typeof app.listen>;
await new Promise<void>((resolve, reject) => {
  server = app.listen(env.PORT, env.HOST, () => resolve());
  server.once('error', reject);
});
realtime.attach(server);

console.info(`Notifications listening on ${env.HOST}:${env.PORT}.`);

async function shutdown(): Promise<void> {
  realtime.close();
  server.close(async () => {
    await consumer?.stop();
    await domainConsumer?.stop();
    await outbox?.stop();
    await deliveryWorker?.stop();
    await disconnectDatabase();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
