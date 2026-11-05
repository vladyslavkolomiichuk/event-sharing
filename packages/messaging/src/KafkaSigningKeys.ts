import { RPC_OPERATIONS } from '@event-sharing/contracts';
import {
  createLocalJWKSet,
  errors,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';
import type { KafkaServiceBus } from './KafkaServiceBus.js';

export class KafkaSigningKeys {
  private keys?: ReturnType<typeof createLocalJWKSet>;
  private loadedAt = 0;
  private loading: Promise<void> | undefined;

  constructor(private readonly bus: KafkaServiceBus) {}

  readonly getKey: JWTVerifyGetKey = async (header, token) => {
    if (!this.keys || Date.now() - this.loadedAt > 600000) await this.refresh();
    try {
      return await this.keys!(header, token);
    } catch (error) {
      if (
        !(error instanceof errors.JWKSNoMatchingKey) ||
        Date.now() - this.loadedAt < 30000
      )
        throw error;
      await this.refresh();
      return this.keys!(header, token);
    }
  };

  private async refresh(): Promise<void> {
    if (!this.loading) {
      this.loading = this.bus
        .call('auth', RPC_OPERATIONS.signingKeys, {}, undefined, 5000)
        .then((data) => {
          this.keys = createLocalJWKSet(data as JSONWebKeySet);
          this.loadedAt = Date.now();
        })
        .finally(() => {
          this.loading = undefined;
        });
    }
    await this.loading;
  }
}
