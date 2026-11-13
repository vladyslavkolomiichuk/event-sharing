import { randomUUID } from 'node:crypto';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventDetail } from '../../../test/fixtures.js';
import { serviceBus } from './mocks.js';

vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));

const { ValhallaClient } = await import('../src/clients/ValhallaClient.js');
const { EventLocationClient } =
  await import('../src/clients/EventLocationClient.js');
const { EventRouteService } =
  await import('../src/services/EventRouteService.js');

const origin = { latitude: 50.4, longitude: 30.5 };
const destination = { latitude: 50.45, longitude: 30.52 };
const okRoute = {
  routes: [
    {
      distance: 1200,
      duration: 900,
      geometry: {
        type: 'LineString',
        coordinates: [
          [30.5, 50.4],
          [30.52, 50.45],
        ],
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (response: Response | Error) => {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('ValhallaClient', () => {
  it('posts the route request and maps the first route', async () => {
    const fetch = stubFetch(Response.json(okRoute));
    const result = await new ValhallaClient().route(
      origin,
      destination,
      'walk',
    );
    expect(result).toEqual({
      distanceMeters: 1200,
      durationSeconds: 900,
      coordinates: [
        [30.5, 50.4],
        [30.52, 50.45],
      ],
    });
    const [url, init] = fetch.mock.calls[0]! as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://valhalla.test/route');
    expect(JSON.parse(String(init.body))).toMatchObject({
      costing: 'pedestrian',
      locations: [
        { lat: 50.4, lon: 30.5 },
        { lat: 50.45, lon: 30.52 },
      ],
    });
  });

  it.each([
    [401, 'ROUTING_AUTH_FAILED'],
    [429, 'ROUTING_LIMIT_REACHED'],
    [400, 'ROUTE_NOT_FOUND'],
    [500, 'ROUTING_UNAVAILABLE'],
  ])('maps HTTP %i to %s', async (status, code) => {
    stubFetch(new Response('{}', { status }));
    await expect(
      new ValhallaClient().route(origin, destination, 'car'),
    ).rejects.toMatchObject({ code });
  });

  it('maps network failures and bad bodies', async () => {
    stubFetch(new Error('offline'));
    await expect(
      new ValhallaClient().route(origin, destination, 'bicycle'),
    ).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
    stubFetch(Response.json({ routes: [] }));
    await expect(
      new ValhallaClient().route(origin, destination, 'bicycle'),
    ).rejects.toMatchObject({ code: 'ROUTING_BAD_RESPONSE' });
  });
});

describe('EventLocationClient', () => {
  it('returns the venue coordinates from Events', async () => {
    const event = eventDetail();
    serviceBus.call.mockResolvedValueOnce(event);
    expect(
      await new EventLocationClient().destination(event.id, 'Bearer t'),
    ).toEqual(destination);
    expect(serviceBus.call).toHaveBeenCalledWith(
      'events',
      RPC_OPERATIONS.eventDetail,
      { eventId: event.id },
      'Bearer t',
    );
  });

  it('refuses hidden venues', async () => {
    serviceBus.call.mockResolvedValueOnce(
      eventDetail({
        location: {
          region: 'Kyiv',
          visibility: 'PARTICIPANTS_ONLY',
          address: null,
          latitude: null,
          longitude: null,
        },
      }),
    );
    await expect(
      new EventLocationClient().destination(randomUUID(), 'Bearer t'),
    ).rejects.toMatchObject({ code: 'VENUE_NOT_ACCESSIBLE', statusCode: 403 });
  });
});

describe('EventRouteService', () => {
  it('combines the destination and route', async () => {
    const eventId = randomUUID();
    const events = { destination: vi.fn(async () => destination) };
    const routing = {
      route: vi.fn(async () => ({
        distanceMeters: 1,
        durationSeconds: 2,
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      })),
    };
    const result = await new EventRouteService(
      events as never,
      routing as never,
    ).route({ eventId, origin, mode: 'walk' }, 'Bearer t');
    expect(result).toEqual({
      eventId,
      origin,
      destination,
      mode: 'walk',
      distanceMeters: 1,
      durationSeconds: 2,
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(routing.route).toHaveBeenCalledWith(origin, destination, 'walk');
  });
});
