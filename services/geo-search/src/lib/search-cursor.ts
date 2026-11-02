import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { EventSearchQuery } from '@event-sharing/contracts';
import { InvalidSearchCursorError } from '../domain/errors/InvalidSearchCursorError.js';

const CursorSchema = z.strictObject({
  id: z.uuid(),
  startTime: z.iso.datetime(),
  distanceMeters: z.number().nullable(),
  rank: z.number(),
  fingerprint: z.string(),
});

export type SearchCursor = z.infer<typeof CursorSchema>;

function fingerprint(query: EventSearchQuery): string {
  const { cursor: _cursor, limit: _limit, ...filters } = query;
  return createHash('sha256')
    .update(JSON.stringify(filters))
    .digest('base64url');
}

export function encodeSearchCursor(
  last: Pick<SearchCursor, 'id' | 'startTime' | 'distanceMeters' | 'rank'>,
  query: EventSearchQuery,
): string {
  return Buffer.from(
    JSON.stringify({ ...last, fingerprint: fingerprint(query) }),
  ).toString('base64url');
}

export function decodeSearchCursor(
  value: string,
  query: EventSearchQuery,
): SearchCursor {
  if (value.length > 700 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new InvalidSearchCursorError();
  try {
    const decoded = CursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()) as unknown,
    );
    if (decoded.fingerprint !== fingerprint(query))
      throw new InvalidSearchCursorError();
    return decoded;
  } catch {
    throw new InvalidSearchCursorError();
  }
}
