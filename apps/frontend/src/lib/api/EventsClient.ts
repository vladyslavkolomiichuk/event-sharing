import type {
  CreateEvent,
  EventDetail,
  UpdateEvent,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export type Category = { id: string; name: string };
export type EventPage = { items: EventDetail[]; nextCursor: string | null };
export type EventAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'publish'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'archive'
  | 'registration/open'
  | 'registration/close';

export class EventsClient {
  categories(): Promise<Category[]> {
    return gateway.get('/api/events/categories');
  }

  createCategory(name: string): Promise<Category> {
    return gateway.post('/api/events/categories', { name });
  }

  list(cursor?: string, categoryId?: string): Promise<EventPage> {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (categoryId) query.set('categoryId', categoryId);
    const search = query.toString();
    return gateway.get(`/api/events${search ? `?${search}` : ''}`);
  }

  mine(cursor?: string): Promise<EventPage> {
    return gateway.get(
      `/api/events/mine${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }

  byOrganizer(organizerId: string, cursor?: string): Promise<EventPage> {
    return gateway.get(
      `/api/events/organizer/${organizerId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
  }

  get(id: string): Promise<EventDetail> {
    return gateway.get(`/api/events/${id}`);
  }

  create(data: CreateEvent): Promise<EventDetail> {
    return gateway.post('/api/events', data);
  }

  update(id: string, data: UpdateEvent): Promise<EventDetail> {
    return gateway.patch(`/api/events/${id}`, data);
  }

  updateChatSetting(id: string, chatEnabled: boolean): Promise<EventDetail> {
    return gateway.patch(`/api/events/${id}/chat`, { chatEnabled });
  }

  action(
    id: string,
    action: EventAction,
    body: unknown = {},
  ): Promise<EventDetail> {
    return gateway.post(`/api/events/${id}/${action}`, body);
  }
}

export const eventsClient = new EventsClient();
