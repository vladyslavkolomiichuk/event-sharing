import { z } from 'zod';

export const EventImageSlotSchema = z.enum(['avatar', 'cover']);
export const StoredFileSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  eventId: z.uuid().nullable(),
  eventSlot: EventImageSlotSchema.nullable(),
  profileOwnerId: z.uuid().nullable(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime(),
});
export const StoredFilePageSchema = z.strictObject({
  items: z.array(StoredFileSchema),
  nextCursor: z.uuid().nullable(),
});
export const EventImagesSchema = z.strictObject({
  avatar: z.boolean(),
  cover: z.boolean(),
});
export type EventImageSlot = z.infer<typeof EventImageSlotSchema>;
export type StoredFile = z.infer<typeof StoredFileSchema>;
export type EventImages = z.infer<typeof EventImagesSchema>;
