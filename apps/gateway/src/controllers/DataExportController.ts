import {
  DataExportResponseSchema,
  DataExportSourceSchema,
  type DataExportSource,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

type Source = { name: DataExportSource; url: string; useCookie?: boolean };

export class DataExportController {
  private readonly sources: Source[] = [
    {
      name: 'auth',
      url: `${env.AUTH_SERVICE_URL}/backend/auth/privacy/export`,
      useCookie: true,
    },
    { name: 'profile', url: `${env.USERS_SERVICE_URL}/api/users/me/export` },
    { name: 'events', url: `${env.EVENTS_SERVICE_URL}/api/events/mine/export` },
    {
      name: 'participation',
      url: `${env.PARTICIPATION_SERVICE_URL}/api/participation/me/export`,
    },
    {
      name: 'searchPreference',
      url: `${env.GEO_SEARCH_SERVICE_URL}/api/search/preference`,
    },
    {
      name: 'messages',
      url: `${env.MESSAGES_SERVICE_URL}/api/messages/me/export`,
    },
    {
      name: 'storage',
      url: `${env.STORAGE_SERVICE_URL}/api/storage/me/export`,
    },
    {
      name: 'notifications',
      url: `${env.NOTIFICATIONS_SERVICE_URL}/api/notifications/me/export`,
    },
    {
      name: 'eventLog',
      url: `${env.EVENT_LOG_SERVICE_URL}/api/event-log/me/export`,
    },
  ];

  export: RequestHandler = async (request, response) => {
    if (!request.internalUserJwt || !request.authenticatedUser)
      throw new UnauthorizedError();
    const query = z.string().max(200).optional().parse(request.query.sources);
    const requestedSources =
      query === undefined
        ? this.sources.map((source) => source.name)
        : [
            ...new Set(
              z
                .array(DataExportSourceSchema)
                .min(1)
                .max(this.sources.length)
                .parse(query.split(',')),
            ),
          ];
    const selected = this.sources.filter((source) =>
      requestedSources.includes(source.name),
    );
    const results = await Promise.all(
      selected.map(async (source) => {
        const headers = source.useCookie
          ? { cookie: request.get('cookie') ?? '' }
          : { authorization: `Bearer ${request.internalUserJwt}` };
        try {
          const data = await this.fetchSource(source.url, headers);
          return { name: source.name, ok: true as const, data };
        } catch {
          return { name: source.name, ok: false as const };
        }
      }),
    );
    const failedSources = results
      .filter((item) => !item.ok)
      .map((item) => item.name);
    const data = Object.fromEntries(
      results.filter((item) => item.ok).map((item) => [item.name, item.data]),
    );
    response
      .set('cache-control', 'no-store')
      .set(
        'content-disposition',
        'attachment; filename="event-sharing-data.json"',
      )
      .json(
        DataExportResponseSchema.parse({
          exportedAt: new Date().toISOString(),
          userId: request.authenticatedUser.id,
          complete:
            requestedSources.length === this.sources.length &&
            failedSources.length === 0,
          requestedSources,
          failedSources,
          data,
        }),
      );
  };

  private async fetchSource(
    url: string,
    headers: Record<string, string>,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) return await response.json();
        if (response.status < 500 && response.status !== 429)
          throw new Error('Export rejected.');
      } catch (error) {
        if (attempt === 1) throw error;
      }
      if (attempt === 0)
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Export source is unavailable.');
  }
}
