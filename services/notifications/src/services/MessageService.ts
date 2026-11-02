import { InAppMessageSchema, type UserRole } from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { MessageLimitError } from '../domain/errors/MessageLimitError.js';
import { NoRecipientsError } from '../domain/errors/NoRecipientsError.js';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';
import { MessageRepository } from '../repositories/MessageRepository.js';
import { ProjectionRepository } from '../repositories/ProjectionRepository.js';

export class MessageService {
  constructor(
    private readonly messages = new MessageRepository(),
    private readonly projections = new ProjectionRepository(),
    private readonly onChanged: (userIds: string[]) => void = () => {},
  ) {}

  async sendEvent(
    senderId: string,
    role: UserRole,
    eventId: string,
    body: string,
  ) {
    const [sender, event] = await Promise.all([
      this.projections.findUser(senderId),
      this.projections.findEvent(eventId),
    ]);
    if (!event) throw new ResourceNotFoundError();
    if (event.organizerId !== senderId && role !== 'ADMIN')
      throw new ForbiddenError();
    if (
      ![
        'PUBLISHED',
        'REGISTRATION_OPEN',
        'REGISTRATION_CLOSED',
        'IN_PROGRESS',
      ].includes(event.status)
    ) {
      throw new ForbiddenError();
    }
    const memberships = await this.projections.listActiveMembers(eventId);
    const recipients = memberships
      .map((item) => item.userId)
      .filter((id) => id !== senderId);
    if (recipients.length === 0) throw new NoRecipientsError();
    const message = await this.messages.send(
      senderId,
      eventId,
      body,
      recipients,
      `Announcement about ${event.title}`,
    );
    if (!message) throw new MessageLimitError();
    this.onChanged(recipients);
    return this.toResponse(message, sender?.name ?? 'User');
  }

  async get(userId: string, id: string) {
    const message = await this.messages.find(id);
    if (!message) throw new ResourceNotFoundError();
    if (
      message.senderId !== userId &&
      !(await this.messages.canRead(id, userId))
    ) {
      throw new ResourceNotFoundError();
    }
    const sender = await this.projections.findUser(message.senderId);
    return this.toResponse(message, sender?.name ?? 'User');
  }

  private toResponse(
    record: {
      id: string;
      senderId: string;
      eventId: string | null;
      body: string;
      recipientCount: number;
      createdAt: Date;
    },
    senderName: string,
  ) {
    return InAppMessageSchema.parse({
      ...record,
      senderName,
      createdAt: record.createdAt.toISOString(),
    });
  }
}
