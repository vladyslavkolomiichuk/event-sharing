import {
  SendEventMessageSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import type { MessageService } from '../services/MessageService.js';
import type { NotificationService } from '../services/NotificationService.js';

const ListQuerySchema = z.strictObject({ cursor: z.uuid().optional() });

export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly messages: MessageService,
  ) {}

  list: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const { cursor } = ListQuerySchema.parse(request.query);
    response.status(200).json(await this.notifications.list(user.id, cursor));
  };

  unreadCount: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.notifications.unreadCount(user.id));
  };

  markRead: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.notificationId);
    response.status(200).json(await this.notifications.markRead(id, user.id));
  };

  markAllRead: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.notifications.markAllRead(user.id));
  };

  sendEvent: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const eventId = z.uuid().parse(request.params.eventId);
    const input = SendEventMessageSchema.parse(request.body);
    response
      .status(201)
      .json(
        await this.messages.sendEvent(user.id, user.role, eventId, input.body),
      );
  };

  getMessage: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.messageId);
    response.status(200).json(await this.messages.get(user.id, id));
  };

  private requireUser(user: Express.Request['authenticatedUser']) {
    if (!user) throw new UnauthorizedError();
    return user;
  }
}
