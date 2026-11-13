import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SearchEvent } from '@event-sharing/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { eventLocalTime, eventUtcTime, timeZoneLabel } from '@/lib/event-time';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  focusFirstInvalid,
  focusIfFirstInvalid,
  nativeFieldError,
} from '@/lib/form-validation';
import { PhotonClient } from '@/lib/places/PhotonClient';
import { PlaceSearchQuerySchema } from '@/lib/places/place.schema';
import { selectPublicMapEvents } from '@/lib/public-event-map';
import { connectRealtime } from '@/lib/realtime/connectRealtime';
import { cn, sentenceCase } from '@/lib/utils';
import { FrontendRealtimeProxy } from '@/realtime/FrontendRealtimeProxy';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('utils', () => {
  it('formats text and merges classes', () => {
    expect(sentenceCase('hELLO world')).toBe('Hello world');
    expect(cn('p-2', false && 'hidden', 'p-4')).toBe('p-4');
  });

  it('formats dates in English', () => {
    expect(formatDate('2026-12-01T12:00:00.000Z')).toBe('Dec 1, 2026');
    expect(formatDateTime(Date.UTC(2026, 11, 1, 12))).toMatch(
      /^Dec 1, 2026, \d{1,2}:00/,
    );
  });
});

describe('event time', () => {
  it('renames the old Kyiv zone', () => {
    expect(timeZoneLabel('Europe/Kiev')).toBe('Europe/Kyiv');
    expect(timeZoneLabel('UTC')).toBe('UTC');
  });

  it('converts between local and UTC time', () => {
    expect(eventLocalTime('2026-12-01T16:00:00.000Z', 'Europe/Kyiv')).toBe(
      '2026-12-01T18:00',
    );
    expect(eventUtcTime('2026-12-01T18:00', 'Europe/Kyiv')).toBe(
      '2026-12-01T16:00:00.000Z',
    );
    expect(eventUtcTime('2026-07-01T18:00', 'Europe/Kyiv')).toBe(
      '2026-07-01T15:00:00.000Z',
    );
  });

  it('rejects invalid and skipped local times', () => {
    expect(() => eventUtcTime('nope', 'UTC')).toThrow(
      'Enter a valid event date and time.',
    );
    expect(() => eventUtcTime('2026-03-29T03:30', 'Europe/Kyiv')).toThrow(
      'This time does not exist in the selected time zone.',
    );
  });
});

describe('form validation', () => {
  class Input {
    type = 'text';
    minLength = 3;
    maxLength = 10;
    min = '1';
    max = '9';
    focus = vi.fn();
    form: unknown = null;
    constructor(public validity: Record<string, boolean>) {}
  }

  it('describes each native validity state', () => {
    vi.stubGlobal('HTMLInputElement', Input);
    const message = (validity: Record<string, boolean>, type = 'text') => {
      const input = new Input(validity);
      input.type = type;
      return nativeFieldError(input as never);
    };
    expect(message({ valueMissing: true })).toBe('This field is required.');
    expect(message({ typeMismatch: true }, 'email')).toBe(
      'Enter a valid email address.',
    );
    expect(message({ typeMismatch: true }, 'url')).toBe('Enter a valid URL.');
    expect(message({ tooShort: true })).toBe('Use at least 3 characters.');
    expect(message({ rangeOverflow: true })).toBe(
      'Enter a value of no more than 9.',
    );
    expect(message({ patternMismatch: true })).toBe('Use the required format.');
    expect(message({})).toBe('');
  });

  it('focuses the first visible invalid field', () => {
    const hidden = { offsetParent: null, focus: vi.fn() };
    const visible = { offsetParent: {}, focus: vi.fn() };
    focusFirstInvalid({ querySelectorAll: () => [hidden, visible] } as never);
    expect(visible.focus).toHaveBeenCalled();
    expect(hidden.focus).not.toHaveBeenCalled();
    focusFirstInvalid(null);
    const field = new Input({});
    field.form = { querySelector: () => field };
    focusIfFirstInvalid(field as never);
    expect(field.focus).toHaveBeenCalled();
  });
});

describe('selectPublicMapEvents', () => {
  let counter = 0;
  const event = (
    latitude: number | null,
    longitude: number | null,
    extra: Partial<SearchEvent> = {},
  ) =>
    ({
      id: `e${counter++}`,
      status: 'PUBLISHED',
      location: {
        visibility: 'PUBLIC',
        latitude,
        longitude,
        region: null,
        address: null,
      },
      ...extra,
    }) as SearchEvent;

  it('keeps public live events with valid rounded points', () => {
    const events = [
      event(50.4512, 30.5234),
      event(50.4498, 30.5201),
      event(null, 30),
      event(95, 30),
      event(50, 30, { status: 'COMPLETED' }),
      event(51, 31, {
        location: {
          visibility: 'PARTICIPANTS_ONLY',
          latitude: 51,
          longitude: 31,
          region: null,
          address: null,
        },
      }),
    ];
    const selected = selectPublicMapEvents(events);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.mapPoint).toEqual({
      latitude: 50.45,
      longitude: 30.52,
    });
  });

  it('spreads picks across regions and respects the limit', () => {
    const kyiv = Array.from({ length: 12 }, (_, index) =>
      event(50 + index * 0.1, 30.5),
    );
    const lviv = [event(49.84, 24.03)];
    const selected = selectPublicMapEvents([...kyiv, ...lviv], 3);
    expect(selected.map((item) => item.location.longitude)).toContain(24.03);
    expect(selected).toHaveLength(3);
    expect(selectPublicMapEvents(kyiv, 100)).toHaveLength(8);
    expect(selectPublicMapEvents(kyiv, 0)).toEqual([]);
  });
});

describe('PhotonClient', () => {
  const feature = (
    properties: Record<string, unknown>,
    coordinates = [30.52, 50.45],
  ) => ({
    geometry: { coordinates },
    properties,
  });

  it('builds city suggestions and caches them', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        features: [
          feature({
            name: 'Kyiv',
            country: 'Ukraine',
            osm_type: 'R',
            osm_id: 1,
          }),
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const client = new PhotonClient();
    const [place] = await client.search('Kyiv', 'city');
    expect(place).toEqual({
      id: 'R:1',
      label: 'Kyiv, Ukraine',
      city: 'Kyiv',
      region: 'Kyiv, Ukraine',
      address: 'Kyiv, Ukraine',
      latitude: 50.45,
      longitude: 30.52,
    });
    const [url] = fetch.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.getAll('layer')).toEqual(['city', 'locality']);
    await client.search('KYIV', 'city');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('prefers street results when reverse geocoding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          features: [
            feature({ name: 'Park' }),
            feature({ street: 'Khreshchatyk', housenumber: '1', city: 'Kyiv' }),
          ],
        }),
      ),
    );
    expect((await new PhotonClient().reverse(50.45, 30.52))?.label).toBe(
      'Khreshchatyk 1, Kyiv',
    );
  });

  it('clears the address of non-street places and fails on errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ features: [feature({ name: 'Park', city: 'Kyiv' })] }),
      ),
    );
    expect((await new PhotonClient().reverse(1, 2))?.address).toBe('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ features: [] })),
    );
    expect(await new PhotonClient().reverse(1, 2)).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    await expect(new PhotonClient().search('x', 'address')).rejects.toThrow(
      'Place suggestions are unavailable.',
    );
  });

  it('validates search queries', () => {
    expect(
      PlaceSearchQuerySchema.safeParse({ query: 'K', kind: 'city' }).success,
    ).toBe(false);
  });
});

describe('connectRealtime', () => {
  class FakeSocket {
    static all: FakeSocket[] = [];
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    close = vi.fn(() => this.onclose?.());
    constructor(readonly url: string) {
      FakeSocket.all.push(this);
    }
  }

  const setup = () => {
    FakeSocket.all = [];
    const listeners: Record<string, () => void> = {};
    const target = {
      addEventListener: (name: string, listener: () => void) =>
        (listeners[name] = listener),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('window', {
      ...target,
      location: { protocol: 'https:', host: 'app.test' },
    });
    vi.stubGlobal('document', { ...target, visibilityState: 'visible' });
    const options = {
      path: '/realtime/notifications',
      signalType: 'notifications.changed',
      onConnected: vi.fn(),
      onSignal: vi.fn(),
      onDisconnected: vi.fn(),
      onRestored: vi.fn(),
    };
    return { options, listeners };
  };

  it('connects over wss and forwards matching signals', () => {
    const { options } = setup();
    const stop = connectRealtime(options);
    const socket = FakeSocket.all[0]!;
    expect(socket.url).toBe('wss://app.test/realtime/notifications');
    socket.onopen!();
    expect(options.onConnected).toHaveBeenCalled();
    socket.onmessage!({ data: '{"type":"notifications.changed"}' });
    socket.onmessage!({ data: '{"type":"other"}' });
    socket.onmessage!({ data: 'not json' });
    expect(options.onSignal).toHaveBeenCalledTimes(1);
    stop();
  });

  it('retries with backoff and reports outages and recovery', () => {
    vi.useFakeTimers();
    const { options } = setup();
    const stop = connectRealtime(options);
    FakeSocket.all[0]!.onclose!();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.onclose!();
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(2000);
    expect(options.onDisconnected).toHaveBeenCalled();
    FakeSocket.all.at(-1)!.onopen!();
    expect(options.onRestored).toHaveBeenCalled();
    stop();
  });

  it('reconnects when the browser comes back online', () => {
    const { options, listeners } = setup();
    const stop = connectRealtime(options);
    listeners.online!();
    expect(FakeSocket.all).toHaveLength(2);
    stop();
    expect(FakeSocket.all[1]!.close).toHaveBeenCalled();
  });
});

describe('FrontendRealtimeProxy', () => {
  it('relays messages from the gateway to the browser', async () => {
    const cookies: string[] = [];
    const gateway = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    gateway.on('connection', (socket, request) => {
      cookies.push(String(request.headers.cookie));
      socket.send('{"type":"messages.changed"}');
    });
    await new Promise((resolve) => gateway.once('listening', resolve));
    const proxy = new FrontendRealtimeProxy(
      `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`,
      'http://app.test',
    );
    const server = createServer();
    server.on('upgrade', (request, socket, head) =>
      proxy.upgrade(request, socket, head),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const browser = new WebSocket(`${base}/realtime/messages`, {
      headers: { origin: 'http://app.test', cookie: 'session=1' },
    });
    const message = await new Promise<string>((resolve) =>
      browser.once('message', (data) => resolve(String(data))),
    );
    expect(message).toBe('{"type":"messages.changed"}');
    expect(cookies).toEqual(['session=1']);
    expect(proxy.handles({ url: '/realtime/notifications?x=1' } as never)).toBe(
      true,
    );

    const foreign = new WebSocket(`${base}/realtime/messages`, {
      headers: { origin: 'https://evil.test', cookie: 'a' },
    });
    await new Promise((resolve) => foreign.once('error', resolve));
    browser.close();
    proxy.close();
    server.close();
    gateway.close();
  });
});
