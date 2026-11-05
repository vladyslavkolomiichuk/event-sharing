import {
  RPC_OPERATIONS,
  type ServiceName,
  type PrivacyWork,
} from '@event-sharing/contracts';
import { ServiceMessageCipher } from '@event-sharing/messaging';
import { z } from 'zod';
import { env } from '../config/env.js';
import { serviceBus } from '../config/service-bus.js';

export class PrivacyServiceClient {
  cipher(service: ServiceName): ServiceMessageCipher {
    const key = env.PRIVACY_SERVICE_KEYS[service];
    if (!key) throw new Error(`Missing privacy key for ${service}.`);
    return new ServiceMessageCipher(key);
  }

  async erase(
    service: ServiceName,
    work: PrivacyWork,
    reserve = false,
  ): Promise<unknown> {
    const operation = reserve
      ? RPC_OPERATIONS.privacyReserve
      : RPC_OPERATIONS.privacyErase;
    const cipher = this.cipher(service);
    const sealed = await serviceBus.call(
      service,
      operation,
      cipher.encode({ operation, work }),
    );
    const reply = z
      .object({
        requestId: z.literal(work.requestId),
        operation: z.literal(operation),
        result: z.unknown(),
      })
      .parse(cipher.decode(z.string().parse(sealed)));
    return reply.result;
  }
}
