import { gateway } from './GatewayClient';

export type InviteLink = {
  id: string;
  expiresAt: string;
  maxUses: number | null;
  uses?: number;
  revokedAt?: string | null;
  token?: string;
};

export type PersonalInvite = {
  id: string;
  eventId: string;
  recipientId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  title?: string;
};

export class InvitationClient {
  createLink(
    eventId: string,
    expiresAt: string,
    maxUses: number | null,
  ): Promise<InviteLink> {
    return gateway.post(`/api/participation/events/${eventId}/invite-links`, {
      expiresAt,
      maxUses,
    });
  }
  links(eventId: string): Promise<InviteLink[]> {
    return gateway.get(`/api/participation/events/${eventId}/invite-links`);
  }
  revokeLink(eventId: string, linkId: string): Promise<unknown> {
    return gateway.delete(
      `/api/participation/events/${eventId}/invite-links/${linkId}`,
    );
  }
  previewLink(
    token: string,
  ): Promise<{ eventId: string; title: string; expiresAt: string }> {
    return gateway.get(
      `/api/participation/invitations/link/${encodeURIComponent(token)}`,
    );
  }
  acceptLink(token: string): Promise<unknown> {
    return gateway.post(
      `/api/participation/invitations/link/${encodeURIComponent(token)}` +
        '/accept',
    );
  }
  send(
    eventId: string,
    usernames: string[],
  ): Promise<{ sent: { username: string; name: string }[]; skipped: number }> {
    return gateway.post(`/api/participation/events/${eventId}/invitations`, {
      usernames,
    });
  }
  incoming(): Promise<PersonalInvite[]> {
    return gateway.get('/api/participation/invitations');
  }
  outgoing(eventId: string): Promise<PersonalInvite[]> {
    return gateway.get(`/api/participation/events/${eventId}/invitations`);
  }
  accept(id: string): Promise<unknown> {
    return gateway.post(`/api/participation/invitations/${id}/accept`);
  }
  decline(id: string): Promise<unknown> {
    return gateway.post(`/api/participation/invitations/${id}/decline`);
  }
  revoke(id: string): Promise<unknown> {
    return gateway.delete(`/api/participation/invitations/${id}`);
  }
}

export const invitationClient = new InvitationClient();
