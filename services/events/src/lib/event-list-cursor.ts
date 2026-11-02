import { createHash } from 'node:crypto';
import { z } from 'zod';
import { InvalidEventCursorError } from '../domain/errors/InvalidEventCursorError.js';

export type EventListScope = {
  list: 'public' | 'mine' | 'organizer';
  ownerId?: string;
  categoryId?: string;
};

const CursorSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  fingerprint: z.string().min(1),
});

export type EventListCursor = z.infer<typeof CursorSchema>;

function fingerprint(scope: EventListScope): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        list: scope.list,
        ownerId: scope.ownerId ?? null,
        categoryId: scope.categoryId ?? null,
      }),
    )
    .digest('base64url');
}

export function encodeEventListCursor(
  id: string,
  createdAt: Date,
  scope: EventListScope,
): string {
  const value = CursorSchema.parse({
    version: 1,
    id,
    createdAt: createdAt.toISOString(),
    fingerprint: fingerprint(scope),
  });
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeEventListCursor(
  encoded: string,
  scope: EventListScope,
): EventListCursor {
  if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded))
    throw new InvalidEventCursorError();
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString(),
    );
    const cursor = CursorSchema.parse(value);
    if (cursor.fingerprint !== fingerprint(scope))
      throw new InvalidEventCursorError();
    return cursor;
  } catch {
    throw new InvalidEventCursorError();
  }
}
