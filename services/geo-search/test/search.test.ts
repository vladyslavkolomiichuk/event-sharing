import { randomUUID } from 'node:crypto';
import {
  EVENT_MAP_POINT_LIMIT,
  EVENT_TYPES,
  EventSearchQuerySchema,
  type EventSearchQuery,
} from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sqlText } from '../../../test/fake-prisma.js';
import { prisma } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { decodeSearchCursor, encodeSearchCursor } =
  await import('../src/lib/search-cursor.js');
const { SearchRepository } =
  await import('../src/repositories/SearchRepository.js');
const { SearchPreferenceRepository } =
  await import('../src/repositories/SearchPreferenceRepository.js');
const { GeoSearchService } =
  await import('../src/services/GeoSearchService.js');
const { InvalidSearchCursorError } =
  await import('../src/domain/errors/InvalidSearchCursorError.js');

const query = (input: Record<string, unknown> = {}): EventSearchQuery =>
  EventSearchQuerySchema.parse(input);
const near = {
  latitude: 50.45,
  longitude: 30.52,
  radiusMeters: 15000,
  locationSource: 'DEVICE',
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  organizerId: randomUUID(),
  categoryId: null,
  categoryName: null,
  title: 'Jazz',
  description: 'Music',
  startTime: new Date('2026-12-01T18:00:00.000Z'),
  endTime: new Date('2026-12-01T20:00:00.000Z'),
  timeZone: 'UTC',
  status: 'PUBLISHED',
  region: 'Kyiv',
  visibility: 'PUBLIC',
  address: 'Street 1',
  latitude: 50.45,
  longitude: 30.52,
  distanceMeters: 120,
  rank: 0,
  ...overrides,
});

const lastSql = () => {
  const call = prisma.$queryRaw.mock.calls.at(-1)![0];
  return { text: sqlText(call), values: call.values as unknown[] };
};

beforeEach(() => prisma.reset());

describe('search cursor', () => {
  const last = {
    id: randomUUID(),
    startTime: '2026-12-01T18:00:00.000Z',
    distanceMeters: 10,
    rank: 2,
  };

  it('round-trips for the same filters', () => {
    const input = query({ text: 'jazz' });
    const cursor = encodeSearchCursor(last, input);
    expect(
      decodeSearchCursor(cursor, { ...input, cursor, limit: 5 }),
    ).toMatchObject(last);
  });

  it('rejects a cursor from other filters', () => {
    const cursor = encodeSearchCursor(last, query({ text: 'jazz' }));
    expect(() => decodeSearchCursor(cursor, query({ text: 'rock' }))).toThrow(
      InvalidSearchCursorError,
    );
  });

  it('rejects malformed and oversized cursors', () => {
    expect(() => decodeSearchCursor('***', query())).toThrow(
      InvalidSearchCursorError,
    );
    expect(() => decodeSearchCursor('a'.repeat(701), query())).toThrow(
      InvalidSearchCursorError,
    );
    const junk = Buffer.from('{"id":1}').toString('base64url');
    expect(() => decodeSearchCursor(junk, query())).toThrow(
      InvalidSearchCursorError,
    );
  });
});

describe('SearchRepository.search', () => {
  it('maps rows and limits searchable statuses', async () => {
    const item = row();
    prisma.$queryRaw.mockResolvedValue([item]);
    const result = await new SearchRepository().search(query());
    expect(result.nextCursor).toBeNull();
    expect(result.items[0]).toMatchObject({
      id: item.id,
      startTime: '2026-12-01T18:00:00.000Z',
      location: { region: 'Kyiv', latitude: 50.45 },
    });
    const { text, values } = lastSql();
    expect(text).toContain('p.status IN (');
    expect(text).toContain('p."endTime" > NOW()');
    expect(text).toContain(`p."eventVisibility" = 'PUBLIC'`);
    expect(values).toEqual(
      expect.arrayContaining(['PUBLISHED', 'ONGOING', 21]),
    );
  });

  it('returns a cursor when there is another page', async () => {
    prisma.$queryRaw.mockResolvedValue([row(), row(), row()]);
    const input = query({ limit: 2 });
    const result = await new SearchRepository().search(input);
    expect(result.items).toHaveLength(2);
    expect(decodeSearchCursor(result.nextCursor!, input).id).toBe(
      result.items[1]!.id,
    );
  });

  it('escapes LIKE wildcards in text search', async () => {
    await new SearchRepository().search(query({ text: '50%_off' }));
    const { text, values } = lastSql();
    expect(text).toContain('p.title ILIKE');
    expect(values).toContain('%50\\%\\_off%');
    expect(values).toContain('50\\%\\_off%');
  });

  it('filters by category, organizer, dates and status', async () => {
    const organizerId = randomUUID();
    await new SearchRepository().search(
      query({
        categoryId: 'uncategorized',
        organizerId,
        startFrom: '2026-12-01T00:00:00.000Z',
        startTo: '2026-12-02T00:00:00.000Z',
        status: 'COMPLETED',
      }),
    );
    const { text, values } = lastSql();
    expect(text).toContain('p."categoryId" IS NULL');
    expect(text).toContain('p."organizerId" = ?::uuid');
    expect(text).toContain('p."startTime" >= ?');
    expect(text).toContain('p."startTime" <= ?');
    expect(text).not.toContain('p.status IN');
    expect(values).toEqual(expect.arrayContaining([organizerId, 'COMPLETED']));
  });

  it('adds a radius filter and distance order for location searches', async () => {
    await new SearchRepository().search(query({ ...near, sort: 'distance' }));
    const { text, values } = lastSql();
    expect(text).toContain('ST_DWithin');
    expect(text).toContain('ORDER BY m."distanceMeters" ASC');
    expect(values).toEqual(expect.arrayContaining([30.52, 50.45, 15000]));
  });

  it('pages after the cursor for every sort', async () => {
    const repository = new SearchRepository();
    for (const sort of ['start_time', 'relevance', 'distance'] as const) {
      const base = query({ ...near, sort, text: 'jazz' });
      const cursor = encodeSearchCursor(
        {
          id: randomUUID(),
          startTime: '2026-12-01T18:00:00.000Z',
          distanceMeters: 5,
          rank: 2,
        },
        base,
      );
      await repository.search({ ...base, cursor });
      expect(lastSql().text).toMatch(
        /WHERE \(m\.(rank|"startTime"|"distanceMeters")/,
      );
    }
  });

  it('rejects a distance cursor without a distance', async () => {
    const base = query({ ...near, sort: 'distance' });
    const cursor = encodeSearchCursor(
      {
        id: randomUUID(),
        startTime: '2026-12-01T18:00:00.000Z',
        distanceMeters: null,
        rank: 0,
      },
      base,
    );
    await expect(
      new SearchRepository().search({ ...base, cursor }),
    ).rejects.toThrow(InvalidSearchCursorError);
  });
});

describe('SearchRepository.map', () => {
  it('returns points with the total match count', async () => {
    const item = { ...row(), total: 3500 };
    prisma.$queryRaw.mockResolvedValue([item]);
    const result = await new SearchRepository().map(query(near));
    expect(result).toEqual({
      points: [
        {
          id: item.id,
          title: item.title,
          region: 'Kyiv',
          visibility: 'PUBLIC',
          latitude: 50.45,
          longitude: 30.52,
        },
      ],
      total: 3500,
    });
    const { text, values } = lastSql();
    expect(text).toContain('COUNT(*) OVER ()');
    expect(text).toContain('ORDER BY "distanceMeters" ASC');
    expect(values).toContain(EVENT_MAP_POINT_LIMIT);
  });

  it('orders by start time without a location', async () => {
    const result = await new SearchRepository().map(query());
    expect(result).toEqual({ points: [], total: 0 });
    expect(lastSql().text).toContain('ORDER BY p."startTime" ASC');
  });
});

describe('SearchPreferenceRepository', () => {
  it('reads a saved mode or UNSET', async () => {
    const repository = new SearchPreferenceRepository();
    prisma.searchPreference.findUnique.mockResolvedValueOnce({ mode: 'CITY' });
    expect(await repository.get('u1')).toBe('CITY');
    prisma.searchPreference.findUnique.mockResolvedValueOnce(null);
    expect(await repository.get('u1')).toBe('UNSET');
  });

  it('upserts the mode', async () => {
    await new SearchPreferenceRepository().save('u1', 'MAP');
    expect(prisma.searchPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', mode: 'MAP' },
      update: { mode: 'MAP' },
    });
  });
});

describe('GeoSearchService', () => {
  const setup = (mode = 'DEVICE') => {
    const repository = {
      search: vi.fn(async () => ({ items: [{}, {}], nextCursor: null })),
      map: vi.fn(async () => ({ points: [], total: 0 })),
    };
    const preferences = { get: vi.fn(async () => mode), save: vi.fn() };
    return {
      repository,
      preferences,
      service: new GeoSearchService(repository as never, preferences as never),
    };
  };

  it('reads and saves the preference', async () => {
    const { service, preferences } = setup('CITY');
    expect(await service.getPreference('u1')).toEqual({ mode: 'CITY' });
    expect(await service.savePreference('u1', 'MAP')).toEqual({ mode: 'MAP' });
    expect(preferences.save).toHaveBeenCalledWith('u1', 'MAP');
  });

  it('searches and queues telemetry', async () => {
    const { service } = setup();
    await service.search('u1', query({ ...near, text: 'jazz' }));
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: EVENT_TYPES.searchPerformed,
        payload: {
          hasText: true,
          hasCategory: false,
          hasLocation: true,
          resultCount: 2,
        },
      },
    });
  });

  it('still returns results when telemetry fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.outboxEvent.create.mockRejectedValue(new Error('db'));
    const { service } = setup();
    await expect(service.search('u1', query())).resolves.toMatchObject({
      nextCursor: null,
    });
  });

  it('rejects a location source that differs from the preference', async () => {
    const { service, repository } = setup('CITY');
    await expect(service.search('u1', query(near))).rejects.toMatchObject({
      code: 'LOCATION_PREFERENCE_REQUIRED',
    });
    await expect(service.map('u1', query(near))).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repository.search).not.toHaveBeenCalled();
    expect(repository.map).not.toHaveBeenCalled();
  });

  it('serves map points without telemetry', async () => {
    const { service, repository } = setup();
    await service.map('u1', query(near));
    expect(repository.map).toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});
