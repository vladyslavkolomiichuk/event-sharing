import type { UserRole } from '@event-sharing/contracts';
import type { EventStatus } from '../generated/prisma/client.js';
import { EventConflictError } from './errors/EventConflictError.js';
import { ForbiddenError } from './errors/ForbiddenError.js';

export type EventAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'publish'
  | 'open'
  | 'close'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'archive';

const allowedFrom: Record<EventAction, EventStatus[]> = {
  submit: ['DRAFT', 'REJECTED'],
  approve: ['MODERATION'],
  reject: ['MODERATION'],
  publish: ['APPROVED'],
  open: ['PUBLISHED', 'ONGOING'],
  close: ['PUBLISHED', 'ONGOING'],
  start: ['PUBLISHED'],
  complete: ['PUBLISHED', 'ONGOING'],
  cancel: [
    'DRAFT',
    'MODERATION',
    'REJECTED',
    'APPROVED',
    'PUBLISHED',
    'ONGOING',
  ],
  archive: ['COMPLETED', 'CANCELLED', 'REJECTED'],
};

export class EventLifecyclePolicy {
  assertRole(
    action: EventAction,
    role: UserRole,
    organizerId: string,
    actorId: string,
  ): void {
    if (action === 'approve' || action === 'reject') {
      if (role !== 'ADMIN') throw new ForbiddenError();
      return;
    }
    if (role !== 'ADMIN' && organizerId !== actorId) throw new ForbiddenError();
  }

  assertTransition(action: EventAction, status: EventStatus): void {
    if (!allowedFrom[action].includes(status)) {
      throw new EventConflictError(
        'INVALID_EVENT_TRANSITION',
        `Cannot ${action} an event in status ${status}.`,
      );
    }
  }

  assertEditable(status: EventStatus): void {
    if (!['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED'].includes(status)) {
      throw new EventConflictError(
        'EVENT_NOT_EDITABLE',
        'The event cannot be edited in its current status.',
      );
    }
  }
}
