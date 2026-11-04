import {
  AddChatRoomMembersSchema,
  CreateChatRoomSchema,
  MarkChatReadSchema,
  SendChatMessageSchema,
  UpdateChatRoomSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import type { ChatService } from '../services/ChatService.js';

export class ChatController {
  constructor(private readonly service: ChatService) {}
  private user(request: Express.Request) {
    if (!request.authenticatedUser) throw new UnauthorizedError();
    return request.authenticatedUser;
  }
  overview: RequestHandler = async (request, response) => {
    response.json(
      await this.service.overview(
        this.user(request).id,
        request.get('authorization') ?? '',
      ),
    );
  };
  listRooms: RequestHandler = async (request, response) => {
    const user = this.user(request);
    response.json(
      await this.service.listRooms(
        z.uuid().parse(request.params.eventId),
        user.id,
        user.role,
        request.get('authorization') ?? '',
      ),
    );
  };
  createRoom: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const input = CreateChatRoomSchema.parse(request.body);
    response
      .status(201)
      .json(
        await this.service.createRoom(
          z.uuid().parse(request.params.eventId),
          user.id,
          user.role,
          input,
          request.get('authorization') ?? '',
        ),
      );
  };
  updateRoom: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const input = UpdateChatRoomSchema.parse(request.body);
    response.json(
      await this.service.updateRoom(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        input,
        request.get('authorization') ?? '',
      ),
    );
  };
  listMembers: RequestHandler = async (request, response) => {
    const user = this.user(request);
    response.json(
      await this.service.listMembers(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        request.get('authorization') ?? '',
      ),
    );
  };
  addMembers: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const { userIds } = AddChatRoomMembersSchema.parse(request.body);
    response.json(
      await this.service.addMembers(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        userIds,
        request.get('authorization') ?? '',
      ),
    );
  };
  removeMember: RequestHandler = async (request, response) => {
    const user = this.user(request);
    response.json(
      await this.service.removeMember(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        z.uuid().parse(request.params.userId),
        request.get('authorization') ?? '',
      ),
    );
  };
  archiveRoom: RequestHandler = async (request, response) => {
    const user = this.user(request);
    response.json(
      await this.service.archiveRoom(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        request.get('authorization') ?? '',
      ),
    );
  };
  listMessages: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const query = z
      .strictObject({ before: z.uuid().optional() })
      .parse(request.query);
    response.json(
      await this.service.listMessages(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        request.get('authorization') ?? '',
        query.before,
      ),
    );
  };
  sendMessage: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const input = SendChatMessageSchema.parse(request.body);
    response
      .status(201)
      .json(
        await this.service.send(
          z.uuid().parse(request.params.eventId),
          z.uuid().parse(request.params.roomId),
          user.id,
          user.role,
          input.body,
          input.clientMessageId,
          request.get('authorization') ?? '',
        ),
      );
  };
  markRead: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const { messageId } = MarkChatReadSchema.parse(request.body);
    response.json(
      await this.service.markRead(
        z.uuid().parse(request.params.eventId),
        z.uuid().parse(request.params.roomId),
        user.id,
        user.role,
        messageId,
        request.get('authorization') ?? '',
      ),
    );
  };
}
