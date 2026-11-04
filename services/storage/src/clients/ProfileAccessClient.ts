import {
  profileAvatarPath,
  UserProfilePublicSchema,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { StorageError } from '../domain/StorageError.js';

export class ProfileAccessClient {
  async assertAvatarVisible(
    userId: string,
    authorization: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${env.USERS_SERVICE_URL}/api/users/${userId}`, {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new StorageError(
        'Profile access could not be checked.',
        'USERS_UNAVAILABLE',
        503,
      );
    }
    if (response.status === 403 || response.status === 404)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    if (!response.ok)
      throw new StorageError(
        'Profile access could not be checked.',
        'USERS_UNAVAILABLE',
        503,
      );
    const profile = UserProfilePublicSchema.parse(await response.json());
    if (
      profile.userId !== userId ||
      profile.avatarUrl !== profileAvatarPath(userId)
    )
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
  }
}
