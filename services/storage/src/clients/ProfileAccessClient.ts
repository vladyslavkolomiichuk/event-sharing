import {
  profileAvatarPath,
  UserProfilePublicSchema,
} from '@event-sharing/contracts';
import { serviceBus } from '../config/service-bus.js';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { StorageError } from '../domain/StorageError.js';

export class ProfileAccessClient {
  async assertAvatarVisible(
    userId: string,
    authorization: string,
  ): Promise<void> {
    const profile = UserProfilePublicSchema.parse(
      await serviceBus.call(
        'users',
        RPC_OPERATIONS.profile,
        { userId },
        authorization,
      ),
    );
    if (
      profile.userId !== userId ||
      profile.avatarUrl !== profileAvatarPath(userId)
    )
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
  }
}
