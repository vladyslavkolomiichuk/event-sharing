import type {
  Availability,
  Membership,
  MembershipList,
  ParticipationHistory,
} from '@event-sharing/contracts';
import { ApiError, gateway } from './GatewayClient';

export class ParticipationClient {
  hideHistory(eventId: string): Promise<void> {
    return gateway.delete(`/api/participation/me/history/${eventId}`);
  }
  availability(eventId: string): Promise<Availability> {
    return gateway.get(`/api/participation/events/${eventId}/availability`);
  }

  async joined(eventId: string, userId: string): Promise<boolean> {
    try {
      const result = await gateway.get<{ status: string | null }>(
        `/api/participation/events/${eventId}/members/${userId}`,
      );
      return result.status === 'JOINED';
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return false;
      throw cause;
    }
  }

  join(eventId: string): Promise<Membership> {
    return gateway.post(`/api/participation/events/${eventId}/join`);
  }

  leave(eventId: string): Promise<Membership> {
    return gateway.delete(`/api/participation/events/${eventId}/join`);
  }

  mine(cursor?: string): Promise<MembershipList> {
    return gateway.get(
      `/api/participation/me${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }

  history(userId: string, page = 0): Promise<ParticipationHistory> {
    return gateway.get(
      `/api/participation/users/${userId}/history?page=${page}`,
    );
  }

  participants(eventId: string, cursor?: string): Promise<MembershipList> {
    return gateway.get(
      `/api/participation/events/${eventId}/participants${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }
}

export const participationClient = new ParticipationClient();
