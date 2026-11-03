import {
  EVENT_TYPES,
  FriendEventPayloadSchema,
} from '@event-sharing/contracts';
import { AppError } from '@event-sharing/common';
import { prisma } from '../database/client.js';

class FriendActionError extends AppError {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    code = 'FRIEND_ACTION_INVALID',
    statusCode = 409,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class FriendService {
  private pair(left: string, right: string): [string, string] {
    return left < right ? [left, right] : [right, left];
  }

  async request(senderId: string, username: string) {
    const recipient = await prisma.userProfile.findUnique({
      where: { username },
    });
    if (!recipient)
      throw new FriendActionError('User not found.', 'USER_NOT_FOUND', 404);
    if (senderId === recipient.userId)
      throw new FriendActionError('You cannot add yourself.');
    const [userIdA, userIdB] = this.pair(senderId, recipient.userId);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userIdA + userIdB}))`;
      const [preference, blocks, friendship, pending, sender] =
        await Promise.all([
          tx.userPreference.findUnique({ where: { userId: recipient.userId } }),
          tx.userBlock.count({
            where: {
              OR: [
                { blockerId: senderId, blockedId: recipient.userId },
                { blockerId: recipient.userId, blockedId: senderId },
              ],
            },
          }),
          tx.friendship.findUnique({
            where: { userIdA_userIdB: { userIdA, userIdB } },
          }),
          tx.friendRequest.findFirst({
            where: {
              status: 'PENDING',
              OR: [
                { senderId, recipientId: recipient.userId },
                { senderId: recipient.userId, recipientId: senderId },
              ],
            },
          }),
          tx.userProfile.findUniqueOrThrow({ where: { userId: senderId } }),
        ]);
      if (!preference?.allowFriendRequests || blocks) {
        throw new FriendActionError(
          'Friend requests are unavailable.',
          'FRIEND_REQUESTS_UNAVAILABLE',
          403,
        );
      }
      if (friendship || pending)
        throw new FriendActionError('A friendship or request already exists.');
      const request = await tx.friendRequest.upsert({
        where: {
          senderId_recipientId: { senderId, recipientId: recipient.userId },
        },
        create: { senderId, recipientId: recipient.userId },
        update: { status: 'PENDING' },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateId: recipient.userId,
          eventType: EVENT_TYPES.friendRequested,
          payload: FriendEventPayloadSchema.parse({
            actorId: senderId,
            recipientId: recipient.userId,
            actorName: sender.name,
            actorUsername: sender.username,
          }),
        },
      });
      return request;
    });
  }

  async decide(
    actorId: string,
    requestId: string,
    action: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
  ) {
    const existing = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!existing)
      throw new FriendActionError(
        'Request not found.',
        'REQUEST_NOT_FOUND',
        404,
      );
    const [userIdA, userIdB] = this.pair(
      existing.senderId,
      existing.recipientId,
    );
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userIdA + userIdB}))`;
      const request = await tx.friendRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      if (request.status !== 'PENDING')
        throw new FriendActionError('Request is no longer pending.');
      const allowed =
        action === 'CANCELLED'
          ? actorId === request.senderId
          : actorId === request.recipientId;
      if (!allowed)
        throw new FriendActionError(
          'You cannot change this request.',
          'FORBIDDEN',
          403,
        );
      const blocks = await tx.userBlock.count({
        where: {
          OR: [
            { blockerId: request.senderId, blockedId: request.recipientId },
            { blockerId: request.recipientId, blockedId: request.senderId },
          ],
        },
      });
      if (blocks)
        throw new FriendActionError(
          'Friend interaction is unavailable.',
          'FORBIDDEN',
          403,
        );
      if (action === 'ACCEPTED') {
        await tx.friendship.create({ data: { userIdA, userIdB } });
        const actor = await tx.userProfile.findUniqueOrThrow({
          where: { userId: actorId },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateId: request.senderId,
            eventType: EVENT_TYPES.friendAccepted,
            payload: FriendEventPayloadSchema.parse({
              actorId,
              recipientId: request.senderId,
              actorName: actor.name,
              actorUsername: actor.username,
            }),
          },
        });
      }
      return tx.friendRequest.update({
        where: { id: requestId },
        data: { status: action },
      });
    });
  }

  async remove(actorId: string, username: string) {
    const other = await prisma.userProfile.findUnique({ where: { username } });
    if (!other)
      throw new FriendActionError('User not found.', 'USER_NOT_FOUND', 404);
    const [userIdA, userIdB] = this.pair(actorId, other.userId);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userIdA + userIdB}))`;
      await tx.friendship.deleteMany({ where: { userIdA, userIdB } });
      await tx.friendRequest.updateMany({
        where: {
          status: 'PENDING',
          OR: [
            { senderId: actorId, recipientId: other.userId },
            { senderId: other.userId, recipientId: actorId },
          ],
        },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async block(actorId: string, username: string) {
    const other = await prisma.userProfile.findUnique({ where: { username } });
    if (!other)
      throw new FriendActionError('User not found.', 'USER_NOT_FOUND', 404);
    if (other.userId === actorId)
      throw new FriendActionError('You cannot block yourself.');
    const [userIdA, userIdB] = this.pair(actorId, other.userId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userIdA + userIdB}))`;
      await tx.userBlock.createMany({
        data: { blockerId: actorId, blockedId: other.userId },
        skipDuplicates: true,
      });
      await tx.friendship.deleteMany({ where: { userIdA, userIdB } });
      await tx.friendRequest.updateMany({
        where: {
          status: 'PENDING',
          OR: [
            { senderId: actorId, recipientId: other.userId },
            { senderId: other.userId, recipientId: actorId },
          ],
        },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async unblock(actorId: string, username: string) {
    const other = await prisma.userProfile.findUnique({ where: { username } });
    if (!other) return;
    await prisma.userBlock.deleteMany({
      where: { blockerId: actorId, blockedId: other.userId },
    });
  }

  async list(actorId: string, page: number) {
    const skip = page * 20;
    const [friendships, received, sent, blocks] = await Promise.all([
      prisma.friendship.findMany({
        where: { OR: [{ userIdA: actorId }, { userIdB: actorId }] },
        orderBy: [
          { createdAt: 'desc' },
          { userIdA: 'asc' },
          { userIdB: 'asc' },
        ],
        skip,
        take: 21,
      }),
      prisma.friendRequest.findMany({
        where: { recipientId: actorId, status: 'PENDING' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: 21,
      }),
      prisma.friendRequest.findMany({
        where: { senderId: actorId, status: 'PENDING' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: 21,
      }),
      prisma.userBlock.findMany({
        where: { blockerId: actorId },
        orderBy: [{ createdAt: 'desc' }, { blockedId: 'asc' }],
        skip,
        take: 21,
      }),
    ]);
    const nextPage = [friendships, received, sent, blocks].some(
      (items) => items.length > 20,
    )
      ? page + 1
      : null;
    friendships.length = Math.min(friendships.length, 20);
    received.length = Math.min(received.length, 20);
    sent.length = Math.min(sent.length, 20);
    blocks.length = Math.min(blocks.length, 20);
    const ids = [
      ...new Set([
        ...friendships.map((item) =>
          item.userIdA === actorId ? item.userIdB : item.userIdA,
        ),
        ...received.map((item) => item.senderId),
        ...sent.map((item) => item.recipientId),
        ...blocks.map((item) => item.blockedId),
      ]),
    ];
    const people = await prisma.userProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, username: true, name: true, avatarUrl: true },
    });
    const byId = new Map(people.map((person) => [person.userId, person]));
    return {
      nextPage,
      friends: friendships.flatMap((item) => {
        const person = byId.get(
          item.userIdA === actorId ? item.userIdB : item.userIdA,
        );
        return person ? [person] : [];
      }),
      received: received.map((item) => ({
        ...item,
        person: byId.get(item.senderId),
      })),
      sent: sent.map((item) => ({
        ...item,
        person: byId.get(item.recipientId),
      })),
      blocked: blocks.flatMap((item) => {
        const person = byId.get(item.blockedId);
        return person ? [person] : [];
      }),
    };
  }
}
