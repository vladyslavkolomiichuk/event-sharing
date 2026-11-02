import type { EventStatus } from '@event-sharing/contracts';

export const CHAT_ACTIVE_STATUSES = [
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
] as const satisfies readonly EventStatus[];

const active = new Set<string>(CHAT_ACTIVE_STATUSES);

export function isChatAvailable(status: string): boolean {
  return active.has(status);
}
