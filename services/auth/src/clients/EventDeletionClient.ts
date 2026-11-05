import {
  PRIVACY_COMMAND_AUDIENCES,
  PRIVACY_COMMANDS,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { PrivacyCommandClient } from './PrivacyCommandClient.js';

export class EventDeletionClient {
  constructor(private readonly commands = new PrivacyCommandClient()) {}

  reserve(userId: string, requestId: string): Promise<void> {
    return this.commands.send({
      userId,
      requestId,
      audience: PRIVACY_COMMAND_AUDIENCES.events,
      operation: PRIVACY_COMMANDS.reserveEvents,
      url: `${env.EVENTS_SERVICE_URL}/internal/privacy/reserve-events`,
    });
  }
}
