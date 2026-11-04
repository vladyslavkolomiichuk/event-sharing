import {
  AdminOrganizerRequestSchema,
  OrganizerRequestSchema,
  type OrganizerRequestStatus,
} from '@event-sharing/contracts';
import { OrganizerRequestError } from '../domain/errors/OrganizerRequestError.js';
import { OrganizerRequestRepository } from '../repositories/OrganizerRequestRepository.js';

export class OrganizerRequestService {
  constructor(private readonly repository = new OrganizerRequestRepository()) {}

  async current(userId: string) {
    const request = await this.repository.current(userId);
    return request ? this.toResponse(request) : null;
  }

  async pending() {
    const requests = await this.repository.pending();
    return requests.map((request) =>
      AdminOrganizerRequestSchema.parse({
        ...this.toResponse(request),
        requester: request.user,
      }),
    );
  }

  async create(userId: string, reason: string) {
    return this.toResponse(await this.repository.create(userId, reason));
  }

  async decide(
    requestId: string,
    adminId: string,
    status: Exclude<OrganizerRequestStatus, 'PENDING'>,
    decisionReason?: string,
  ) {
    if (
      status === 'REJECTED' &&
      (!decisionReason || decisionReason.length < 10)
    ) {
      throw new OrganizerRequestError(
        'Explain the rejection in at least 10 characters.',
        'DECISION_REASON_REQUIRED',
        400,
      );
    }
    return this.toResponse(
      await this.repository.decide(
        requestId,
        adminId,
        status,
        decisionReason ?? null,
      ),
    );
  }

  private toResponse(request: {
    id: string;
    status: string;
    reason: string;
    decisionReason: string | null;
    requestedAt: Date;
    decidedAt: Date | null;
  }) {
    return OrganizerRequestSchema.parse({
      id: request.id,
      status: request.status,
      reason: request.reason,
      decisionReason: request.decisionReason,
      requestedAt: request.requestedAt.toISOString(),
      decidedAt: request.decidedAt?.toISOString() ?? null,
    });
  }
}
