import { KafkaServiceBus } from '@event-sharing/messaging';
import { env } from './env.js';

export const serviceBus = new KafkaServiceBus(
  'gateway',
  env.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
  env.SERVICE_BUS_KEYS,
  env.SERVICE_BUS_NAMESPACE,
);
