import { KafkaServiceBus, PrivacyDatabase } from '@event-sharing/messaging';
import { env } from './env.js';

export const serviceBus = new KafkaServiceBus(
  'notifications',
  (env.KAFKA_BROKERS ?? '127.0.0.1:9092')
    .split(',')
    .map((broker) => broker.trim()),
  env.SERVICE_BUS_KEYS,
  env.SERVICE_BUS_NAMESPACE,
);
if (!env.PRIVACY_SERVICE_KEY)
  throw new Error('PRIVACY_SERVICE_KEY is required.');
export const privacyDatabase = new PrivacyDatabase(
  env.DATABASE_URL,
  env.PRIVACY_SERVICE_KEY,
);
