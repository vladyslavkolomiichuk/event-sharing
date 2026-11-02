import type {
  ChatMessage,
  ChatOverview,
  ChatRoom,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class MessagesClient {
  overview(): Promise<ChatOverview> {
    return gateway.get('/api/messages/overview');
  }
  rooms(eventId: string): Promise<{ items: ChatRoom[] }> {
    return gateway.get(`/api/messages/events/${eventId}/rooms`);
  }
  createRoom(eventId: string, name: string): Promise<ChatRoom> {
    return gateway.post(`/api/messages/events/${eventId}/rooms`, { name });
  }
  archiveRoom(eventId: string, roomId: string): Promise<ChatRoom> {
    return gateway.patch(
      `/api/messages/events/${eventId}/rooms/${roomId}/archive`,
      {},
    );
  }
  messages(
    eventId: string,
    roomId: string,
    before?: string,
  ): Promise<{ items: ChatMessage[]; nextBefore: string | null }> {
    return gateway.get(
      `/api/messages/events/${eventId}/rooms/${roomId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    );
  }
  send(eventId: string, roomId: string, body: string): Promise<ChatMessage> {
    return gateway.post(
      `/api/messages/events/${eventId}/rooms/${roomId}/messages`,
      { body },
    );
  }
  markRead(
    eventId: string,
    roomId: string,
    messageId: string,
  ): Promise<{ unreadCount: number }> {
    return gateway.patch(
      `/api/messages/events/${eventId}/rooms/${roomId}/read`,
      { messageId },
    );
  }
}
export const messagesClient = new MessagesClient();
