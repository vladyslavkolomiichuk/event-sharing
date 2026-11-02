import type {
  Availability,
  Membership,
  MembershipList,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class ParticipationClient {
  availability(eventId: string): Promise<Availability> {
    return gateway.get(`/api/participation/events/${eventId}/availability`);
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

  participants(eventId: string, cursor?: string): Promise<MembershipList> {
    return gateway.get(
      `/api/participation/events/${eventId}/participants${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }
}

export const participationClient = new ParticipationClient();
