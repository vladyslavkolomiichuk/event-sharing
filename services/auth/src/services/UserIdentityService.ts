import { usernameCandidates, type UpdateIdentity } from '@event-sharing/contracts';
import { UserIdentityRepository } from '../repositories/UserIdentityRepository.js';

export class UserIdentityService {
  constructor(private readonly repository = new UserIdentityRepository()) {}

  update(userId: string, changes: UpdateIdentity) {
    return this.repository.update(userId, changes);
  }

  available(username: string) {
    return this.repository.available(username);
  }

  suggestions(name: string) {
    return this.repository.availableSuggestions(usernameCandidates(name));
  }
}
