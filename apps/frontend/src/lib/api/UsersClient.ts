import type {
  UpdateUserProfile,
  UserProfilePrivate,
  UserProfilePublic,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export type UserSearchResult = UserProfilePublic & {
  relationship: 'NONE' | 'FRIENDS' | 'SENT' | 'RECEIVED';
};

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

  searchByUsername(
    username: string,
    cursor?: string,
  ): Promise<{ items: UserSearchResult[]; nextCursor: string | null }> {
    const params = new URLSearchParams({
      username: username.replace(/^@/, ''),
    });
    if (cursor) params.set('cursor', cursor);
    return gateway.get(`/api/users/search?${params}`);
  }

  update(data: UpdateUserProfile): Promise<UserProfilePrivate> {
    return gateway.patch('/api/users/me', data);
  }
}

export const usersClient = new UsersClient();
