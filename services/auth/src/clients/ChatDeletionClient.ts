import {
  PRIVACY_COMMAND_AUDIENCES,
  PRIVACY_COMMANDS,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { PrivacyCommandClient } from './PrivacyCommandClient.js';

export class ChatDeletionClient {
  constructor(private readonly commands = new PrivacyCommandClient()) {}

  async anonymize(userId: string, requestId: string): Promise<void> {
    await this.commands.send({
      userId,
      requestId,
      operation: PRIVACY_COMMANDS.anonymizeChat,
      audience: PRIVACY_COMMAND_AUDIENCES.messages,
      url: `${env.MESSAGES_SERVICE_URL}/internal/privacy/anonymize-chat`,
    });
  }
}
