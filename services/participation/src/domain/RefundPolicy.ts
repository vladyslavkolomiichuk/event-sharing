import type { RegistrationPolicy } from '../generated/prisma/client.js';

// Leaving before the organizer's deadline returns the ticket price.
export function refundAllowed(
  policy: RegistrationPolicy,
  now = new Date(),
): boolean {
  if (policy.refundHoursBeforeStart === null) return false;
  const start = policy.startTime ?? policy.endTime;
  if (!start) return true;
  const deadline = start.getTime() - policy.refundHoursBeforeStart * 3_600_000;
  return now.getTime() <= deadline;
}
