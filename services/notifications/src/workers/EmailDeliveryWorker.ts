import { NotificationRequestedPayloadSchema } from '@event-sharing/contracts';
import { MailMessageCipher } from '@event-sharing/messaging';
import type { SmtpEmailClient } from '../clients/SmtpEmailClient.js';
import type { EmailDeliveryRepository } from '../repositories/EmailDeliveryRepository.js';

export class EmailDeliveryWorker {
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;

  constructor(
    private readonly repository: EmailDeliveryRepository,
    private readonly cipher: MailMessageCipher,
    private readonly smtp: SmtpEmailClient,
  ) {}

  start(): void {
    this.interval = setInterval(() => void this.flush(), 5000);
    void this.flush();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
  }

  private async flush(): Promise<void> {
    if (this.pending) return;
    this.pending = this.deliverDue();
    try {
      await this.pending;
    } catch (error) {
      console.error('Email delivery worker failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async deliverDue(): Promise<void> {
    for (const delivery of await this.repository.listDue()) {
      const expired = delivery.expiresAt.getTime() <= Date.now();
      if (expired) {
        await this.repository.markFailed(
          delivery.id,
          delivery.attempts + 1,
          true,
        );
        continue;
      }
      try {
        const payload = NotificationRequestedPayloadSchema.parse(
          delivery.payload,
        );
        const request = this.cipher.decrypt(payload);
        await this.smtp.send(delivery.id, request);
        await this.repository.markSent(delivery.id);
        console.info(`[EMAIL SENT] Notifications | id=${delivery.id}`);
      } catch {
        await this.repository.markFailed(
          delivery.id,
          delivery.attempts + 1,
          false,
        );
        console.error(`[EMAIL FAILED] Notifications | id=${delivery.id}`);
      }
    }
  }
}
