import {
  UserProfilePrivateSchema,
  UserProfilePublicSchema,
  ProfileVisibilitySchema,
  profileAvatarPath,
  type UpdateUserProfile,
  type UserProfilePrivate,
  type UserProfilePublic,
} from '@event-sharing/contracts';
import { ProfileNotFoundError } from '../domain/errors/ProfileNotFoundError.js';
import { InvalidAvatarError } from '../domain/errors/InvalidAvatarError.js';
import { FriendService } from './FriendService.js';
import {
  UserProfileRepository,
  type UserProfileSnapshot,
} from '../repositories/UserProfileRepository.js';

export class UserProfileService {
  constructor(
    private readonly repository: UserProfileRepository,
    private readonly friends = new FriendService(),
  ) {}

  async getPrivate(userId: string): Promise<UserProfilePrivate> {
    return this.toPrivate(await this.getSnapshot(userId));
  }

  async getPublic(userId: string, actorId: string): Promise<UserProfilePublic> {
    const snapshot = await this.getSnapshot(userId);
    if (!(await this.canView(snapshot, actorId)))
      throw new ProfileNotFoundError();
    return this.toPublic(snapshot);
  }

  async getPublicByUsername(
    username: string,
    actorId: string,
  ): Promise<UserProfilePublic> {
    const snapshot = await this.repository.findByUsername(username);
    if (!snapshot) throw new ProfileNotFoundError();
    if (
      snapshot.profile.userId !== actorId &&
      !snapshot.preferences.discoverableByUsername
    )
      throw new ProfileNotFoundError();
    if (!(await this.canView(snapshot, actorId)))
      throw new ProfileNotFoundError();
    return this.toPublic(snapshot);
  }

  async canViewHistory(userId: string, actorId: string): Promise<boolean> {
    const snapshot = await this.repository.findById(userId);
    if (!snapshot) return false;
    if (userId === actorId) return true;
    return (
      snapshot.preferences.showParticipationHistory &&
      (await this.canView(snapshot, actorId))
    );
  }

  async getPublicMany(
    userIds: string[],
    actorId: string,
  ): Promise<UserProfilePublic[]> {
    const snapshots = await this.repository.findManyByIds(userIds);
    const [relationships, blocked] = await Promise.all([
      this.friends.statuses(actorId, userIds),
      this.friends.blocked(actorId, userIds),
    ]);
    return snapshots.map((snapshot) =>
      this.toPublic(
        snapshot,
        blocked.has(snapshot.profile.userId) ||
          !this.isVisible(
            snapshot,
            actorId,
            relationships.get(snapshot.profile.userId),
          ),
      ),
    );
  }

  async searchByUsername(username: string, actorId: string, cursor?: string) {
    const { items, nextCursor } = await this.repository.searchByUsername(
      username,
      actorId,
      cursor,
    );
    const relationships = await this.friends.statuses(
      actorId,
      items.map((item) => item.profile.userId),
    );
    return {
      items: items.map((snapshot) => ({
        ...this.toPublic(snapshot, true),
        relationship: relationships.get(snapshot.profile.userId) ?? 'NONE',
      })),
      nextCursor,
    };
  }

  private toPublic(
    { profile, preferences }: UserProfileSnapshot,
    limited = false,
  ): UserProfilePublic {
    return UserProfilePublicSchema.parse({
      userId: profile.userId,
      name: profile.name,
      username: profile.username,
      avatarUrl: limited ? null : profile.avatarUrl,
      bio: limited ? null : profile.bio,
      phone: !limited && preferences.showPhone ? profile.phone : null,
      city: !limited && preferences.showCity ? profile.city : null,
      updatedAt: profile.updatedAt.toISOString(),
      createdAt: profile.createdAt.toISOString(),
    });
  }

  private async canView(
    snapshot: UserProfileSnapshot,
    actorId: string,
  ): Promise<boolean> {
    if (snapshot.profile.userId === actorId) return true;
    const [relationships, blocked] = await Promise.all([
      this.friends.statuses(actorId, [snapshot.profile.userId]),
      this.friends.blocked(actorId, [snapshot.profile.userId]),
    ]);
    if (blocked.has(snapshot.profile.userId)) return false;
    return this.isVisible(
      snapshot,
      actorId,
      relationships.get(snapshot.profile.userId),
    );
  }

  private isVisible(
    snapshot: UserProfileSnapshot,
    actorId: string,
    relationship?: 'FRIENDS' | 'SENT' | 'RECEIVED',
  ): boolean {
    if (snapshot.profile.userId === actorId) return true;
    if (snapshot.preferences.profileVisibility === 'PUBLIC') return true;
    return (
      snapshot.preferences.profileVisibility === 'FRIENDS' &&
      relationship === 'FRIENDS'
    );
  }

  async update(
    userId: string,
    patch: UpdateUserProfile,
  ): Promise<UserProfilePrivate> {
    if (
      patch.avatarUrl?.startsWith('/backend/') &&
      patch.avatarUrl !== profileAvatarPath(userId)
    )
      throw new InvalidAvatarError();
    const snapshot = await this.repository.update(userId, patch);
    if (!snapshot) throw new ProfileNotFoundError();
    return this.toPrivate(snapshot);
  }

  private async getSnapshot(userId: string): Promise<UserProfileSnapshot> {
    const snapshot = await this.repository.findById(userId);
    if (!snapshot) throw new ProfileNotFoundError();
    return snapshot;
  }

  private toPrivate({
    profile,
    preferences,
  }: UserProfileSnapshot): UserProfilePrivate {
    return UserProfilePrivateSchema.parse({
      userId: profile.userId,
      name: profile.name,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      phone: profile.phone,
      city: profile.city,
      updatedAt: profile.updatedAt.toISOString(),
      createdAt: profile.createdAt.toISOString(),
      version: profile.version,
      preferences: {
        showPhone: preferences.showPhone,
        showCity: preferences.showCity,
        notificationsEnabled: preferences.notificationsEnabled,
        allowFriendRequests: preferences.allowFriendRequests,
        allowInvitesFromStrangers: preferences.allowInvitesFromStrangers,
        profileVisibility: ProfileVisibilitySchema.parse(
          preferences.profileVisibility,
        ),
        discoverableByUsername: preferences.discoverableByUsername,
        showParticipationHistory: preferences.showParticipationHistory,
      },
    });
  }
}
