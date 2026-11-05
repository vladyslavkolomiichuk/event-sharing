import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import {
  EventImagesSchema,
  EventImageSlotSchema,
  StoredFilePageSchema,
  StoredFileSchema,
} from '@event-sharing/contracts';
import { StorageError } from '../domain/StorageError.js';
import { FileStorageService } from '../services/FileStorageService.js';

export class FileController {
  constructor(private readonly service: FileStorageService) {}
  private user(request: Request) {
    if (!request.authenticatedUser)
      throw new StorageError('Authentication required.', 'UNAUTHORIZED', 401);
    return request.authenticatedUser;
  }
  private send(response: Response, file: { id: string; mimeType: string }) {
    response.set({
      'Content-Type': file.mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.sendFile(this.service.path(file.id), (error) => {
      if (error && !response.headersSent)
        response.status(404).json({
          code: 'NOT_FOUND',
          message: 'The file was not found.',
          details: [],
        });
      else if (error) response.destroy();
    });
  }
  upload: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const file = await this.service.upload(
      user.id,
      request.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      request.body,
    );
    response.status(201).json(
      StoredFileSchema.parse({
        ...file,
        createdAt: file.createdAt.toISOString(),
      }),
    );
  };
  uploadEventImage: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const eventId = z.uuid().parse(request.params.eventId);
    const slot = EventImageSlotSchema.parse(request.params.slot);
    await this.service.eventAccess(
      eventId,
      user.id,
      user.role,
      request.get('authorization') ?? '',
      true,
    );
    const file = await this.service.upload(
      user.id,
      request.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      request.body,
      eventId,
      slot,
    );
    response.status(201).json(
      StoredFileSchema.parse({
        ...file,
        createdAt: file.createdAt.toISOString(),
      }),
    );
  };
  uploadProfileAvatar: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const file = await this.service.upload(
      user.id,
      request.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '',
      request.body,
      undefined,
      undefined,
      user.id,
    );
    response.status(201).json(
      StoredFileSchema.parse({
        ...file,
        createdAt: file.createdAt.toISOString(),
      }),
    );
  };
  getProfileAvatar: RequestHandler = async (request, response) => {
    this.user(request);
    const file = await this.service.profileAvatar(
      z.uuid().parse(request.params.userId),
      request.get('authorization') ?? '',
    );
    this.send(response, file);
  };
  removeProfileAvatar: RequestHandler = async (request, response) => {
    const user = this.user(request);
    await this.service.removeProfileAvatar(
      user.id,
      user.role,
      request.get('authorization') ?? '',
    );
    response.status(204).end();
  };
  get: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const file = await this.service.get(
      z.uuid().parse(request.params.id),
      user.id,
      user.role,
      request.get('authorization') ?? '',
    );
    this.send(response, file);
  };
  getEventImage: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const file = await this.service.eventImage(
      z.uuid().parse(request.params.eventId),
      EventImageSlotSchema.parse(request.params.slot),
      user.id,
      user.role,
      request.get('authorization') ?? '',
    );
    this.send(response, file);
  };
  getPublicEventAvatar: RequestHandler = async (request, response) => {
    const file = await this.service.publicEventAvatar(
      z.uuid().parse(request.params.eventId),
    );
    this.send(response, file);
  };
  list: RequestHandler = async (request, response) => {
    const cursor = z.uuid().optional().parse(request.query.cursor);
    const page = await this.service.list(this.user(request).id, cursor);
    response.json(
      StoredFilePageSchema.parse({
        ...page,
        items: page.items.map((file) => ({
          ...file,
          createdAt: file.createdAt.toISOString(),
        })),
      }),
    );
  };
  export: RequestHandler = async (request, response) => {
    const files = await this.service.export(this.user(request).id);
    response.set('Cache-Control', 'private, no-store').json({
      files: files.map((file) => ({
        ...StoredFileSchema.parse({
          ...file,
          createdAt: file.createdAt.toISOString(),
        }),
        downloadPath: `/backend/api/storage/files/${file.id}`,
      })),
    });
  };
  eventImages: RequestHandler = async (request, response) => {
    const user = this.user(request);
    response
      .set('Cache-Control', 'private, no-store')
      .json(
        EventImagesSchema.parse(
          await this.service.eventImages(
            z.uuid().parse(request.params.eventId),
            user.id,
            user.role,
            request.get('authorization') ?? '',
          ),
        ),
      );
  };
  remove: RequestHandler = async (request, response) => {
    const user = this.user(request);
    await this.service.remove(
      z.uuid().parse(request.params.id),
      user.id,
      user.role,
      request.get('authorization') ?? '',
    );
    response.status(204).end();
  };
  removeEventImage: RequestHandler = async (request, response) => {
    const user = this.user(request);
    const token = request.get('authorization') ?? '';
    const file = await this.service.eventImage(
      z.uuid().parse(request.params.eventId),
      EventImageSlotSchema.parse(request.params.slot),
      user.id,
      user.role,
      token,
    );
    await this.service.remove(file.id, user.id, user.role, token);
    response.status(204).end();
  };
}
