import type {
  InAppMessage,
  InAppNotification,
  InAppNotificationList,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class NotificationsClient {
  list(cursor?: string): Promise<InAppNotificationList> {
    return gateway.get(
      `/api/notifications${cursor ? `?cursor=${cursor}` : ''}`,
    );
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
