import { describe, expect, it } from 'vitest';
import {
  AvatarUrlSchema,
  ChosenUsernameSchema,
  CreateEventSchema,
  DisplayNameSchema,
  EVENT_MAP_POINT_LIMIT,
  EVENT_ROUTES,
  EVENT_TYPES,
  EventEnvelopeSchema,
  EventMapResultSchema,
  EventSearchQuerySchema,
  EventTimeZoneSchema,
  UpdateEventSchema,
  UpdateIdentitySchema,
  UpdateUserProfileSchema,
  UsernameSchema,
  needsUsernameSelection,
  profileAvatarPath,
  usernameCandidates,
} from '../src/index.js';

const UUID = '7d1f5b8e-2c4a-4f6e-9b3d-1a2b3c4d5e6f';
const location = {
  address: 'Khreshchatyk 1',
  latitude: 50.45,
  longitude: 30.52,
};
const event = {
  title: 'Jazz night',
  description: 'Live music.',
  startTime: '2026-12-01T18:00:00.000Z',
  endTime: '2026-12-01T21:00:00.000Z',
  location,
  participantLimit: 20,
};

describe('usernameCandidates', () => {
  it('transliterates Cyrillic names into joined candidates', () => {
    const candidates = usernameCandidates('Ірина Мельник');
    expect(candidates.slice(0, 2)).toEqual(['iryna_melnyk', 'irynamelnyk']);
    expect(candidates).toContain('iryna_melnyk2');
  });

  it('adds numeric suffixes to a single name', () => {
    expect(usernameCandidates('Olena').slice(0, 2)).toEqual([
      'olena_1',
      'olena1',
    ]);
  });

  it('drops accents and returns nothing for symbols only', () => {
    expect(usernameCandidates('José Núñez')[0]).toBe('jose_nunez');
    expect(usernameCandidates('!!!')).toEqual([]);
  });

  it('returns only valid unique usernames', () => {
    const candidates = usernameCandidates(
      'Very Longfirstnameexceeding Lastnamewhichislong',
    );
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const value of candidates) {
      expect(ChosenUsernameSchema.safeParse(value).success).toBe(true);
    }
  });

  it('skips names that would start with a digit', () => {
    expect(usernameCandidates('2pac')).toEqual([]);
  });
});

describe('identity schemas', () => {
  it('normalizes usernames and rejects reserved ones', () => {
    expect(UsernameSchema.parse('  Iryna_M ')).toBe('iryna_m');
    expect(UsernameSchema.safeParse('admin').success).toBe(false);
    expect(UsernameSchema.safeParse('1abc').success).toBe(false);
  });

  it('requires a personal username for chosen names', () => {
    const generated = `user_${'a'.repeat(24)}`;
    expect(UsernameSchema.safeParse(generated).success).toBe(true);
    expect(ChosenUsernameSchema.safeParse(generated).success).toBe(false);
  });

  it('detects usernames that still need selection', () => {
    expect(needsUsernameSelection(null)).toBe(true);
    expect(needsUsernameSelection(`user_${'0'.repeat(24)}`)).toBe(true);
    expect(needsUsernameSelection('iryna')).toBe(false);
  });

  it('validates display names', () => {
    expect(DisplayNameSchema.parse(" Ірина O'Neil-Smith ")).toBe(
      "Ірина O'Neil-Smith",
    );
    expect(DisplayNameSchema.safeParse('<script>').success).toBe(false);
  });

  it('requires a name or username in identity updates', () => {
    expect(UpdateIdentitySchema.safeParse({}).success).toBe(false);
    expect(UpdateIdentitySchema.safeParse({ name: 'Iryna' }).success).toBe(
      true,
    );
  });
});

describe('avatar URLs', () => {
  it('builds and accepts the internal avatar path', () => {
    const path = profileAvatarPath(UUID);
    expect(path).toBe(`/backend/api/storage/profiles/${UUID}/avatar`);
    expect(AvatarUrlSchema.safeParse(path).success).toBe(true);
  });

  it('accepts absolute URLs and rejects other paths', () => {
    expect(AvatarUrlSchema.safeParse('https://cdn.test/a.png').success).toBe(
      true,
    );
    expect(AvatarUrlSchema.safeParse('/etc/passwd').success).toBe(false);
  });
});

describe('event schemas', () => {
  it('applies defaults to a created event', () => {
    const parsed = CreateEventSchema.parse(event);
    expect(parsed).toMatchObject({
      timeZone: 'UTC',
      chatEnabled: false,
      visibility: 'PUBLIC',
      location: { visibility: 'PARTICIPANTS_ONLY' },
    });
  });

  it('rejects an end time before the start time', () => {
    const result = CreateEventSchema.safeParse({
      ...event,
      endTime: '2026-12-01T17:00:00.000Z',
    });
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('rejects unknown fields and bad coordinates', () => {
    expect(CreateEventSchema.safeParse({ ...event, extra: 1 }).success).toBe(
      false,
    );
    expect(
      CreateEventSchema.safeParse({
        ...event,
        location: { ...location, latitude: 91 },
      }).success,
    ).toBe(false);
  });

  it('requires at least one field in an update', () => {
    expect(UpdateEventSchema.safeParse({}).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ title: 'New' }).success).toBe(true);
  });

  it('validates IANA time zones', () => {
    expect(EventTimeZoneSchema.safeParse('Europe/Kyiv').success).toBe(true);
    expect(EventTimeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('EventSearchQuerySchema', () => {
  const near = {
    latitude: 50.45,
    longitude: 30.52,
    radiusMeters: 15000,
    locationSource: 'DEVICE',
  };

  it('applies sort and limit defaults', () => {
    expect(EventSearchQuerySchema.parse({})).toEqual({
      sort: 'start_time',
      limit: 20,
    });
  });

  it('accepts a complete location search', () => {
    expect(
      EventSearchQuerySchema.safeParse({ ...near, sort: 'distance' }).success,
    ).toBe(true);
  });

  it('requires all location fields together', () => {
    const result = EventSearchQuerySchema.safeParse({
      latitude: 50,
      locationSource: 'DEVICE',
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(
      'latitude',
    );
  });

  it('requires a location for distance sorting', () => {
    const result = EventSearchQuerySchema.safeParse({ sort: 'distance' });
    expect(result.error?.issues[0]?.path).toEqual(['sort']);
  });

  it('ties the location source to location searches', () => {
    const { locationSource: _, ...withoutSource } = near;
    expect(EventSearchQuerySchema.safeParse(withoutSource).success).toBe(false);
    expect(
      EventSearchQuerySchema.safeParse({ locationSource: 'DEVICE' }).success,
    ).toBe(false);
  });

  it('rejects an inverted date range and large radius', () => {
    expect(
      EventSearchQuerySchema.safeParse({
        startFrom: '2026-12-02T00:00:00.000Z',
        startTo: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      EventSearchQuerySchema.safeParse({ ...near, radiusMeters: 100001 })
        .success,
    ).toBe(false);
  });

  it('accepts the uncategorized filter', () => {
    expect(
      EventSearchQuerySchema.safeParse({ categoryId: 'uncategorized' }).success,
    ).toBe(true);
  });
});

describe('EventMapResultSchema', () => {
  const point = {
    id: UUID,
    title: 'Jazz',
    region: null,
    visibility: 'PUBLIC',
    latitude: 50,
    longitude: 30,
  };

  it('accepts points up to the limit', () => {
    expect(
      EventMapResultSchema.safeParse({ points: [point], total: 1 }).success,
    ).toBe(true);
  });

  it('rejects more points than the limit', () => {
    const points = Array.from(
      { length: EVENT_MAP_POINT_LIMIT + 1 },
      () => point,
    );
    expect(EventMapResultSchema.safeParse({ points, total: 1 }).success).toBe(
      false,
    );
  });
});

describe('UpdateUserProfileSchema', () => {
  it('requires a profile field or preference', () => {
    expect(UpdateUserProfileSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserProfileSchema.safeParse({ preferences: {} }).success).toBe(
      false,
    );
    expect(
      UpdateUserProfileSchema.safeParse({ preferences: { showCity: true } })
        .success,
    ).toBe(true);
    expect(UpdateUserProfileSchema.safeParse({ city: null }).success).toBe(
      true,
    );
  });

  it('enforces E.164 phone numbers', () => {
    expect(
      UpdateUserProfileSchema.safeParse({ phone: '+380501234567' }).success,
    ).toBe(true);
    expect(
      UpdateUserProfileSchema.safeParse({ phone: '0501234567' }).success,
    ).toBe(false);
  });
});

describe('event routing', () => {
  it('routes every event type', () => {
    expect(Object.keys(EVENT_ROUTES).sort()).toEqual(
      Object.values(EVENT_TYPES).sort(),
    );
  });

  it('validates event envelopes', () => {
    const envelope = {
      eventId: UUID,
      eventType: EVENT_TYPES.eventCreated,
      eventVersion: 1,
      occurredAt: '2026-11-13T10:00:00.000Z',
      correlationId: UUID,
      producer: 'events',
      payload: {},
    };
    expect(EventEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(
      EventEnvelopeSchema.safeParse({ ...envelope, eventVersion: 2 }).success,
    ).toBe(false);
  });
});
