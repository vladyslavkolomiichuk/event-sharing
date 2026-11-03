import { createHash, randomBytes } from 'node:crypto';
import {
  EVENT_TYPES,
  InvitationSentPayloadSchema,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { UserDirectoryClient } from '../clients/UserDirectoryClient.js';
import { EventDirectoryClient } from '../clients/EventDirectoryClient.js';
import { InvitationError } from '../domain/errors/InvitationError.js';
import { ParticipationRepository } from '../repositories/ParticipationRepository.js';

export class InvitationService {
  constructor(
    private readonly directory = new UserDirectoryClient(),
    private readonly eventDirectory = new EventDirectoryClient(),
    private readonly participations = new ParticipationRepository(),
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async policy(eventId: string, organizerId: string) {
    const policy = await prisma.registrationPolicy.findUnique({
      where: { eventId },
    });
    if (!policy || policy.organizerId !== organizerId) {
      throw new InvitationError('Event not found.', 'EVENT_NOT_FOUND', 404);
    }
    return policy;
  }

  private assertOpen(policy: { status: string; endTime: Date | null }) {
    if (
      policy.status !== 'OPEN' ||
      !policy.endTime ||
      policy.endTime <= new Date()
    ) {
      throw new InvitationError(
        'Event registration is closed.',
        'REGISTRATION_CLOSED',
      );
    }
  }

  async createLink(
    eventId: string,
    organizerId: string,
    expiresAt: Date,
    maxUses: number | null,
  ) {
    const policy = await this.policy(eventId, organizerId);
    this.assertOpen(policy);
    if (policy.visibility !== 'INVITE_ONLY') {
      throw new InvitationError('Invite links are only for private events.');
    }
    if (expiresAt <= new Date() || expiresAt > policy.endTime!) {
      throw new InvitationError(
        'Link expiration must be before the event ends.',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const link = await prisma.inviteLink.create({
      data: {
        eventId,
        createdBy: organizerId,
        tokenHash: this.hash(token),
        expiresAt,
        maxUses,
      },
    });
    return {
      id: link.id,
      token,
      expiresAt: link.expiresAt.toISOString(),
      maxUses: link.maxUses,
    };
  }

  async listLinks(eventId: string, organizerId: string) {
    await this.policy(eventId, organizerId);
    return prisma.inviteLink.findMany({
      where: { eventId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        maxUses: true,
        uses: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async revokeLink(eventId: string, organizerId: string, linkId: string) {
    await this.policy(eventId, organizerId);
    await prisma.inviteLink.updateMany({
      where: { id: linkId, eventId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async previewLink(token: string) {
    const link = await prisma.inviteLink.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (
      !link ||
      link.revokedAt ||
      link.expiresAt <= new Date() ||
      (link.maxUses !== null && link.uses >= link.maxUses)
    ) {
      throw new InvitationError(
        'Invitation link is invalid or expired.',
        'INVITATION_INVALID',
        404,
      );
    }
    const policy = await prisma.registrationPolicy.findUnique({
      where: { eventId: link.eventId },
    });
    if (
      !policy ||
      policy.visibility !== 'INVITE_ONLY' ||
      policy.status !== 'OPEN' ||
      (policy.endTime && policy.endTime <= new Date())
    ) {
      throw new InvitationError(
        'Event registration is unavailable.',
        'REGISTRATION_CLOSED',
        409,
      );
    }
    return {
      eventId: link.eventId,
      title: policy.title,
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  async acceptLink(token: string, userId: string) {
    const link = await prisma.inviteLink.findUnique({ where: { tokenHash: this.hash(token) } });
    if (link) {
      const existing = await prisma.membership.findUnique({ where: { eventId_userId: { eventId: link.eventId, userId } } });
      if (existing?.status === 'JOINED') return existing;
    }
    const preview = await this.previewLink(token);
    return this.participations.join(
      preview.eventId,
      userId,
      undefined,
      this.hash(token),
    );
  }

  async send(
    eventId: string,
    organizerId: string,
    usernames: string[],
    authorization: string,
  ) {
    const policy = await prisma.registrationPolicy.findUnique({
      where: { eventId },
    });
    const event = policy
      ? null
      : await this.eventDirectory.get(eventId, authorization);
    if (
      policy
        ? policy.organizerId !== organizerId
        : event?.organizerId !== organizerId
    ) {
      throw new InvitationError('Event not found.', 'EVENT_NOT_FOUND', 404);
    }
    const title = policy?.title ?? event!.title;
    const endTime = policy?.endTime ?? new Date(event!.endTime);
    if (
      !endTime ||
      endTime <= new Date() ||
      policy?.status === 'CANCELLED' ||
      (event &&
        !['DRAFT', 'APPROVED', 'PUBLISHED', 'ONGOING'].includes(event.status))
    ) {
      throw new InvitationError(
        'Event invitation is unavailable.',
        'REGISTRATION_CLOSED',
      );
    }
    const targets = await Promise.all(
      usernames.map((username) =>
        this.directory.resolve(username, authorization),
      ),
    );
    const unique = [
      ...new Map(targets.map((target) => [target.userId, target])).values(),
    ];
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const currentPolicy = await tx.registrationPolicy.findUnique({
        where: { eventId },
      });
      if (
        currentPolicy &&
        (currentPolicy.organizerId !== organizerId ||
          currentPolicy.status === 'CANCELLED' ||
          !currentPolicy.endTime ||
          currentPolicy.endTime <= new Date())
      ) {
        throw new InvitationError(
          'Event invitation is unavailable.',
          'REGISTRATION_CLOSED',
        );
      }
      const currentTitle = currentPolicy?.title ?? title;
      const currentEndTime = currentPolicy?.endTime ?? endTime;
      const sent = [];
      for (const target of unique) {
        const membership = await tx.membership.findUnique({
          where: { eventId_userId: { eventId, userId: target.userId } },
        });
        if (membership?.status === 'JOINED') continue;
        const existingInvite = await tx.personalInvite.findUnique({
          where: { eventId_recipientId: { eventId, recipientId: target.userId } },
        });
        if (existingInvite?.status === 'PENDING' && existingInvite.expiresAt > new Date()) continue;
        if (existingInvite) {
          await tx.personalInvite.update({ where: { id: existingInvite.id }, data: {
            status: 'PENDING', title: currentTitle, expiresAt: currentEndTime, notifiedAt: null,
          } });
        } else {
          await tx.personalInvite.create({ data: {
            eventId, recipientId: target.userId, senderId: organizerId,
            title: currentTitle, expiresAt: currentEndTime,
          } });
        }
        sent.push(target);
        if (currentPolicy?.status === 'OPEN') {
            await tx.outboxEvent.create({
              data: {
                aggregateId: eventId,
                eventType: EVENT_TYPES.invitationSent,
                payload: InvitationSentPayloadSchema.parse({
                  eventId,
                  recipientId: target.userId,
                  organizerId,
                  title: currentTitle,
                }),
              },
            });
            await tx.personalInvite.update({
              where: {
                eventId_recipientId: { eventId, recipientId: target.userId },
              },
              data: { notifiedAt: new Date() },
            });
        }
      }
      return {
        sent: sent.map((target) => ({
          username: target.username,
          name: target.name,
        })),
        skipped: unique.length - sent.length,
      };
    });
  }

  async incoming(userId: string) {
    await prisma.personalInvite.updateMany({
      where: {
        recipientId: userId,
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    const invites = await prisma.personalInvite.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const policies = await prisma.registrationPolicy.findMany({
      where: { eventId: { in: invites.map((invite) => invite.eventId) } },
      select: { eventId: true, visibility: true },
    });
    const byEvent = new Map(policies.map((policy) => [policy.eventId, policy]));
    return invites.map((invite) => ({
      ...invite,
      visibility: byEvent.get(invite.eventId)?.visibility ?? 'PUBLIC',
    }));
  }

  async outgoing(eventId: string, organizerId: string, authorization: string) {
    const policy = await prisma.registrationPolicy.findUnique({
      where: { eventId },
    });
    const event = policy
      ? null
      : await this.eventDirectory.get(eventId, authorization);
    if (
      policy
        ? policy.organizerId !== organizerId
        : event?.organizerId !== organizerId
    ) {
      throw new InvitationError('Event not found.', 'EVENT_NOT_FOUND', 404);
    }
    await prisma.personalInvite.updateMany({
      where: { eventId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return prisma.personalInvite.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async accept(inviteId: string, userId: string) {
    const invite = await prisma.personalInvite.findFirst({
      where: { id: inviteId, recipientId: userId },
    });
    if (!invite)
      throw new InvitationError(
        'Invitation not found.',
        'INVITATION_NOT_FOUND',
        404,
      );
    return this.participations.join(invite.eventId, userId, inviteId);
  }

  async decline(inviteId: string, userId: string) {
    await prisma.personalInvite.updateMany({
      where: { id: inviteId, recipientId: userId, status: 'PENDING' },
      data: { status: 'DECLINED' },
    });
  }

  async revoke(inviteId: string, organizerId: string) {
    const invite = await prisma.personalInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite)
      throw new InvitationError(
        'Invitation not found.',
        'INVITATION_NOT_FOUND',
        404,
      );
    if (invite.senderId !== organizerId)
      throw new InvitationError(
        'Invitation not found.',
        'INVITATION_NOT_FOUND',
        404,
      );
    await prisma.personalInvite.updateMany({
      where: { id: inviteId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
  }
}
