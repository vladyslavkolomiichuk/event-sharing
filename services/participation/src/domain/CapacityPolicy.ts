import type { RegistrationPolicy } from '../generated/prisma/client.js';
import { CapacityReachedError } from './errors/CapacityReachedError.js';
import { RegistrationClosedError } from './errors/RegistrationClosedError.js';

export class CapacityPolicy {
  assertCanJoin(policy: RegistrationPolicy): void {
    if (policy.status !== 'OPEN') throw new RegistrationClosedError();
    if (policy.endTime && policy.endTime <= new Date()) {
      throw new RegistrationClosedError();
    }
    if (policy.occupied >= policy.capacity) throw new CapacityReachedError();
  }
}
