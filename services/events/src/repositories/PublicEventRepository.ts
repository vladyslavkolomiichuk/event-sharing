import { prisma } from '../database/client.js';
import { Prisma } from '../generated/prisma/client.js';

type PublicMapRow = {
  id: string;
  organizerId: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  status: string;
  region: string | null;
  latitude: number;
  longitude: number;
};

export class PublicEventRepository {
  async map(limit: number) {
    const rows = await prisma.$queryRaw<PublicMapRow[]>(Prisma.sql`
      WITH public_events AS (
        SELECT e.id, e."organizerId", e."categoryId", c.name AS "categoryName",
          e.title, e.description, e."startTime", e."endTime", e."timeZone",
          e.status::text, e."locationRegion" AS region,
          round(e.latitude, 2)::double precision AS latitude,
          round(e.longitude, 2)::double precision AS longitude
        FROM event e
        LEFT JOIN category c ON c.id = e."categoryId"
        WHERE e.visibility = 'PUBLIC' AND e."locationVisibility" = 'PUBLIC'
          AND e.status IN ('PUBLISHED', 'ONGOING') AND e."endTime" > NOW()
      ), positions AS (
        SELECT *, row_number() OVER (
          PARTITION BY latitude, longitude ORDER BY "startTime", id
        ) AS position_rank FROM public_events
      ), cells AS (
        SELECT *, row_number() OVER (
          PARTITION BY floor((latitude + 90) / 5), floor((longitude + 180) / 5)
          ORDER BY "startTime", id
        ) AS cell_rank FROM positions WHERE position_rank = 1
      )
      SELECT * FROM cells ORDER BY cell_rank, "startTime", id LIMIT ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      organizerId: row.organizerId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      title: row.title,
      description: row.description,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      timeZone: row.timeZone,
      status: row.status,
      distanceMeters: null,
      location: {
        region: row.region,
        visibility: 'PUBLIC',
        address: null,
        latitude: row.latitude,
        longitude: row.longitude,
      },
    }));
  }

  async isVisible(id: string): Promise<boolean> {
    return Boolean(
      await prisma.event.findFirst({
        where: {
          id,
          visibility: 'PUBLIC',
          locationVisibility: 'PUBLIC',
          status: { in: ['PUBLISHED', 'ONGOING'] },
          endTime: { gt: new Date() },
        },
        select: { id: true },
      }),
    );
  }
}
