import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { eventRow } from './rows.js';

vi.mock('../src/database/client.js', () => import('./rows.js'));

const { EventLifecyclePolicy } =
  await import('../src/domain/EventLifecyclePolicy.js');
const { approximateLocation } =
  await import('../src/lib/approximate-location.js');
const { eventDetailsChanged } =
  await import('../src/lib/event-details-changed.js');
const { decodeEventListCursor, encodeEventListCursor } =
  await import('../src/lib/event-list-cursor.js');
const { EventResponseFactory } =
  await import('../src/services/EventResponseFactory.js');
const { EventReasonSchema } =
  await import('../src/schemas/event-reason.schema.js');
const { ListEventsQuerySchema, ListOwnedEventsQuerySchema } =
  await import('../src/schemas/list-events.schema.js');

describe('EventLifecyclePolicy', () => {
  const policy = new EventLifecyclePolicy();
  const owner = randomUUID();

  it('lets only admins moderate', () => {
    expect(() =>
      policy.assertRole('approve', 'ORGANIZER', owner, owner),
    ).toThrow();
    expect(() =>
      policy.assertRole('reject', 'ADMIN', owner, randomUUID()),
    ).not.toThrow();
  });

  it('lets owners and admins run other actions', () => {
    expect(() =>
      policy.assertRole('publish', 'ORGANIZER', owner, owner),
    ).not.toThrow();
    expect(() =>
      policy.assertRole('cancel', 'ADMIN', owner, randomUUID()),
    ).not.toThrow();
    expect(() =>
      policy.assertRole('cancel', 'ORGANIZER', owner, randomUUID()),
    ).toThrow('You cannot perform this action.');
  });

  it.each([
    ['submit', 'DRAFT', true],
    ['submit', 'REJECTED', true],
    ['submit', 'PUBLISHED', false],
    ['publish', 'APPROVED', true],
    ['publish', 'MODERATION', false],
    ['start', 'PUBLISHED', true],
    ['start', 'ONGOING', false],
    ['complete', 'ONGOING', true],
    ['cancel', 'COMPLETED', false],
    ['archive', 'CANCELLED', true],
    ['open', 'DRAFT', false],
  ] as const)('%s from %s allowed: %s', (action, status, allowed) => {
    const check = () => policy.assertTransition(action, status);
    if (allowed) expect(check).not.toThrow();
    else
      expect(check).toThrow(`Cannot ${action} an event in status ${status}.`);
  });

  it('allows edits only in editable statuses', () => {
    expect(() => policy.assertEditable('PUBLISHED')).not.toThrow();
    expect(() => policy.assertEditable('ONGOING')).toThrow(
      expect.objectContaining({ code: 'EVENT_NOT_EDITABLE' }),
    );
  });
});

describe('approximateLocation', () => {
  it('snaps coordinates to a coarse grid', () => {
    const point = approximateLocation(50.45011, 30.52341);
    expect(point.latitude).toBe(50.45);
    expect(Math.abs(point.longitude - 30.52341)).toBeLessThan(0.004);
    expect(point).toEqual(approximateLocation(50.4502, 30.5236));
  });

  it('stays inside valid bounds near the poles and date line', () => {
    const point = approximateLocation(89.999, 179.999);
    expect(point.longitude).toBeLessThanOrEqual(180);
    expect(point.latitude).toBeLessThanOrEqual(90);
  });
});

describe('eventDetailsChanged', () => {
  const before = eventRow();

  it('ignores status-only changes', () => {
    expect(
      eventDetailsChanged(before, { ...before, status: 'PUBLISHED' }),
    ).toBe(false);
  });

  it('detects changed details and coordinates', () => {
    expect(eventDetailsChanged(before, { ...before, title: 'New' })).toBe(true);
    expect(
      eventDetailsChanged(before, {
        ...before,
        startTime: new Date(before.startTime.getTime() + 1),
      }),
    ).toBe(true);
    expect(eventDetailsChanged(before, { ...before, latitude: '50.1' })).toBe(
      true,
    );
    expect(
      eventDetailsChanged(before, { ...before, latitude: '50.4501' }),
    ).toBe(false);
  });
});

describe('event list cursor', () => {
  const scope = { list: 'public' as const, categoryId: randomUUID() };

  it('round-trips within the same scope', () => {
    const id = randomUUID();
    const createdAt = new Date('2026-11-01T10:00:00.000Z');
    const cursor = encodeEventListCursor(id, createdAt, scope);
    expect(decodeEventListCursor(cursor, scope)).toMatchObject({
      id,
      createdAt: createdAt.toISOString(),
    });
  });

  it('rejects cursors from another scope or malformed input', () => {
    const cursor = encodeEventListCursor(randomUUID(), new Date(), scope);
    expect(() => decodeEventListCursor(cursor, { list: 'mine' })).toThrow(
      expect.objectContaining({ code: 'INVALID_EVENT_CURSOR' }),
    );
    expect(() => decodeEventListCursor('$$$', scope)).toThrow();
    expect(() => decodeEventListCursor('a'.repeat(513), scope)).toThrow();
  });
});

describe('EventResponseFactory', () => {
  const factory = new EventResponseFactory();

  it('reveals public venues of published public events', () => {
    const detail = factory.detail(eventRow({ status: 'PUBLISHED' }), false);
    expect(detail.location).toMatchObject({
      address: 'Khreshchatyk 1',
      latitude: 50.4501,
      longitude: 30.5234,
    });
  });

  it('hides private venues unless revealed', () => {
    const row = eventRow({
      status: 'PUBLISHED',
      locationVisibility: 'PARTICIPANTS_ONLY',
    });
    expect(factory.detail(row, false).location).toMatchObject({
      address: null,
      latitude: null,
    });
    expect(factory.detail(row, true).location.address).toBe('Khreshchatyk 1');
    expect(
      factory.detail(eventRow({ status: 'DRAFT' }), false).location.address,
    ).toBeNull();
  });

  it('includes the category name', () => {
    const categoryId = randomUUID();
    const detail = factory.detail(
      eventRow({ categoryId, category: { id: categoryId, name: 'Music' } }),
      true,
    );
    expect(detail.categoryName).toBe('Music');
  });

  it('builds a snapshot with an approximate private venue', () => {
    const snapshot = factory.publicSnapshot(
      eventRow({
        status: 'PUBLISHED',
        locationVisibility: 'PARTICIPANTS_ONLY',
      }),
    );
    expect(snapshot.location.address).toBeNull();
    expect(snapshot.location.latitude).toBe(50.45);
    expect(snapshot).not.toHaveProperty('moderationReason');
  });
});

describe('request schemas', () => {
  it('validates reasons and list queries', () => {
    expect(EventReasonSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(ListEventsQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
    expect(
      ListOwnedEventsQuerySchema.safeParse({ categoryId: randomUUID() })
        .success,
    ).toBe(false);
  });
});
