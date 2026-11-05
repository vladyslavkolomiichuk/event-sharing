import { ParticipationStatusSchema } from '@event-sharing/contracts';
import { z } from 'zod';
import { serviceBus } from '../config/service-bus.js';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';

const StatusSchema = z.strictObject({
  status: ParticipationStatusSchema.nullable(),
  joinedAt: z.iso.datetime().nullable(),
});

export class ParticipationMemberClient {
  async isJoined(eventId: string, userId: string, authorization: string) {
    const member = StatusSchema.parse(
      await serviceBus.call(
        'participation',
        RPC_OPERATIONS.membership,
        { eventId, userId },
        authorization,
      ),
    );
    return member.status === 'JOINED' && member.joinedAt
      ? new Date(member.joinedAt)
      : null;
  }
}
