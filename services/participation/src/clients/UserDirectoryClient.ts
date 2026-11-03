import { UsernameSchema } from '@event-sharing/contracts';
import { z } from 'zod';
import { env } from '../config/env.js';
import { InvitationError } from '../domain/errors/InvitationError.js';

const TargetSchema = z.strictObject({
  userId: z.uuid(),
  username: UsernameSchema,
  name: z.string().min(1),
});

export class UserDirectoryClient {
  async resolve(username: string, authorization: string) {
    const response = await fetch(
      `${env.USERS_SERVICE_URL}/api/users/invitation-target/${encodeURIComponent(username)}`,
      { headers: { authorization }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok)
      throw new InvitationError(
        'This user cannot receive your invitation.',
        'INVITATION_TARGET_UNAVAILABLE',
        response.status === 404 ? 404 : 403,
      );
    return TargetSchema.parse(await response.json());
  }
}
