import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventRow } from './rows.js';

vi.mock('../src/database/client.js', () => import('./rows.js'));

const { EventService } = await import('../src/services/EventService.js');
const { decodeEventListCursor } =
  await import('../src/lib/event-list-cursor.js');

let categories: Record<string, any>;
let events: Record<string, any>;
let service: InstanceType<typeof EventService>;
beforeEach(() => {
  categories = { list: vi.fn(), create: vi.fn() };
  events = {
    create: vi.fn(),
    findById: vi.fn(),
    isPublic: vi.fn((status: string) =>
      ['PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(
        status,
      ),
    ),
    hasParticipantAccess: vi.fn(async () => false),
    listPublic: vi.fn(async () => []),
    listPublicByOrganizer: vi.fn(async () => []),
    listMine: vi.fn(async () => []),
    listModeration: vi.fn(async () => []),
    countModeration: vi.fn(async () => 0),
    hasActiveEvents: vi.fn(async () => true),
    findAllByOrganizer: vi.fn(async () => []),
    update: vi.fn(),
    updateChatSetting: vi.fn(),
    transition: vi.fn(),
  };
  service = new EventService(categories as never, events as never);
});

describe('categories', () => {
  it('lists categories', async () => {
    const id = randomUUID();
    categories.list.mockResolvedValue([{ id, name: 'Music', extra: 1 }]);
    expect(await service.listCategories()).toEqual([{ id, name: 'Music' }]);
  });

  it('lets only admins create categories', async () => {
    await expect(
      service.createCategory('Art', 'ORGANIZER'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const id = randomUUID();
    categories.create.mockResolvedValue({ id, name: 'Art' });
    expect(await service.createCategory('Art', 'ADMIN')).toEqual({
      id,
      name: 'Art',
    });
  });
});

describe('create', () => {
  it('lets organizers and admins create events', async () => {
    const row = eventRow({ locationVisibility: 'PARTICIPANTS_ONLY' });
    events.create.mockResolvedValue(row);
    const detail = await service.create(
      {} as never,
      row.organizerId,
      'ORGANIZER',
    );
    expect(detail.location.address).toBe('Khreshchatyk 1');
    await expect(
      service.create({} as never, row.organizerId, 'USER'),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('get', () => {
  it('hides missing and unpublished events from others', async () => {
    events.findById.mockResolvedValueOnce(null);
    await expect(
      service.get(randomUUID(), randomUUID(), 'USER'),
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
    events.findById.mockResolvedValueOnce(eventRow({ status: 'DRAFT' }));
    await expect(
      service.get(randomUUID(), randomUUID(), 'USER'),
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
  });

  it('shows drafts to the owner and admins with the venue', async () => {
    const row = eventRow({
      status: 'DRAFT',
      locationVisibility: 'PARTICIPANTS_ONLY',
    });
    events.findById.mockResolvedValue(row);
    expect(
      (await service.get(row.id, row.organizerId, 'ORGANIZER')).location
        .address,
    ).toBe('Khreshchatyk 1');
    expect((await service.get(row.id, randomUUID(), 'ADMIN')).id).toBe(row.id);
  });

  it('requires access for invite-only events', async () => {
    const row = eventRow({ status: 'PUBLISHED', visibility: 'INVITE_ONLY' });
    events.findById.mockResolvedValue(row);
    await expect(
      service.get(row.id, randomUUID(), 'USER'),
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
    events.hasParticipantAccess.mockResolvedValue(true);
    expect((await service.get(row.id, randomUUID(), 'USER')).id).toBe(row.id);
  });

  it('reveals private venues only to participants of live events', async () => {
    const row = eventRow({
      status: 'PUBLISHED',
      locationVisibility: 'PARTICIPANTS_ONLY',
    });
    events.findById.mockResolvedValue(row);
    expect(
      (await service.get(row.id, randomUUID(), 'USER')).location.address,
    ).toBeNull();
    events.hasParticipantAccess.mockResolvedValue(true);
    expect(
      (await service.get(row.id, randomUUID(), 'USER')).location.address,
    ).toBe('Khreshchatyk 1');
    events.findById.mockResolvedValue({ ...row, status: 'CANCELLED' });
    expect(
      (await service.get(row.id, randomUUID(), 'USER')).location.address,
    ).toBeNull();
  });
});

describe('lists', () => {
  it('returns a cursor when more rows exist', async () => {
    const rows = [eventRow(), eventRow(), eventRow()];
    events.listPublic.mockResolvedValue(rows);
    const page = await service.listPublic(undefined, 'uncategorized', 2);
    expect(page.items).toHaveLength(2);
    const scope = { list: 'public' as const, categoryId: 'uncategorized' };
    expect(decodeEventListCursor(page.nextCursor!, scope).id).toBe(rows[1].id);
    await service.listPublic(page.nextCursor!, 'uncategorized', 2);
    expect(events.listPublic.mock.calls[1][0]).toMatchObject({
      id: rows[1].id,
    });
  });

  it('hides venues in public lists and shows them in own lists', async () => {
    const row = eventRow({
      status: 'PUBLISHED',
      locationVisibility: 'PARTICIPANTS_ONLY',
    });
    events.listPublicByOrganizer.mockResolvedValue([row]);
    events.listMine.mockResolvedValue([row]);
    const organizer = await service.listPublicByOrganizer(
      row.organizerId,
      undefined,
    );
    expect(organizer.items[0]!.location.address).toBeNull();
    const mine = await service.listMine(row.organizerId, undefined);
    expect(mine.items[0]!.location.address).toBe('Khreshchatyk 1');
    expect(mine.nextCursor).toBeNull();
  });

  it('rejects a cursor from another list', async () => {
    events.listMine.mockResolvedValue([eventRow(), eventRow()]);
    const page = await service.listMine('u1', undefined, 1);
    await expect(service.listPublic(page.nextCursor!)).rejects.toMatchObject({
      code: 'INVALID_EVENT_CURSOR',
    });
  });

  it('lets only admins read the moderation queue', async () => {
    await expect(service.listModeration('ORGANIZER')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    events.listModeration.mockResolvedValue([
      eventRow({ status: 'MODERATION' }),
    ]);
    events.countModeration.mockResolvedValue(7);
    const page = await service.listModeration('ADMIN');
    expect(page.total).toBe(7);
    expect(page.items).toHaveLength(1);
  });

  it('exports and checks active events', async () => {
    events.findAllByOrganizer.mockResolvedValue([eventRow()]);
    expect(await service.exportMine('u1')).toHaveLength(1);
    expect(await service.hasActiveEvents('u1')).toBe(true);
  });
});

describe('mutations', () => {
  it('passes updates and transitions to the repository', async () => {
    const row = eventRow();
    events.update.mockResolvedValue(row);
    events.updateChatSetting.mockResolvedValue(row);
    events.transition.mockResolvedValue(row);
    await service.update(row.id, 'u1', 'ADMIN', { title: 'New' });
    expect(events.update).toHaveBeenCalledWith(row.id, 'u1', 'ADMIN', {
      title: 'New',
    });
    await service.updateChatSetting(row.id, 'u1', 'ADMIN', true);
    expect(events.updateChatSetting).toHaveBeenCalledWith(
      row.id,
      'u1',
      'ADMIN',
      true,
    );
    await service.transition(row.id, 'u1', 'ADMIN', 'cancel', 'Rain');
    expect(events.transition).toHaveBeenCalledWith(
      row.id,
      'u1',
      'ADMIN',
      'cancel',
      'Rain',
    );
    await service.transition(row.id, 'u1', 'ADMIN', 'submit');
    expect(events.transition).toHaveBeenLastCalledWith(
      row.id,
      'u1',
      'ADMIN',
      'submit',
      null,
    );
  });
});
