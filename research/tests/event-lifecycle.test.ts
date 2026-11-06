// EXP-04: every action and status pair, checked against the state model of the report.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EventLifecyclePolicy,
  type EventAction,
} from '../../services/events/src/domain/EventLifecyclePolicy.js';
import type { EventStatus } from '../../services/events/src/generated/prisma/client.js';

const STATUSES: EventStatus[] = [
  'DRAFT',
  'MODERATION',
  'REJECTED',
  'APPROVED',
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
];

const ALLOWED: Record<EventAction, EventStatus[]> = {
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

const policy = new EventLifecyclePolicy();

for (const action of Object.keys(ALLOWED) as EventAction[]) {
  for (const status of STATUSES) {
    const allowed = ALLOWED[action].includes(status);
    test(`${action} from ${status} is ${allowed ? 'allowed' : 'rejected'}`, () => {
      const attempt = () => policy.assertTransition(action, status);
      if (allowed) assert.doesNotThrow(attempt);
      else assert.throws(attempt, { code: 'INVALID_EVENT_TRANSITION' });
    });
  }
}
