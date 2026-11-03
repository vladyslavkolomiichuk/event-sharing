import { z } from 'zod';
import type {
  EventRouteRequest,
  EventRouteResponse,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { RouteError } from '../domain/errors/RouteError.js';

const RouteResultSchema = z.object({
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.object({
          type: z.literal('LineString'),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
      }),
    )
    .min(1),
});

const costing = {
  walk: 'pedestrian',
  bicycle: 'bicycle',
  car: 'auto',
} as const;

export class ValhallaClient {
  async route(
    origin: EventRouteRequest['origin'],
    destination: EventRouteResponse['destination'],
    mode: EventRouteRequest['mode'],
  ) {
    const body = {
      locations: [
        { lat: origin.latitude, lon: origin.longitude },
        { lat: destination.latitude, lon: destination.longitude },
      ],
      costing: costing[mode],
      format: 'osrm',
      shape_format: 'geojson',
      directions_type: 'none',
      units: 'kilometers',
    };
    const routeUrl = new URL(`${env.VALHALLA_URL.replace(/\/+$/, '')}/route`);
    const response = await fetch(routeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Client-Id': env.VALHALLA_CLIENT_ID,
        ...(env.VALHALLA_API_KEY ? { apikey: env.VALHALLA_API_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    }).catch(() => {
      throw new RouteError(
        'The route service is unavailable.',
        'ROUTING_UNAVAILABLE',
        503,
      );
    });
    if (!response.ok) {
      throw new RouteError(
        response.status === 400
          ? 'No route was found for these points and travel mode.'
          : 'The route service is unavailable.',
        response.status === 400 ? 'ROUTE_NOT_FOUND' : 'ROUTING_UNAVAILABLE',
        response.status === 400 ? 422 : 503,
      );
    }
    const result = RouteResultSchema.parse(await response.json()).routes[0]!;
    return {
      distanceMeters: result.distance,
      durationSeconds: result.duration,
      coordinates: result.geometry.coordinates,
    };
  }
}
