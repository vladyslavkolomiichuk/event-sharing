import type {
  UpdateUserProfile,
  UserProfilePrivate,
  UserProfilePublic,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class UsersClient {
  me(): Promise<UserProfilePrivate> {
    return gateway.get('/api/users/me');
  }

  get(userId: string): Promise<UserProfilePublic> {
    return gateway.get(`/api/users/${userId}`);
  }

  getByUsername(username: string): Promise<UserProfilePublic> {
    return gateway.get(
      `/api/users/by-username/${encodeURIComponent(username)}`,
    );
  }

  getMany(userIds: string[]): Promise<UserProfilePublic[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    const ids = [...new Set(userIds)];
    return gateway.get(`/api/users?ids=${encodeURIComponent(ids.join(','))}`);
  }

  searchByName(name: string): Promise<UserProfilePublic[]> {
    return gateway.get(`/api/users/search?name=${encodeURIComponent(name)}`);
  }

  update(data: UpdateUserProfile): Promise<UserProfilePrivate> {
    return gateway.patch('/api/users/me', data);
  }
}

export const usersClient = new UsersClient();
