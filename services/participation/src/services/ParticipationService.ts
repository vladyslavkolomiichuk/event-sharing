import {
  AvailabilitySchema,
  MembershipListSchema,
  MembershipSchema,
  type Availability,
  type Membership as MembershipResponse,
  type MembershipList,
  type UserRole,
} from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { PolicyNotFoundError } from '../domain/errors/PolicyNotFoundError.js';
import type { Membership } from '../generated/prisma/client.js';
import { ParticipationRepository } from '../repositories/ParticipationRepository.js';
import { RegistrationPolicyRepository } from '../repositories/RegistrationPolicyRepository.js';

export class ParticipationService {
  constructor(
    private readonly policies: RegistrationPolicyRepository,
    private readonly participations: ParticipationRepository,
  ) {}

  async availability(eventId: string): Promise<Availability> {
    const policy = await this.policies.findByEventId(eventId);
    if (!policy) throw new PolicyNotFoundError();
    return AvailabilitySchema.parse({
      eventId,
      status: policy.status,
      capacity: policy.capacity,
      occupied: policy.occupied,
      available:
        policy.status === 'OPEN' ? policy.capacity - policy.occupied : 0,
      policyVersion: policy.version,
    });
  }

  async join(eventId: string, userId: string): Promise<MembershipResponse> {
    return this.toResponse(await this.participations.join(eventId, userId));
  }

  async leave(eventId: string, userId: string): Promise<MembershipResponse> {
    return this.toResponse(await this.participations.leave(eventId, userId));
  }

  async participants(
    eventId: string,
    actorId: string,
    role: UserRole,
    cursor: string | undefined,
  ): Promise<MembershipList> {
    const policy = await this.policies.findByEventId(eventId);
    if (!policy) throw new PolicyNotFoundError();
    if (role !== 'ADMIN' && policy.organizerId !== actorId) {
      throw new ForbiddenError();
    }
    const rows = await this.participations.listParticipants(eventId, cursor);
    return this.toList(rows, 'userId');
  }

  async mine(
    userId: string,
    cursor: string | undefined,
  ): Promise<MembershipList> {
    return this.toList(
      await this.participations.listMine(userId, cursor),
      'eventId',
    );
  }

  private toResponse(membership: Membership): MembershipResponse {
    return MembershipSchema.parse({
      eventId: membership.eventId,
      userId: membership.userId,
      status: membership.status,
      joinedAt: membership.joinedAt.toISOString(),
      leftAt: membership.leftAt?.toISOString() ?? null,
    });
  }

  private toList(
    rows: Membership[],
    cursorField: 'eventId' | 'userId',
  ): MembershipList {
    const hasMore = rows.length > 20;
    const page = rows.slice(0, 20);
    return MembershipListSchema.parse({
      items: page.map((row) => this.toResponse(row)),
      nextCursor: hasMore ? page[page.length - 1]?.[cursorField] : null,
    });
  }
}
