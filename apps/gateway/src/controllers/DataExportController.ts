import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { DataExportUnavailableError } from '../domain/errors/DataExportUnavailableError.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

export class DataExportController {
  export: RequestHandler = async (request, response) => {
    if (!request.internalUserJwt || !request.authenticatedUser)
      throw new UnauthorizedError();

    const token = request.internalUserJwt;
    const sources = [
      ['auth', `${env.AUTH_SERVICE_URL}/backend/auth/privacy/export`, true],
      ['profile', `${env.USERS_SERVICE_URL}/api/users/me/export`, false],
      ['events', `${env.EVENTS_SERVICE_URL}/api/events/mine/export`, false],
      [
        'participation',
        `${env.PARTICIPATION_SERVICE_URL}/api/participation/me/export`,
        false,
      ],
      [
        'searchPreference',
        `${env.GEO_SEARCH_SERVICE_URL}/api/search/preference`,
        false,
      ],
      ['messages', `${env.MESSAGES_SERVICE_URL}/api/messages/me/export`, false],
      ['storage', `${env.STORAGE_SERVICE_URL}/api/storage/me/export`, false],
      [
        'notifications',
        `${env.NOTIFICATIONS_SERVICE_URL}/api/notifications/me/export`,
        false,
      ],
      [
        'eventLog',
        `${env.EVENT_LOG_SERVICE_URL}/api/event-log/me/export`,
        false,
      ],
    ] as const;

    const entries = await Promise.all(
      sources.map(async ([name, url, useCookie]) => {
        try {
          const source = await fetch(url, {
            headers: useCookie
              ? { cookie: request.get('cookie') ?? '' }
              : { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
          });
          if (!source.ok) throw new DataExportUnavailableError();
          return [name, await source.json()] as const;
        } catch {
          throw new DataExportUnavailableError();
        }
      }),
    );

    response
      .set('cache-control', 'no-store')
      .set(
        'content-disposition',
        'attachment; filename="event-sharing-data.json"',
      )
      .json({
        exportedAt: new Date().toISOString(),
        userId: request.authenticatedUser.id,
        data: Object.fromEntries(entries),
      });
  };
}
