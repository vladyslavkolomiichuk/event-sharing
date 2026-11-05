import { UsernameSchema } from '@event-sharing/contracts';
import { z } from 'zod';
import { serviceBus } from '../config/service-bus.js';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { InvitationError } from '../domain/errors/InvitationError.js';

const TargetSchema = z.strictObject({
  userId: z.uuid(),
  username: UsernameSchema,
  name: z.string().min(1),
});

export class UserDirectoryClient {
  async resolve(username: string, authorization: string) {
    return TargetSchema.parse(
      await serviceBus.call(
        'users',
        RPC_OPERATIONS.invitationTarget,
        { username },
        authorization,
      ),
    );
  }
}
