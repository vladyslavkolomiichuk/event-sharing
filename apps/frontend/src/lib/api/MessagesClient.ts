import type {
  ChatMessage,
  ChatOverview,
  ChatRoom,
  ChatRoomMember,
  CreateChatRoom,
  UpdateChatRoom,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class MessagesClient {
  overview(): Promise<ChatOverview> {
    return gateway.get('/api/messages/overview');
  }
  rooms(eventId: string): Promise<{ items: ChatRoom[] }> {
    return gateway.get(`/api/messages/events/${eventId}/rooms`);
  }
  createRoom(eventId: string, input: CreateChatRoom): Promise<ChatRoom> {
    return gateway.post(`/api/messages/events/${eventId}/rooms`, input);
  }
  updateRoom(
    eventId: string,
    roomId: string,
    input: UpdateChatRoom,
  ): Promise<ChatRoom> {
    return gateway.patch(
      `/api/messages/events/${eventId}/rooms/${roomId}`,
      input,
    );
  }
  members(
    eventId: string,
    roomId: string,
  ): Promise<{ items: ChatRoomMember[] }> {
    return gateway.get(
      `/api/messages/events/${eventId}/rooms/${roomId}/members`,
    );
  }
  addMembers(
    eventId: string,
    roomId: string,
    userIds: string[],
  ): Promise<{ items: ChatRoomMember[] }> {
    return gateway.post(
      `/api/messages/events/${eventId}/rooms/${roomId}/members`,
      { userIds },
    );
  }
  removeMember(
    eventId: string,
    roomId: string,
    userId: string,
  ): Promise<{ removed: boolean }> {
    return gateway.delete(
      `/api/messages/events/${eventId}/rooms/${roomId}/members/${userId}`,
    );
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
  send(
    eventId: string,
    roomId: string,
    body: string,
    clientMessageId: string,
  ): Promise<ChatMessage> {
    return gateway.post(
      `/api/messages/events/${eventId}/rooms/${roomId}/messages`,
      { body, clientMessageId },
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
