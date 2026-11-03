import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma as users } from '../../services/users/src/database/client.js';
import { prisma as auth } from '../../services/auth/src/database/client.js';
import { prisma as events } from '../../services/events/src/database/client.js';
import { prisma as participation } from '../../services/participation/src/database/client.js';
import { prisma as notifications } from '../../services/notifications/src/database/client.js';
import { prisma as geoSearch } from '../../services/geo-search/src/database/client.js';
import { FriendService } from '../../services/users/src/services/FriendService.js';
import { UserProfileRepository } from '../../services/users/src/repositories/UserProfileRepository.js';
import { EventService } from '../../services/events/src/services/EventService.js';
import { EventResponseFactory } from '../../services/events/src/services/EventResponseFactory.js';
import { ParticipationRepository } from '../../services/participation/src/repositories/ParticipationRepository.js';
import { InvitationService } from '../../services/participation/src/services/InvitationService.js';
import { NotificationEventService } from '../../services/notifications/src/services/NotificationEventService.js';
import { SearchRepository } from '../../services/geo-search/src/repositories/SearchRepository.js';
import {
  createApp as createGatewayApp,
  type GatewayAppDependencies,
} from '../../apps/gateway/src/app.js';
import { ServiceProxy } from '../../apps/gateway/src/proxies/ServiceProxy.js';
import { createApp as createUserApp } from '../../services/users/src/app.js';
import { createApp as createParticipationApp } from '../../services/participation/src/app.js';
import { env as participationEnv } from '../../services/participation/src/config/env.js';
import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  EventSearchQuerySchema,
} from '../../packages/contracts/dist/index.js';
import { SearchPublicProfilesQuerySchema } from '../../services/users/src/schemas/search-public-profiles.schema.js';

const organizerId = randomUUID();
const guestIds = [randomUUID(), randomUUID(), randomUUID()];
const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const allUserIds = [organizerId, ...guestIds];
const usernames = allUserIds.map(
  (id) => `test_${id.replaceAll('-', '').slice(0, 12)}`,
);
const now = Date.now();
const endTime = new Date(now + 3_600_000);
const sourceEventId = randomUUID();

async function rejects(action: () => Promise<unknown>) {
  await assert.rejects(action);
}

async function listen(server: Server, port = 0): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function testGatewayFlow() {
  const servers: Server[] = [];
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const jwt = (userId: string, role: 'USER' | 'ORGANIZER') => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        iss: participationEnv.AUTH_JWT_ISSUER,
        aud: participationEnv.AUTH_JWT_AUDIENCE,
        iat: issuedAt,
        exp: issuedAt + 300,
        tokenUse: 'internal-user-access',
        role,
      }),
    ).toString('base64url');
    const message = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256')
      .update(message)
      .sign(privateKey)
      .toString('base64url');
    return `${message}.${signature}`;
  };
  const jwksUrl = new URL(participationEnv.AUTH_JWKS_URL);
  try {
    const jwks = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    servers.push(jwks);
    await listen(jwks, Number(jwksUrl.port));

    const ready = { check: async () => true };
    const userServer = createServer(createUserApp(ready));
    servers.push(userServer);
    await listen(userServer, 8003);
    const participationServer = createServer(createParticipationApp(ready));
    servers.push(participationServer);
    const participationUrl = await listen(participationServer);
    const proxy = new ServiceProxy(
      participationUrl,
      '/api/participation',
      'Participation',
    ).create();
    const unavailable: GatewayAppDependencies['authProxy'] = (
      _request,
      response,
    ) => {
      response.status(503).end();
    };
    const gateway = createGatewayApp({
      clients: [],
      authProxy: unavailable,
      authenticateBrowserSession: (request, response, next) => {
        const guest = request.get('cookie') === 'test-session=guest';
        const userId = guest ? guestIds[0]! : organizerId;
        const role = guest ? 'USER' : 'ORGANIZER';
        request.internalUserJwt = jwt(userId, role);
        request.authenticatedUser = { id: userId, role };
        next();
      },
      serviceProxies: {
        users: unavailable,
        events: unavailable,
        search: unavailable,
        participation: proxy,
        notifications: unavailable,
        messages: unavailable,
        eventLog: unavailable,
      },
    });
    const gatewayServer = createServer(gateway);
    servers.push(gatewayServer);
    const base = await listen(gatewayServer);
    const send = await fetch(
      `${base}/api/participation/events/${eventIds[3]}/invitations`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'test-session=organizer',
        },
        body: JSON.stringify({ usernames: [usernames[1]] }),
      },
    );
    assert.equal(send.status, 201, await send.text());
    const incoming = await fetch(`${base}/api/participation/invitations`, {
      headers: { cookie: 'test-session=guest' },
    });
    assert.equal(incoming.status, 200);
    const invites = (await incoming.json()) as {
      id: string;
      eventId: string;
    }[];
    const invitation = invites.find((item) => item.eventId === eventIds[3]);
    assert.ok(invitation);
    const accept = await fetch(
      `${base}/api/participation/invitations/${invitation.id}/accept`,
      {
        method: 'POST',
        headers: { cookie: 'test-session=guest' },
      },
    );
    assert.equal(accept.status, 200, await accept.text());
    const participants = await fetch(
      `${base}/api/participation/events/${eventIds[3]}/participants`,
      {
        headers: { cookie: 'test-session=organizer' },
      },
    );
    assert.equal(participants.status, 200);
    assert.ok(JSON.stringify(await participants.json()).includes(guestIds[0]!));
  } finally {
    await Promise.all(
      servers
        .reverse()
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  }
}

try {
  await auth.user.create({
    data: {
      id: organizerId,
      name: 'Test Organizer',
      email: `${organizerId}@example.invalid`,
      username: usernames[0]!,
    },
  });
  await auth.user.create({
    data: {
      id: guestIds[0]!,
      name: 'Test Guest',
      email: `${guestIds[0]}@example.invalid`,
    },
  });
  const migratedUsername = (
    await auth.user.findUniqueOrThrow({ where: { id: guestIds[0]! } })
  ).username;
  assert.match(migratedUsername, /^[a-z][a-z0-9_]{2,29}$/);
  await assert.rejects(
    auth.user.create({
      data: {
        id: guestIds[1]!,
        name: 'Duplicate Test',
        email: `${guestIds[1]}@example.invalid`,
        username: usernames[0]!.toUpperCase(),
      },
    }),
  );
  await assert.rejects(
    auth.user.create({
      data: {
        id: guestIds[2]!,
        name: 'Duplicate Test',
        email: `${guestIds[2]}@example.invalid`,
        username: usernames[0]!,
      },
    }),
  );

  await users.userProfile.createMany({
    data: allUserIds.map((userId, index) => ({
      userId,
      name: `Test Person ${index}`,
      username: usernames[index]!,
    })),
  });
  await users.userPreference.createMany({
    data: allUserIds.map((userId) => ({ userId })),
  });

  const friends = new FriendService();
  const request = await friends.request(organizerId, usernames[1]!);
  await rejects(() => friends.request(guestIds[0]!, usernames[0]!));
  await friends.decide(guestIds[0]!, request.id, 'ACCEPTED');
  const rejected = await friends.request(organizerId, usernames[2]!);
  await friends.decide(guestIds[1]!, rejected.id, 'REJECTED');
  assert.equal(
    (
      await users.friendRequest.findUniqueOrThrow({
        where: { id: rejected.id },
      })
    ).status,
    'REJECTED',
  );
  await users.userProfile.update({
    where: { userId: guestIds[0]! },
    data: { username: `${usernames[1]}_new` },
  });
  usernames[1] = `${usernames[1]}_new`;
  assert.equal(
    (await friends.list(organizerId, 0)).friends[0]?.userId,
    guestIds[0],
  );
  await friends.remove(organizerId, usernames[1]!);
  assert.equal((await friends.list(organizerId, 0)).friends.length, 0);
  const again = await friends.request(organizerId, usernames[1]!);
  await friends.decide(guestIds[0]!, again.id, 'ACCEPTED');
  await users.userPreference.update({
    where: { userId: guestIds[1]! },
    data: { allowInvitesFromStrangers: false },
  });
  await rejects(() => friends.invitationTarget(organizerId, usernames[2]!));
  assert.equal(
    (await friends.invitationTarget(organizerId, usernames[1]!)).userId,
    guestIds[0],
  );
  const query = SearchPublicProfilesQuerySchema.parse({
    username: usernames[1]!.toUpperCase().slice(0, 8),
  });
  assert.ok(
    (
      await new UserProfileRepository().searchByUsername(
        query.username,
        organizerId,
      )
    ).items.length > 0,
  );

  const event = await events.event.create({
    data: {
      id: eventIds[0]!,
      organizerId,
      title: 'Private test event',
      description: 'Integration check',
      startTime: new Date(now + 600_000),
      endTime,
      status: 'PUBLISHED',
      registrationStatus: 'OPEN',
      locationAddress: 'Hidden test address',
      latitude: 48.8566,
      longitude: 2.3522,
      participantLimit: 2,
      visibility: 'INVITE_ONLY',
    },
    include: { category: true },
  });
  await rejects(() => new EventService().get(event.id, guestIds[0]!, 'USER'));
  assert.equal(
    new EventResponseFactory().publicSnapshot({ ...event, category: null })
      .location.address,
    null,
  );
  await events.participantAccess.create({
    data: { eventId: event.id, userId: guestIds[0]! },
  });
  assert.equal(
    (await new EventService().get(event.id, guestIds[0]!, 'USER')).location
      .address,
    'Hidden test address',
  );
  const publicEvent = await events.event.create({
    data: {
      id: eventIds[1]!,
      organizerId,
      title: `Public ${eventIds[1]}`,
      description: 'Integration check',
      startTime: new Date(now + 600_000),
      endTime,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      locationAddress: 'Public test address',
      latitude: 48.8566,
      longitude: 2.3522,
      participantLimit: 10,
    },
  });
  const unlistedEvent = await events.event.create({
    data: {
      id: eventIds[2]!,
      organizerId,
      title: `Unlisted ${eventIds[2]}`,
      description: 'Integration check',
      startTime: new Date(now + 600_000),
      endTime,
      status: 'PUBLISHED',
      visibility: 'UNLISTED',
      locationAddress: 'Unlisted test address',
      latitude: 48.8566,
      longitude: 2.3522,
      participantLimit: 10,
    },
  });
  const eventService = new EventService();
  assert.equal(
    (await eventService.get(unlistedEvent.id, guestIds[0]!, 'USER')).id,
    unlistedEvent.id,
  );
  const publicList = await eventService.listPublic(undefined, undefined, 100);
  assert.ok(publicList.items.some((item) => item.id === publicEvent.id));
  assert.ok(!publicList.items.some((item) => item.id === unlistedEvent.id));
  await geoSearch.eventProjection.createMany({
    data: [publicEvent, unlistedEvent].map((item) => ({
      id: item.id,
      organizerId,
      title: item.title,
      description: item.description,
      startTime: item.startTime,
      endTime: item.endTime,
      status: item.status,
      eventVisibility: item.visibility,
      visibility: 'PUBLIC',
      version: 1,
      updatedAt: new Date(),
    })),
  });
  const search = await new SearchRepository().search(
    EventSearchQuerySchema.parse({ text: eventIds[1], limit: 50 }),
  );
  assert.ok(search.items.some((item) => item.id === publicEvent.id));
  const unlistedSearch = await new SearchRepository().search(
    EventSearchQuerySchema.parse({ text: eventIds[2], limit: 50 }),
  );
  assert.ok(!unlistedSearch.items.some((item) => item.id === unlistedEvent.id));
  await participation.registrationPolicy.create({
    data: {
      eventId: event.id,
      organizerId,
      version: 1,
      status: 'OPEN',
      visibility: 'INVITE_ONLY',
      title: event.title,
      capacity: 2,
      endTime,
    },
  });

  const repository = new ParticipationRepository();
  await rejects(() => repository.join(event.id, guestIds[0]!));
  const invitations = new InvitationService({
    resolve: async (username: string) => ({
      userId: allUserIds[usernames.indexOf(username)]!,
      username,
      name: 'Test Person',
    }),
  } as never);
  const sent = await invitations.send(
    event.id,
    organizerId,
    [usernames[1]!, usernames[2]!],
    'test',
  );
  assert.equal(sent.sent.length, 2);
  assert.equal(
    (await invitations.send(event.id, organizerId, [usernames[1]!], 'test'))
      .sent.length,
    0,
  );
  const pending = await participation.personalInvite.findMany({
    where: { eventId: event.id },
  });
  await invitations.accept(
    pending.find((item) => item.recipientId === guestIds[0])!.id,
    guestIds[0]!,
  );
  await invitations.decline(
    pending.find((item) => item.recipientId === guestIds[1])!.id,
    guestIds[1]!,
  );
  assert.equal(
    (
      await participation.registrationPolicy.findUniqueOrThrow({
        where: { eventId: event.id },
      })
    ).occupied,
    1,
  );
  const created = await invitations.createLink(
    event.id,
    organizerId,
    new Date(now + 1_800_000),
    1,
  );
  assert.equal(
    (await invitations.previewLink(created.token)).eventId,
    event.id,
  );
  await invitations.acceptLink(created.token, guestIds[2]!);
  assert.equal(
    (await invitations.acceptLink(created.token, guestIds[2]!)).status,
    'JOINED',
  );
  await rejects(() => invitations.previewLink(created.token));
  const revoked = await invitations.createLink(
    event.id,
    organizerId,
    new Date(now + 1_800_000),
    null,
  );
  await invitations.revokeLink(event.id, organizerId, revoked.id);
  await rejects(() => invitations.previewLink(revoked.token));
  const expiredToken = 'expired_' + randomUUID().replaceAll('-', '');
  const expiredHash = (await import('node:crypto'))
    .createHash('sha256')
    .update(expiredToken)
    .digest('hex');
  await participation.inviteLink.create({
    data: {
      eventId: event.id,
      createdBy: organizerId,
      tokenHash: expiredHash,
      expiresAt: new Date(now - 1000),
    },
  });
  await rejects(() => invitations.previewLink(expiredToken));

  await participation.registrationPolicy.create({
    data: {
      eventId: eventIds[1]!,
      organizerId,
      version: 1,
      status: 'OPEN',
      visibility: 'PUBLIC',
      title: 'Capacity test event',
      capacity: 1,
      endTime,
    },
  });
  const concurrent = await Promise.allSettled([
    repository.join(eventIds[1]!, guestIds[0]!),
    repository.join(eventIds[1]!, guestIds[1]!),
  ]);
  assert.equal(
    concurrent.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (
      await participation.registrationPolicy.findUniqueOrThrow({
        where: { eventId: eventIds[1]! },
      })
    ).occupied,
    1,
  );
  await participation.registrationPolicy.update({
    where: { eventId: eventIds[1]! },
    data: { endTime: new Date(now - 1000) },
  });
  await rejects(() => repository.join(eventIds[1]!, guestIds[2]!));

  await participation.registrationPolicy.create({
    data: {
      eventId: eventIds[3]!,
      organizerId,
      version: 1,
      status: 'OPEN',
      visibility: 'INVITE_ONLY',
      title: 'Gateway invitation test',
      capacity: 2,
      endTime,
    },
  });
  await testGatewayFlow();

  const notificationEvent = EventEnvelopeSchema.parse({
    eventId: sourceEventId,
    eventType: EVENT_TYPES.invitationSent,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: sourceEventId,
    producer: 'participation',
    payload: {
      eventId: event.id,
      recipientId: guestIds[0]!,
      organizerId,
      title: event.title,
    },
  });
  const delivery = new NotificationEventService();
  assert.equal(await delivery.apply(notificationEvent), 'processed');
  assert.equal(await delivery.apply(notificationEvent), 'duplicate');
  assert.equal(
    await notifications.inAppNotification.count({ where: { sourceEventId } }),
    1,
  );
  console.info('Invitation integration checks passed.');
} finally {
  await notifications.inAppNotification.deleteMany({
    where: { sourceEventId },
  });
  await notifications.inboxEvent.deleteMany({ where: { id: sourceEventId } });
  await participation.personalInvite.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await participation.inviteLink.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await participation.membership.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await participation.outboxEvent.deleteMany({
    where: { aggregateId: { in: eventIds } },
  });
  await participation.registrationPolicy.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await events.participantAccess.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await geoSearch.eventProjection.deleteMany({
    where: { id: { in: eventIds } },
  });
  await events.event.deleteMany({ where: { id: { in: eventIds } } });
  await users.friendRequest.deleteMany({
    where: {
      OR: [
        { senderId: { in: allUserIds } },
        { recipientId: { in: allUserIds } },
      ],
    },
  });
  await users.friendship.deleteMany({
    where: {
      OR: [{ userIdA: { in: allUserIds } }, { userIdB: { in: allUserIds } }],
    },
  });
  await users.outboxEvent.deleteMany({
    where: { aggregateId: { in: allUserIds } },
  });
  await users.userPreference.deleteMany({
    where: { userId: { in: allUserIds } },
  });
  await users.userProfile.deleteMany({ where: { userId: { in: allUserIds } } });
  await auth.outboxEvent.deleteMany({
    where: { aggregateId: { in: allUserIds } },
  });
  await auth.user.deleteMany({ where: { id: { in: allUserIds } } });
  await Promise.all([
    auth.$disconnect(),
    users.$disconnect(),
    events.$disconnect(),
    participation.$disconnect(),
    notifications.$disconnect(),
    geoSearch.$disconnect(),
  ]);
}
