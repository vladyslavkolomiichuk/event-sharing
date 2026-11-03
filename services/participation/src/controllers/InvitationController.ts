import { UsernameSchema } from '@event-sharing/contracts';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { InvitationService } from '../services/InvitationService.js';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const linkSchema = z.strictObject({
  expiresAt: z.iso.datetime(),
  maxUses: z.number().int().min(1).max(1000).nullable().default(null),
});
const sendSchema = z.strictObject({
  usernames: z.array(UsernameSchema).min(1).max(20),
});

export class InvitationController {
  constructor(private readonly service = new InvitationService()) {}

  private user(request: Request) {
    if (!request.authenticatedUser) throw new UnauthorizedError();
    return request.authenticatedUser;
  }

  private eventId(request: Request) {
    return z.uuid().parse(request.params.eventId);
  }

  createLink: RequestHandler = async (request, response) => {
    const input = linkSchema.parse(request.body);
    response
      .status(201)
      .json(
        await this.service.createLink(
          this.eventId(request),
          this.user(request).id,
          new Date(input.expiresAt),
          input.maxUses,
        ),
      );
  };

  links: RequestHandler = async (request, response) => {
    response.json(
      await this.service.listLinks(
        this.eventId(request),
        this.user(request).id,
      ),
    );
  };

  revokeLink: RequestHandler = async (request, response) => {
    await this.service.revokeLink(
      this.eventId(request),
      this.user(request).id,
      z.uuid().parse(request.params.linkId),
    );
    response.status(204).end();
  };

  previewLink: RequestHandler = async (request, response) => {
    this.user(request);
    response.json(
      await this.service.previewLink(tokenSchema.parse(request.params.token)),
    );
  };

  acceptLink: RequestHandler = async (request, response) => {
    const token = tokenSchema.parse(request.params.token);
    response.json(await this.service.acceptLink(token, this.user(request).id));
  };

  send: RequestHandler = async (request, response) => {
    const input = sendSchema.parse(request.body);
    response
      .status(201)
      .json(
        await this.service.send(
          this.eventId(request),
          this.user(request).id,
          input.usernames,
          request.get('authorization') ?? '',
        ),
      );
  };

  incoming: RequestHandler = async (request, response) => {
    response.json(await this.service.incoming(this.user(request).id));
  };

  outgoing: RequestHandler = async (request, response) => {
    response.json(
      await this.service.outgoing(
        this.eventId(request),
        this.user(request).id,
        request.get('authorization') ?? '',
      ),
    );
  };

  accept: RequestHandler = async (request, response) => {
    response.json(
      await this.service.accept(
        z.uuid().parse(request.params.inviteId),
        this.user(request).id,
      ),
    );
  };

  decline: RequestHandler = async (request, response) => {
    await this.service.decline(
      z.uuid().parse(request.params.inviteId),
      this.user(request).id,
    );
    response.status(204).end();
  };

  revoke: RequestHandler = async (request, response) => {
    await this.service.revoke(
      z.uuid().parse(request.params.inviteId),
      this.user(request).id,
    );
    response.status(204).end();
  };
}
