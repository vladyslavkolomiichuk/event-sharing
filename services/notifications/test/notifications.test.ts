import { randomUUID } from 'node:crypto';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec, MailMessageCipher } from '@event-sharing/messaging';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProducer, kafka, running } from '../../../test/fake-kafka.js';
import { envelope } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase, sendMail } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);
vi.mock('nodemailer', async () => {
  const mocks = await import('./mocks.js');
  return {
    default: { createTransport: vi.fn(() => ({ sendMail: mocks.sendMail })) },
  };
});

const { createApp } = await import('../src/app.js');
const { NotificationService } =
  await import('../src/services/NotificationService.js');
const { MessageService } = await import('../src/services/MessageService.js');
const { SystemMessageService } =
  await import('../src/services/SystemMessageService.js');
const { NotificationRepository } =
  await import('../src/repositories/NotificationRepository.js');
const { MessageRepository } =
  await import('../src/repositories/MessageRepository.js');
const { SystemMessageRepository } =
  await import('../src/repositories/SystemMessageRepository.js');
const { ProjectionRepository } =
  await import('../src/repositories/ProjectionRepository.js');
const { EmailDeliveryRepository } =
  await import('../src/repositories/EmailDeliveryRepository.js');
const { SmtpEmailClient } = await import('../src/clients/SmtpEmailClient.js');
const { EmailDeliveryWorker } =
  await import('../src/workers/EmailDeliveryWorker.js');
const { NotificationOutboxWorker } =
  await import('../src/workers/NotificationOutboxWorker.js');
const { AuthMailConsumer } =
  await import('../src/consumers/AuthMailConsumer.js');
const { DomainEventConsumer } =
  await import('../src/consumers/DomainEventConsumer.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { NotificationPrivacyHandler } =
  await import('../src/privacy/NotificationPrivacyHandler.js');

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
beforeEach(() => {
  prisma.reset();
  kafka.reset();
  sendMail.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

const notification = (overrides = {}) => ({
  id: randomUUID(),
  type: 'FRIEND_REQUEST',
  title: 'New friend request',
  body: 'Olena sent you a friend request.',
  href: '/friends',
  senderId: null,
  eventId: null,
  messageId: null,
  readAt: null,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  ...overrides,
});

describe('NotificationService', () => {
  const repository = {
    find: vi.fn(),
    list: vi.fn(async () => []),
    unreadCount: vi.fn(async () => 3),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: vi.fn(),
  };
  const changed = vi.fn();
  const service = new NotificationService(repository as never, changed);

  it('lists a page with the unread count', async () => {
    const rows = Array.from({ length: 21 }, () => notification());
    repository.list.mockResolvedValueOnce(rows);
    const page = await service.list('u1');
    expect(page.items).toHaveLength(20);
    expect(page.unreadCount).toBe(3);
    expect(page.nextCursor).toBe(rows[19]!.id);
    repository.find.mockResolvedValueOnce(null);
    await expect(service.list('u1', randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('marks one or all as read and announces it', async () => {
    const item = notification();
    repository.find.mockResolvedValue(item);
    expect((await service.markRead(item.id, 'u1')).id).toBe(item.id);
    expect(changed).toHaveBeenCalledWith(['u1']);
    repository.markAllRead.mockResolvedValue({ count: 0 });
    changed.mockClear();
    expect(await service.markAllRead('u1')).toEqual({ updatedCount: 0 });
    expect(changed).not.toHaveBeenCalled();
    expect(await service.unreadCount('u1')).toEqual({ unreadCount: 3 });
  });

  it('deletes only own notifications', async () => {
    repository.remove.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove('n', 'u1')).rejects.toMatchObject({
      statusCode: 404,
    });
    repository.remove.mockResolvedValueOnce({ count: 1 });
    expect(await service.remove('n', 'u1')).toEqual({ deleted: true });
  });
});

describe('MessageService', () => {
  const organizer = randomUUID();
  const eventId = randomUUID();
  const setup = () => {
    const messages = { send: vi.fn(), find: vi.fn(), canRead: vi.fn() };
    const projections = {
      findUser: vi.fn(async () => ({ name: 'Iryna' })),
      findEvent: vi.fn(async () => ({
        organizerId: organizer,
        status: 'PUBLISHED',
        title: 'Jazz',
      })),
      listActiveMembers: vi.fn(async () => [
        { userId: organizer },
        { userId: 'm1' },
      ]),
    };
    const changed = vi.fn();
    return {
      messages,
      projections,
      changed,
      service: new MessageService(
        messages as never,
        projections as never,
        changed,
      ),
    };
  };
  const stored = () => ({
    id: randomUUID(),
    senderId: organizer,
    eventId,
    body: 'Doors open at 7.',
    recipientCount: 1,
    createdAt: new Date(),
  });

  it('sends announcements to members except the sender', async () => {
    const { service, messages, changed } = setup();
    messages.send.mockResolvedValue(stored());
    const sent = await service.sendEvent(
      organizer,
      'ORGANIZER',
      eventId,
      'Doors open at 7.',
    );
    expect(sent.senderName).toBe('Iryna');
    expect(messages.send).toHaveBeenCalledWith(
      organizer,
      eventId,
      'Doors open at 7.',
      ['m1'],
      'Announcement about Jazz',
    );
    expect(changed).toHaveBeenCalledWith(['m1']);
  });

  it('enforces ownership, status, recipients and the daily limit', async () => {
    const { service, projections, messages } = setup();
    await expect(
      service.sendEvent('x', 'USER', eventId, 'Hi'),
    ).rejects.toMatchObject({ statusCode: 403 });
    projections.findEvent.mockResolvedValueOnce({
      organizerId: organizer,
      status: 'COMPLETED',
    });
    await expect(
      service.sendEvent(organizer, 'ORGANIZER', eventId, 'Hi'),
    ).rejects.toMatchObject({ statusCode: 403 });
    projections.listActiveMembers.mockResolvedValueOnce([
      { userId: organizer },
    ]);
    await expect(
      service.sendEvent(organizer, 'ORGANIZER', eventId, 'Hi'),
    ).rejects.toMatchObject({
      code: 'NO_RECIPIENTS',
    });
    messages.send.mockResolvedValueOnce(null);
    await expect(
      service.sendEvent(organizer, 'ORGANIZER', eventId, 'Hi'),
    ).rejects.toMatchObject({
      statusCode: 429,
    });
    projections.findEvent.mockResolvedValueOnce(null);
    await expect(
      service.sendEvent(organizer, 'ADMIN', eventId, 'Hi'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('shows a message to its sender and recipients only', async () => {
    const { service, messages } = setup();
    messages.find.mockResolvedValue(stored());
    expect((await service.get(organizer, 'm')).body).toBe('Doors open at 7.');
    messages.canRead.mockResolvedValueOnce(null);
    await expect(service.get('stranger', 'm')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('SystemMessageService', () => {
  const repository = {
    find: vi.fn(),
    list: vi.fn(async () => []),
    create: vi.fn(),
    remove: vi.fn(),
  };
  const changed = vi.fn();
  const service = new SystemMessageService(repository as never, changed);
  const record = {
    id: randomUUID(),
    title: 'Update',
    body: 'New features.',
    audience: 'ORGANIZER',
    createdAt: new Date(),
  };

  it('lists messages for the role and checks cursors', async () => {
    expect(await service.list('USER')).toEqual({ items: [], nextCursor: null });
    repository.find.mockResolvedValueOnce(record);
    await expect(service.list('USER', record.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    repository.find.mockResolvedValueOnce(record);
    await expect(service.list('ORGANIZER', record.id)).resolves.toBeDefined();
  });

  it('lets only admins create and delete', async () => {
    await expect(service.create('USER', record as never)).rejects.toMatchObject(
      { statusCode: 403 },
    );
    repository.create.mockResolvedValue(record);
    expect((await service.create('ADMIN', record as never)).id).toBe(record.id);
    expect(changed).toHaveBeenCalled();
    repository.remove.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove('x', 'ADMIN')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.remove('x', 'ORGANIZER')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('repositories', () => {
  it('filters notifications by group and cursor', async () => {
    const repository = new NotificationRepository();
    await repository.list('u1', 'c1', 'SOCIAL');
    const args = prisma.inAppNotification.findMany.mock.calls[0]![0];
    expect(args.where.type.in).toContain('FRIEND_REQUEST');
    expect(args).toMatchObject({ cursor: { id: 'c1' }, skip: 1, take: 21 });
    await repository.list('u1', undefined, 'UNREAD');
    expect(prisma.inAppNotification.findMany.mock.calls[1]![0].where).toEqual({
      recipientId: 'u1',
      readAt: null,
    });
    expect(await repository.createMany(prisma as never, [])).toBe(0);
    for (const call of [
      () => repository.deleteModerationForUser(prisma as never, 'u'),
      () => repository.deleteModerationForEvent(prisma as never, 'e'),
      () => repository.deleteRoleRequestsForUser(prisma as never, 'u'),
      () => repository.deleteRoleRequestNotifications(prisma as never, 's'),
      () => repository.remove('n', 'u'),
    ])
      await call();
    expect(prisma.inAppNotification.deleteMany).toHaveBeenCalledTimes(5);
  });

  it('caps announcements at fifty a day and trims long previews', async () => {
    const repository = new MessageRepository();
    prisma.inAppMessage.count.mockResolvedValueOnce(50);
    expect(await repository.send('s', 'e', 'Hi', ['r'], 'T')).toBeNull();
    prisma.inAppMessage.count.mockResolvedValue(0);
    prisma.inAppMessage.create.mockResolvedValue({ id: 'm1' });
    await repository.send('s', 'e', 'x'.repeat(200), ['r'], 'T');
    const [item] = prisma.inAppNotification.createMany.mock.calls[0]![0].data;
    expect(item.body).toHaveLength(180);
    expect(item.href).toBe('/notifications?message=m1');
  });

  it('scopes system messages by audience', async () => {
    const repository = new SystemMessageRepository();
    await repository.list('ORGANIZER');
    await repository.list('ADMIN');
    expect(prisma.systemMessage.findMany.mock.calls[0]![0].where).toEqual({
      audience: { in: ['ALL', 'ORGANIZER'] },
    });
    expect(prisma.systemMessage.findMany.mock.calls[1]![0].where).toEqual({});
  });

  it('accepts inbox events once and projects users', async () => {
    const repository = new ProjectionRepository();
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.accept(prisma as never, 'e', EVENT_TYPES.userRegistered),
    ).toBe(false);
    await repository.updateRole(prisma as never, 'u', 'ADMIN');
    expect(prisma.userProjection.upsert.mock.calls[0]![0].create).toEqual({
      id: 'u',
      role: 'ADMIN',
      name: 'User',
    });
  });
});

describe('email delivery', () => {
  const cipher = new MailMessageCipher('33'.repeat(32));
  const request = {
    kind: 'PASSWORD_RESET' as const,
    recipient: 'user@example.test',
    url: 'https://app.test/reset',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  it('stores each mail request once', async () => {
    const repository = new EmailDeliveryRepository();
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.accept(
        'e1',
        EVENT_TYPES.notificationRequested,
        cipher.encrypt(request),
      ),
    ).toBe('duplicate');
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 1 });
    expect(
      await repository.accept(
        'e2',
        EVENT_TYPES.notificationRequested,
        cipher.encrypt(request),
      ),
    ).toBe('processed');
  });

  it('records success and terminal failures in the outbox', async () => {
    const repository = new EmailDeliveryRepository();
    const id = randomUUID();
    prisma.emailDelivery.updateMany.mockResolvedValue({ count: 1 });
    await repository.markSent(id);
    await repository.markFailed(id, 2, false);
    await repository.markFailed(id, 5, false);
    const types = prisma.outboxEvent.create.mock.calls.map(
      (call: any[]) => call[0].data.eventType,
    );
    expect(types).toEqual([
      EVENT_TYPES.notificationSent,
      EVENT_TYPES.notificationFailed,
    ]);
    expect(prisma.emailDelivery.updateMany.mock.calls[1]![0].data.status).toBe(
      'RETRY',
    );
  });

  it('sends plain-text mail with the link', async () => {
    await new SmtpEmailClient({
      host: 'smtp.test',
      port: 587,
      secure: false,
      from: 'no-reply@app.test',
    }).send('d1', request);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.test',
        subject: 'Reset your password',
        messageId: '<d1@event-sharing.local>',
        text: expect.stringContaining('https://app.test/reset'),
      }),
    );
  });

  it('delivers due mail, expires old mail and retries failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const repository = {
      listDue: vi.fn(async () => [
        {
          id: 'ok',
          attempts: 0,
          expiresAt: new Date(Date.now() + 60000),
          payload: cipher.encrypt(request),
        },
        { id: 'old', attempts: 1, expiresAt: new Date(0), payload: {} },
        {
          id: 'bad',
          attempts: 2,
          expiresAt: new Date(Date.now() + 60000),
          payload: { iv: 'x' },
        },
      ]),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const smtp = { send: vi.fn() };
    const worker = new EmailDeliveryWorker(
      repository as never,
      cipher,
      smtp as never,
    );
    worker.start();
    await vi.waitFor(() =>
      expect(repository.markFailed).toHaveBeenCalledTimes(2),
    );
    expect(smtp.send).toHaveBeenCalledWith('ok', request);
    expect(repository.markSent).toHaveBeenCalledWith('ok');
    expect(repository.markFailed).toHaveBeenCalledWith('old', 2, true);
    expect(repository.markFailed).toHaveBeenCalledWith('bad', 3, false);
    await worker.stop();
  });
});

describe('consumers and outbox', () => {
  it('accepts encrypted mail requests from Auth', async () => {
    const repository = { accept: vi.fn(async () => 'processed') };
    const consumer = new AuthMailConsumer(['k:1'], repository as never);
    await consumer.start();
    const fake = await running();
    const payload = new MailMessageCipher('33'.repeat(32)).encrypt({
      kind: 'EMAIL_CHANGE',
      recipient: 'a@example.test',
      url: 'https://app.test/c',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    await fake.deliver(
      EVENT_TOPICS.notifications,
      EventCodec.encode(
        envelope(EVENT_TYPES.notificationRequested, 'auth', payload),
      ),
    );
    expect(repository.accept).toHaveBeenCalled();
    await consumer.stop();
  });

  it('applies domain events through the ordered processor', async () => {
    const service = {
      apply: vi.fn(async () => 'processed'),
      recoverPending: vi.fn(),
    };
    const consumer = new DomainEventConsumer(['k:1'], service as never);
    await consumer.start();
    const fake = await running();
    await fake.deliver(
      EVENT_TOPICS.users,
      EventCodec.encode(
        envelope(EVENT_TYPES.friendRequested, 'users', {
          actorId: randomUUID(),
          recipientId: randomUUID(),
          actorName: 'O',
          actorUsername: 'olena',
        }),
      ),
    );
    expect(service.apply).toHaveBeenCalled();
    await consumer.stop();
  });

  it('publishes delivery results', async () => {
    const worker = new NotificationOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    await worker.publishEvent({
      id: randomUUID(),
      aggregateId: randomUUID(),
      eventType: EVENT_TYPES.notificationSent,
      occurredAt: new Date(),
      payload: { requestId: randomUUID(), channel: 'EMAIL' },
    });
    expect(kafka.sent[0]!.topic).toBe(EVENT_TOPICS.notifications);
  });
});

describe('HTTP API', () => {
  const realtime = { publish: vi.fn(), broadcast: vi.fn() };
  const app = () => createApp({ check: async () => true }, realtime as never);
  const as = async (role = 'USER') => ({
    authorization: `Bearer ${await jwt.token({ role })}`,
  });

  it('serves health and requires a token', async () => {
    expect((await send(app(), 'GET', '/health')).body.service).toBe(
      'Notifications',
    );
    expect((await send(app(), 'GET', '/api/notifications')).status).toBe(401);
  });

  it('lists, counts and updates notifications', async () => {
    const headers = await as();
    prisma.inAppNotification.findMany.mockResolvedValue([]);
    prisma.inAppNotification.count.mockResolvedValue(0);
    prisma.inAppNotification.updateMany.mockResolvedValue({ count: 2 });
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/notifications?filter=UNREAD',
          undefined,
          headers,
        )
      ).body,
    ).toEqual({
      items: [],
      unreadCount: 0,
      nextCursor: null,
    });
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/notifications/unread-count',
          undefined,
          headers,
        )
      ).body,
    ).toEqual({
      unreadCount: 0,
    });
    expect(
      (await send(app(), 'PATCH', '/api/notifications/read-all', {}, headers))
        .body,
    ).toEqual({ updatedCount: 2 });
    expect(realtime.publish).toHaveBeenCalled();
    expect(
      (await send(app(), 'PATCH', '/api/notifications/bad/read', {}, headers))
        .status,
    ).toBe(400);
  });

  it('broadcasts admin system messages', async () => {
    prisma.systemMessage.create.mockImplementation(async ({ data }: any) => ({
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
    }));
    const created = await send(
      app(),
      'POST',
      '/api/notifications/system',
      { title: 'Update', body: 'Hello', audience: 'ALL' },
      await as('ADMIN'),
    );
    expect(created.status).toBe(201);
    expect(realtime.broadcast).toHaveBeenCalled();
  });
});

describe('privacy and RPC', () => {
  it('warns members when an organizer is deleted', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.startsWith('SELECT member')
        ? {
            rows: [
              { eventId: randomUUID(), userId: randomUUID(), title: 'Jazz' },
            ],
          }
        : { rows: [] },
    );
    await (
      new NotificationPrivacyHandler(privacyDatabase as never) as any
    ).erase({ query }, { userId: randomUUID(), removedEventIds: [] });
    const insert = query.mock.calls.find((call) =>
      String(call[0]).startsWith('INSERT INTO in_app_notification'),
    )!;
    expect(insert[1]![2]).toContain('Jazz remains in your history');
  });

  it('answers readiness and rejects other queries', async () => {
    const handler = new ServiceRequestHandler();
    expect(
      await handler.handle({ operation: RPC_OPERATIONS.readiness } as never),
    ).toMatchObject({ status: 'ok' });
    await expect(
      handler.handle({ operation: RPC_OPERATIONS.profile } as never),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
