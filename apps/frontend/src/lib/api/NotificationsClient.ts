import type {
  InAppMessage,
  InAppNotification,
  InAppNotificationList,
  NotificationFilter,
  CreateSystemMessage,
  SystemMessage,
  SystemMessageList,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class NotificationsClient {
  systemMessages(cursor?: string): Promise<SystemMessageList> {
    return gateway.get(
      `/api/notifications/system${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }

  createSystemMessage(input: CreateSystemMessage): Promise<SystemMessage> {
    return gateway.post('/api/notifications/system', input);
  }

  removeSystemMessage(id: string): Promise<{ deleted: boolean }> {
    return gateway.delete(`/api/notifications/system/${id}`);
  }

  list(
    cursor?: string,
    filter: NotificationFilter = 'ALL',
  ): Promise<InAppNotificationList> {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (filter !== 'ALL') query.set('filter', filter);
    const search = query.toString();
    return gateway.get(`/api/notifications${search ? `?${search}` : ''}`);
  }

  unreadCount(): Promise<{ unreadCount: number }> {
    return gateway.get('/api/notifications/unread-count');
  }

  markRead(id: string): Promise<InAppNotification> {
    return gateway.patch(`/api/notifications/${id}/read`, {});
  }

  markAllRead(): Promise<{ updatedCount: number }> {
    return gateway.patch('/api/notifications/read-all', {});
  }

  remove(id: string): Promise<{ deleted: boolean }> {
    return gateway.delete(`/api/notifications/${id}`);
  }

  sendEvent(eventId: string, body: string): Promise<InAppMessage> {
    return gateway.post(`/api/notifications/events/${eventId}/messages`, {
      body,
    });
  }

  getMessage(id: string): Promise<InAppMessage> {
    return gateway.get(`/api/notifications/messages/${id}`);
  }
}

export const notificationsClient = new NotificationsClient();
