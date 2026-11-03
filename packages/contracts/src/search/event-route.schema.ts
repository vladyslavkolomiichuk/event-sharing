import { z } from 'zod';

export const RoutePointSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const TravelModeSchema = z.enum(['walk', 'bicycle', 'car']);

export const EventRouteRequestSchema = z.strictObject({
  eventId: z.uuid(),
  origin: RoutePointSchema,
  mode: TravelModeSchema,
});

export const EventRouteResponseSchema = z.strictObject({
  eventId: z.uuid(),
  origin: RoutePointSchema,
  destination: RoutePointSchema,
  mode: TravelModeSchema,
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export type EventRouteRequest = z.infer<typeof EventRouteRequestSchema>;
export type EventRouteResponse = z.infer<typeof EventRouteResponseSchema>;
export type RoutePoint = z.infer<typeof RoutePointSchema>;
export type TravelMode = z.infer<typeof TravelModeSchema>;
