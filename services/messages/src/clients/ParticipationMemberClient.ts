import { ParticipationStatusSchema } from '@event-sharing/contracts';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';

const StatusSchema = z.strictObject({
  status: ParticipationStatusSchema.nullable(),
  joinedAt: z.iso.datetime().nullable(),
});

export class ParticipationMemberClient {
  async isJoined(eventId: string, userId: string, authorization: string) {
    const response = await fetch(
      `${env.PARTICIPATION_SERVICE_URL}/api/participation/events/${eventId}/members/${userId}`,
      { headers: { authorization }, signal: AbortSignal.timeout(5000) },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new ForbiddenError();
    const member = StatusSchema.parse(await response.json());
    return member.status === 'JOINED' && member.joinedAt
      ? new Date(member.joinedAt)
      : null;
  }
}
