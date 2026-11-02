import {
  InAppNotificationListSchema,
  InAppNotificationSchema,
  type InAppNotification,
} from '@event-sharing/contracts';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';
import { NotificationRepository } from '../repositories/NotificationRepository.js';

export class NotificationService {
  constructor(
    private readonly repository = new NotificationRepository(),
    private readonly onChanged: (userIds: string[]) => void = () => {},
  ) {}

  async list(recipientId: string, cursor?: string) {
    if (cursor && !(await this.repository.find(cursor, recipientId))) {
      throw new ResourceNotFoundError();
    }
    const [records, unreadCount] = await Promise.all([
      this.repository.list(recipientId, cursor),
      this.repository.unreadCount(recipientId),
    ]);
    const page = records.slice(0, 20).map((record) => this.toResponse(record));
    return InAppNotificationListSchema.parse({
      items: page,
      unreadCount,
      nextCursor: records.length > 20 ? (page.at(-1)?.id ?? null) : null,
    });
  }

  async unreadCount(recipientId: string) {
    return { unreadCount: await this.repository.unreadCount(recipientId) };
  }

  async markRead(id: string, recipientId: string) {
    const item = await this.repository.find(id, recipientId);
    if (!item) throw new ResourceNotFoundError();
    await this.repository.markRead(id, recipientId);
    this.onChanged([recipientId]);
    const updated = await this.repository.find(id, recipientId);
    return this.toResponse(updated!);
  }

  async markAllRead(recipientId: string) {
    const result = await this.repository.markAllRead(recipientId);
    if (result.count > 0) this.onChanged([recipientId]);
    return { updatedCount: result.count };
  }

  private toResponse(record: {
    id: string;
    type: string;
    title: string;
    body: string;
    href: string;
    senderId: string | null;
    eventId: string | null;
    messageId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }): InAppNotification {
    return InAppNotificationSchema.parse({
      id: record.id,
      type: record.type,
      title: record.title,
      body: record.body,
      href: record.href,
      senderId: record.senderId,
      eventId: record.eventId,
      messageId: record.messageId,
      readAt: record.readAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    });
  }
}
