import { KafkaSigningKeys } from '@event-sharing/messaging';
import { serviceBus } from './service-bus.js';

export const internalJwks = new KafkaSigningKeys(serviceBus).getKey;
