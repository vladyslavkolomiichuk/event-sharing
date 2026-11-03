import { gateway } from './GatewayClient';

export type FriendPerson = {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
};

export type FriendRequest = {
  id: string;
  person: FriendPerson | null;
};

export type FriendList = {
  nextPage: number | null;
  friends: FriendPerson[];
  received: FriendRequest[];
  sent: FriendRequest[];
  blocked: FriendPerson[];
};

export class FriendsClient {
  list(page = 0): Promise<FriendList> {
    return gateway.get(`/api/users/friends?page=${page}`);
  }

  request(username: string): Promise<unknown> {
    return gateway.post('/api/users/friends/requests', { username });
  }

  decide(
    id: string,
    action: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
  ): Promise<unknown> {
    return gateway.patch(`/api/users/friends/requests/${id}`, { action });
  }

  remove(username: string): Promise<unknown> {
    return gateway.delete(`/api/users/friends/${encodeURIComponent(username)}`);
  }

  block(username: string): Promise<unknown> {
    return gateway.put(`/api/users/blocks/${encodeURIComponent(username)}`, {});
  }

  unblock(username: string): Promise<unknown> {
    return gateway.delete(`/api/users/blocks/${encodeURIComponent(username)}`);
  }
}

export const friendsClient = new FriendsClient();
