import { z } from 'zod';

export const PlaceSearchQuerySchema = z.object({
  query: z.string().trim().min(2).max(160),
  kind: z.enum(['city', 'address']),
});

export const PlaceSchema = z.object({
  id: z.string(),
  label: z.string(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const PlaceSearchResponseSchema = z.object({
  items: z.array(PlaceSchema),
});

export const PlaceReverseQuerySchema = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const PlaceReverseResponseSchema = z.object({
  place: PlaceSchema.nullable(),
});

export type Place = z.infer<typeof PlaceSchema>;
export type PlaceKind = z.infer<typeof PlaceSearchQuerySchema>['kind'];
