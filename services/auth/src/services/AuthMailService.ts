import type { MailRequest } from '@event-sharing/contracts';
import { MailMessageCipher } from '@event-sharing/messaging';
import type { MailRequestRepository } from '../repositories/MailRequestRepository.js';

export class AuthMailService {
  constructor(
    private readonly repository: MailRequestRepository,
    private readonly cipher: MailMessageCipher,
  ) {}

  async queue(
    userId: string,
    kind: MailRequest['kind'],
    recipient: string,
    url: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await this.repository.enqueue(
      userId,
      this.cipher.encrypt({ kind, recipient, url, expiresAt }),
    );
  }
}
