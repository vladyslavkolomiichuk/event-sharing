import {
  EventSearchResultSchema,
  SEARCHABLE_EVENT_STATUSES,
  type EventSearchQuery,
  type EventSearchResult,
} from '@event-sharing/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { InvalidSearchCursorError } from '../domain/errors/InvalidSearchCursorError.js';
import {
  decodeSearchCursor,
  encodeSearchCursor,
} from '../lib/search-cursor.js';

type SearchRow = {
  id: string;
  organizerId: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  status: string;
  region: string | null;
  visibility: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  rank: number;
};

export class SearchRepository {
  async search(query: EventSearchQuery): Promise<EventSearchResult> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.status IN (${Prisma.join([...SEARCHABLE_EVENT_STATUSES])})`,
      Prisma.sql`p."endTime" > NOW()`,
    ];
    if (query.categoryId === 'uncategorized')
      conditions.push(Prisma.sql`p."categoryId" IS NULL`);
    else if (query.categoryId)
      conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}::uuid`);
    if (query.organizerId)
      conditions.push(Prisma.sql`p."organizerId" = ${query.organizerId}::uuid`);
    if (query.status) conditions.push(Prisma.sql`p.status = ${query.status}`);
    if (query.startFrom)
      conditions.push(
        Prisma.sql`p."startTime" >= ${new Date(query.startFrom)}`,
      );
    if (query.startTo)
      conditions.push(Prisma.sql`p."startTime" <= ${new Date(query.startTo)}`);

    const term = query.text?.trim();
    if (term) {
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(Prisma.sql`(
        p.title ILIKE ${pattern} OR p.description ILIKE ${pattern}
        OR p.region ILIKE ${pattern} OR p."categoryName" ILIKE ${pattern}
      )`);
    }

    const hasLocation =
      query.latitude !== undefined && query.longitude !== undefined;
    const origin = hasLocation
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography`
      : Prisma.sql`NULL::geography`;
    if (hasLocation && query.radiusMeters !== undefined) {
      conditions.push(
        Prisma.sql`ST_DWithin(p.location, ${origin}, ${query.radiusMeters})`,
      );
    }

    const distance = hasLocation
      ? Prisma.sql`ST_Distance(p.location, ${origin})`
      : Prisma.sql`NULL::double precision`;
    const rank = term
      ? Prisma.sql`CASE
          WHEN lower(p.title) = ${term.toLowerCase()} THEN 3
          WHEN lower(p.title) LIKE ${`${term.toLowerCase()}%`} THEN 2
          ELSE 1 END`
      : Prisma.sql`0`;

    const cursor = query.cursor
      ? decodeSearchCursor(query.cursor, query)
      : null;
    if (cursor && query.sort === 'distance' && cursor.distanceMeters === null)
      throw new InvalidSearchCursorError();
    let after: Prisma.Sql = Prisma.sql`TRUE`;
    let order: Prisma.Sql = Prisma.sql`m."startTime" ASC, m.id ASC`;
    if (query.sort === 'distance') {
      order = Prisma.sql`m."distanceMeters" ASC, m."startTime" ASC, m.id ASC`;
      if (cursor)
        after = Prisma.sql`(m."distanceMeters", m."startTime", m.id) > (${cursor.distanceMeters}, ${new Date(cursor.startTime)}, ${cursor.id}::uuid)`;
    } else if (query.sort === 'relevance') {
      order = Prisma.sql`m.rank DESC, m."startTime" ASC, m.id ASC`;
      if (cursor)
        after = Prisma.sql`(m.rank < ${cursor.rank} OR (m.rank = ${cursor.rank} AND (m."startTime", m.id) > (${new Date(cursor.startTime)}, ${cursor.id}::uuid)))`;
    } else if (cursor) {
      after = Prisma.sql`(m."startTime", m.id) > (${new Date(cursor.startTime)}, ${cursor.id}::uuid)`;
    }

    const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH matches AS (
        SELECT p.id, p."organizerId", p."categoryId", p."categoryName",
          p.title, p.description, p."startTime", p."endTime", p.status,
          p.region, p.visibility, p.address, p.latitude, p.longitude,
          ${distance} AS "distanceMeters", ${rank} AS rank
        FROM "event_projection" p
        WHERE ${Prisma.join(conditions, ' AND ')}
      )
      SELECT * FROM matches m
      WHERE ${after}
      ORDER BY ${order}
      LIMIT ${query.limit + 1}
    `);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return EventSearchResultSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        organizerId: row.organizerId,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        title: row.title,
        description: row.description,
        startTime: row.startTime.toISOString(),
        endTime: row.endTime.toISOString(),
        status: row.status,
        distanceMeters: row.distanceMeters,
        location: {
          region: row.region,
          visibility: row.visibility,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
        },
      })),
      nextCursor:
        rows.length > query.limit && last
          ? encodeSearchCursor(
              {
                id: last.id,
                startTime: last.startTime.toISOString(),
                distanceMeters: last.distanceMeters,
                rank: last.rank,
              },
              query,
            )
          : null,
    });
  }
}
