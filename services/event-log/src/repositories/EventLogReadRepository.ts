import {
  EventLogAnalyticsSchema,
  EventLogPageSchema,
  EVENT_SNAPSHOT_TYPES,
  EVENT_TYPES,
} from '@event-sharing/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { z } from 'zod';
import { prisma } from '../database/client.js';
import { InvalidEventLogCursorError } from '../domain/errors/InvalidEventLogCursorError.js';
import type { EventLogListQuery } from '../schemas/event-log-query.schema.js';

const CursorSchema = z.strictObject({
  occurredAt: z.iso.datetime(),
  id: z.uuid(),
});

function decodeCursor(value: string) {
  try {
    return CursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
  } catch {
    throw new InvalidEventLogCursorError();
  }
}

export class EventLogReadRepository {
  async list(query: EventLogListQuery) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const where: Prisma.EventLogEntryWhereInput = {
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.producer ? { producer: query.producer } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.relatedEventId ? { relatedEventId: query.relatedEventId } : {}),
      occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: new Date(cursor.occurredAt) } },
              {
                occurredAt: new Date(cursor.occurredAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };
    const entries = await prisma.eventLogEntry.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = entries.slice(0, query.limit);
    const last = page.at(-1);
    return EventLogPageSchema.parse({
      items: page.map((entry) => ({
        id: entry.id,
        eventType: entry.eventType,
        producer: entry.producer,
        topic: entry.topic,
        occurredAt: entry.occurredAt.toISOString(),
        receivedAt: entry.receivedAt.toISOString(),
        actorId: entry.actorId,
        subjectUserId: entry.subjectUserId,
        relatedEventId: entry.relatedEventId,
        summary: entry.summary,
        details: entry.details,
      })),
      nextCursor:
        entries.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                occurredAt: last.occurredAt.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    });
  }

  async analytics(days: number) {
    const through = new Date();
    const from = new Date(
      Date.UTC(
        through.getUTCFullYear(),
        through.getUTCMonth(),
        through.getUTCDate() - days + 1,
      ),
    );
    const [counts, daily, categories, statuses, progress, actors, search] =
      await Promise.all([
        prisma.eventLogEntry.groupBy({
          by: ['eventType'],
          where: { occurredAt: { gte: from, lte: through } },
          _count: { _all: true },
        }),
        prisma.$queryRaw<
          Array<{ day: Date; eventType: string; count: bigint }>
        >(Prisma.sql`
        SELECT DATE(e."occurredAt" AT TIME ZONE 'UTC') AS day, e."eventType", COUNT(*) AS count
        FROM "event_log_entry" e
        WHERE e."occurredAt" >= ${from} AND e."occurredAt" <= ${through}
        GROUP BY day, e."eventType" ORDER BY day ASC, e."eventType" ASC
      `),
        prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT COALESCE(e.details->>'category', 'Uncategorized') AS name, COUNT(*) AS count
        FROM "event_log_entry" e
        WHERE e."eventType" = ${EVENT_TYPES.eventCreated} AND e."occurredAt" >= ${from} AND e."occurredAt" <= ${through}
        GROUP BY name ORDER BY count DESC, name ASC LIMIT 8
      `),
        prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT latest.details->>'status' AS name, COUNT(*) AS count
        FROM (
          SELECT DISTINCT ON (e."relatedEventId") e.details
          FROM "event_log_entry" e
          WHERE e."eventType" IN (${Prisma.join([...EVENT_SNAPSHOT_TYPES])})
            AND e."relatedEventId" IS NOT NULL
            AND e."occurredAt" <= ${through}
          ORDER BY e."relatedEventId", e."occurredAt" DESC, e.id DESC
        ) latest
        WHERE latest.details->>'status' IS NOT NULL
        GROUP BY name ORDER BY count DESC, name ASC
      `),
        prisma.consumerProgress.findMany({
          orderBy: [{ topic: 'asc' }, { partition: 'asc' }],
        }),
        prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT e."actorId") AS count FROM "event_log_entry" e
        WHERE e."actorId" IS NOT NULL AND e."occurredAt" >= ${from} AND e."occurredAt" <= ${through}
      `),
        prisma.$queryRaw<
          Array<{
            withLocation: bigint;
            withText: bigint;
            withCategory: bigint;
            zeroResults: bigint;
            resultsShown: bigint;
          }>
        >(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE details->>'hasLocation' = 'true') AS "withLocation",
          COUNT(*) FILTER (WHERE details->>'hasText' = 'true') AS "withText",
          COUNT(*) FILTER (WHERE details->>'hasCategory' = 'true') AS "withCategory",
          COUNT(*) FILTER (WHERE (details->>'resultCount')::integer = 0) AS "zeroResults",
          COALESCE(SUM((details->>'resultCount')::integer), 0) AS "resultsShown"
        FROM "event_log_entry" e
        WHERE e."eventType" = ${EVENT_TYPES.searchPerformed} AND e."occurredAt" >= ${from} AND e."occurredAt" <= ${through}
      `),
      ]);
    const searchRow = search[0];
    return EventLogAnalyticsSchema.parse({
      days,
      from: from.toISOString(),
      through: through.toISOString(),
      totals: Object.fromEntries(
        counts.map((item) => [item.eventType, item._count._all]),
      ),
      activeActors: Number(actors[0]?.count ?? 0),
      search: {
        withLocation: Number(searchRow?.withLocation ?? 0),
        withText: Number(searchRow?.withText ?? 0),
        withCategory: Number(searchRow?.withCategory ?? 0),
        zeroResults: Number(searchRow?.zeroResults ?? 0),
        resultsShown: Number(searchRow?.resultsShown ?? 0),
      },
      daily: daily.map((item) => ({
        day:
          item.day instanceof Date
            ? item.day.toISOString().slice(0, 10)
            : String(item.day).slice(0, 10),
        eventType: item.eventType,
        count: Number(item.count),
      })),
      categories: categories.map((item) => ({
        name: item.name,
        count: Number(item.count),
      })),
      eventStatuses: statuses.map((item) => ({
        name: item.name,
        count: Number(item.count),
      })),
      progress: progress.map((item) => ({
        topic: item.topic,
        partition: item.partition,
        lastOffset: item.lastOffset.toString(),
        receivedAt: item.receivedAt.toISOString(),
      })),
    });
  }
}
