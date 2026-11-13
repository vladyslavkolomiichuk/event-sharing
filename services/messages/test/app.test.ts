import { randomUUID } from 'node:crypto';
import {
  ANONYMOUS_USER_ID,
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec, ServiceMessageCipher } from '@event-sharing/messaging';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProducer, kafka, running } from '../../../test/fake-kafka.js';
import { envelope, eventDetail } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);

const { createApp } = await import('../src/app.js');
const { ChatService } = await import('../src/services/ChatService.js');
const { ChatProjectionRepository } =
  await import('../src/repositories/ChatProjectionRepository.js');
const { ChatEventConsumer } =
  await import('../src/consumers/ChatEventConsumer.js');
const { ChatOutboxWorker } = await import('../src/workers/ChatOutboxWorker.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { MessagePrivacyHandler } =
  await import('../src/privacy/MessagePrivacyHandler.js');

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
beforeEach(() => {
  prisma.reset();
  kafka.reset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

const snapshot = (overrides = {}) => {
  const {
    moderationReason: _m,
    policyError: _p,
    pendingStatus: _s,
    pendingRegistrationStatus: _r,
    pendingParticipantLimit: _l,
    ...detail
  } = eventDetail(overrides);
  return detail;
};

describe('HTTP API', () => {
  const realtime = { publish: vi.fn() };
  const app = () => createApp({ check: async () => true }, realtime as never);
  const headers = async () => ({
    authorization: `Bearer ${await jwt.token()}`,
  });

  it('serves health and requires a token', async () => {
    expect((await send(app(), 'GET', '/health')).body.service).toBe('Messages');
    expect(
      (await send(createApp({ check: async () => false }), 'GET', '/ready'))
        .status,
    ).toBe(503);
    expect((await send(app(), 'GET', '/api/messages/overview')).status).toBe(
      401,
    );
  });

  it('routes chat actions to the service with validated input', async () => {
    const eventId = randomUUID();
    const roomId = randomUUID();
    const spy = (name: keyof InstanceType<typeof ChatService>) =>
      vi
        .spyOn(ChatService.prototype, name as never)
        .mockResolvedValue({ ok: name } as never);
    const calls: [string, string, string, unknown, string?][] = [
      ['overview', 'GET', '/api/messages/overview', undefined],
      ['listRooms', 'GET', `/api/messages/events/${eventId}/rooms`, undefined],
      [
        'createRoom',
        'POST',
        `/api/messages/events/${eventId}/rooms`,
        { name: 'A' },
      ],
      [
        'updateRoom',
        'PATCH',
        `/api/messages/events/${eventId}/rooms/${roomId}`,
        { name: 'B' },
      ],
      [
        'updateNotificationPreference',
        'PATCH',
        `/api/messages/events/${eventId}/rooms/${roomId}/notifications`,
        { enabled: false },
      ],
      [
        'listMembers',
        'GET',
        `/api/messages/events/${eventId}/rooms/${roomId}/members`,
        undefined,
      ],
      [
        'addMembers',
        'POST',
        `/api/messages/events/${eventId}/rooms/${roomId}/members`,
        { userIds: [randomUUID()] },
      ],
      [
        'removeMember',
        'DELETE',
        `/api/messages/events/${eventId}/rooms/${roomId}/members/${randomUUID()}`,
        undefined,
      ],
      [
        'archiveRoom',
        'PATCH',
        `/api/messages/events/${eventId}/rooms/${roomId}/archive`,
        {},
      ],
      [
        'listMessages',
        'GET',
        `/api/messages/events/${eventId}/rooms/${roomId}/messages`,
        undefined,
      ],
      [
        'send',
        'POST',
        `/api/messages/events/${eventId}/rooms/${roomId}/messages`,
        { body: 'Hi', clientMessageId: randomUUID() },
      ],
      [
        'markRead',
        'PATCH',
        `/api/messages/events/${eventId}/rooms/${roomId}/read`,
        { messageId: randomUUID() },
      ],
    ];
    for (const [name, method, path, body] of calls) {
      const method$ = spy(name as never);
      const response = await send(app(), method, path, body, await headers());
      expect(response.status, name).toBeLessThan(300);
      expect(method$, name).toHaveBeenCalled();
    }
  });

  it('rejects invalid chat input', async () => {
    const eventId = randomUUID();
    const roomId = randomUUID();
    expect(
      (
        await send(
          app(),
          'POST',
          `/api/messages/events/${eventId}/rooms/${roomId}/messages`,
          { body: '' },
          await headers(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/messages/events/bad/rooms',
          undefined,
          await headers(),
        )
      ).status,
    ).toBe(400);
  });

  it('exports own chat data', async () => {
    for (const model of ['chatMessage', 'chatRoomMember', 'chatReadState'])
      prisma[model].findMany.mockResolvedValue([]);
    const response = await send(
      app(),
      'GET',
      '/api/messages/me/export',
      undefined,
      await headers(),
    );
    expect(response.body).toEqual({
      sentMessages: [],
      roomMemberships: [],
      readStates: [],
    });
  });
});

describe('ChatProjectionRepository', () => {
  const changed = vi.fn();
  const chats = {
    eventsWithUser: vi.fn(async () => ['e1']),
    participants: vi.fn(async () => ['u1']),
  };
  const projection = () =>
    new ChatProjectionRepository(changed, chats as never);

  beforeEach(() => {
    changed.mockReset();
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.pendingSnapshotEvent.findMany.mockResolvedValue([]);
    prisma.pendingMembershipEvent.findMany.mockResolvedValue([]);
    prisma.chatRoomMember.findMany.mockResolvedValue([]);
  });

  it('projects events and opens the General room', async () => {
    const payload = snapshot({ status: 'PUBLISHED' });
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.eventCreated, 'events', payload),
      ),
    ).toBe('processed');
    expect(prisma.chatRoom.createMany.mock.calls[0]![0].data).toMatchObject({
      name: 'General',
      status: 'ACTIVE',
    });
    expect(changed).toHaveBeenCalledWith(['u1'], payload.id);
  });

  it('makes rooms read-only when the event ends', async () => {
    const payload = snapshot({ status: 'COMPLETED' });
    await projection().apply(
      envelope(EVENT_TYPES.eventUpdated, 'events', payload),
    );
    expect(prisma.chatRoom.updateMany.mock.calls[0]![0]).toEqual({
      where: { eventId: payload.id, status: 'ACTIVE' },
      data: { status: 'READ_ONLY' },
    });
  });

  it('ignores stale snapshots and parks early ones', async () => {
    prisma.eventProjection.findUnique.mockResolvedValue({ version: 9 });
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.eventUpdated, 'events', snapshot()),
      ),
    ).toBe('ignored');
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    const early = { ...snapshot(), previousSnapshotEventId: randomUUID() };
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.eventUpdated, 'events', early),
      ),
    ).toBe('pending');
  });

  it('stores user names and refreshes their chats', async () => {
    const userId = randomUUID();
    await projection().apply(
      envelope(EVENT_TYPES.userRegistered, 'auth', { userId, role: 'USER' }),
    );
    expect(prisma.userProjection.upsert.mock.calls[0]![0].create).toEqual({
      id: userId,
      name: 'User',
    });
    await projection().apply(
      envelope(EVENT_TYPES.userNameUpdated, 'auth', { userId, name: 'Olena' }),
    );
    expect(changed).toHaveBeenCalledWith(['u1'], 'e1');
    prisma.deletedChatUser.findUnique.mockResolvedValue({ userId });
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.userNameUpdated, 'auth', { userId, name: 'X' }),
      ),
    ).toBe('ignored');
  });

  it('activates pending room members when they join the event', async () => {
    const eventId = randomUUID();
    const userId = randomUUID();
    const creator = randomUUID();
    const roomId = randomUUID();
    prisma.chatRoomMember.findMany
      .mockResolvedValueOnce([
        { roomId, room: { name: 'Backstage', createdBy: creator } },
      ])
      .mockResolvedValueOnce([{ userId: creator }]);
    const joined = envelope(EVENT_TYPES.userJoined, 'participation', {
      eventId,
      userId,
    });
    expect(await projection().apply(joined)).toBe('processed');
    expect(
      prisma.membershipProjection.upsert.mock.calls[0]![0].create.active,
    ).toBe(true);
    expect(prisma.chatRoomMember.update.mock.calls[0]![0].data.status).toBe(
      'ACTIVE',
    );
    expect(
      prisma.outboxEvent.create.mock.calls.map(
        (call: any[]) => call[0].data.payload.recipientId,
      ),
    ).toEqual([userId]);
  });

  it('skips membership of deleted users and parks out-of-order events', async () => {
    const data = { eventId: randomUUID(), userId: randomUUID() };
    prisma.deletedChatUser.findUnique.mockResolvedValueOnce({});
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.userLeft, 'participation', data),
      ),
    ).toBe('ignored');
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    expect(
      await projection().apply(
        envelope(EVENT_TYPES.userLeft, 'participation', {
          ...data,
          previousMembershipEventId: randomUUID(),
        }),
      ),
    ).toBe('pending');
  });

  it('recovers parked snapshots and memberships', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.pendingMembershipEvent.findMany.mockResolvedValueOnce([]);
    await projection().recoverPending();
    expect(prisma.pendingMembershipEvent.findMany).toHaveBeenCalled();
  });
});

describe('ChatEventConsumer', () => {
  it('subscribes to all source topics and applies events', async () => {
    const repository = {
      apply: vi.fn(async () => 'processed'),
      recoverPending: vi.fn(),
    };
    const consumer = new ChatEventConsumer(['k:1'], repository as never);
    await consumer.start();
    const fake = await running();
    expect(fake.subscriptions.length).toBeGreaterThanOrEqual(3);
    await fake.deliver(
      EVENT_TOPICS.events,
      EventCodec.encode(
        envelope(EVENT_TYPES.eventCreated, 'events', snapshot()),
      ),
    );
    expect(repository.apply).toHaveBeenCalled();
    await consumer.stop();
  });
});

describe('ChatOutboxWorker', () => {
  it('publishes chat events and rejects others', async () => {
    const worker = new ChatOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    await worker.publishEvent({
      id: randomUUID(),
      aggregateId: randomUUID(),
      eventType: EVENT_TYPES.chatMessageCreated,
      occurredAt: new Date(),
      payload: {
        eventId: randomUUID(),
        roomId: randomUUID(),
        roomName: 'General',
        messageId: randomUUID(),
        senderId: randomUUID(),
      },
    });
    expect(kafka.sent[0]!.topic).toBe(EVENT_TOPICS.messages);
    await expect(
      worker.publishEvent({
        id: randomUUID(),
        eventType: 'x',
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('Unsupported Messages event: x');
  });
});

describe('privacy', () => {
  it('anonymizes messages and returns members to notify', async () => {
    const member = { eventId: randomUUID(), userId: randomUUID() };
    const query = vi.fn(async (sql: string) =>
      sql.startsWith('SELECT DISTINCT') ? { rows: [member] } : { rows: [] },
    );
    const userId = randomUUID();
    const result = await (
      new MessagePrivacyHandler(privacyDatabase as never) as any
    ).erase({ query }, { userId, removedEventIds: [] });
    expect(result).toEqual({ notifyMembers: [member] });
    expect(query).toHaveBeenCalledWith(
      'UPDATE chat_message SET "senderId" = NULL, "clientMessageId" = NULL WHERE "senderId" = $1',
      [userId],
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE chat_room SET "createdBy" = $2 WHERE "createdBy" = $1',
      [userId, ANONYMOUS_USER_ID],
    );
  });

  it('notifies members after an erase receipt', async () => {
    const cipher = new ServiceMessageCipher('22'.repeat(32));
    (privacyDatabase as any).cipher = cipher;
    const member = { eventId: randomUUID(), userId: randomUUID() };
    vi.spyOn(MessagePrivacyHandler.prototype, 'handle').mockResolvedValue(
      cipher.encode({ result: { notifyMembers: [member] } }),
    );
    const changed = vi.fn();
    const handler = new ServiceRequestHandler(changed);
    await handler.handle({
      operation: RPC_OPERATIONS.privacyErase,
      sender: 'auth',
    } as never);
    expect(changed).toHaveBeenCalledWith([member.userId], member.eventId);
    expect(
      await handler.handle({ operation: RPC_OPERATIONS.readiness } as never),
    ).toEqual({
      status: 'ok',
      service: 'messages',
    });
    await expect(
      handler.handle({ operation: RPC_OPERATIONS.profile } as never),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
