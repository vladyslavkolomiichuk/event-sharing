import {
  UserProfilePrivateSchema,
  UserProfilePublicSchema,
  type UpdateUserProfile,
  type UserProfilePrivate,
  type UserProfilePublic,
  type UserRole,
} from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { ProfileNotFoundError } from '../domain/errors/ProfileNotFoundError.js';
import {
  UserProfileRepository,
  type UserProfileSnapshot,
} from '../repositories/UserProfileRepository.js';

export class UserProfileService {
  constructor(private readonly repository: UserProfileRepository) {}

  async getPrivate(userId: string): Promise<UserProfilePrivate> {
    return this.toPrivate(await this.getSnapshot(userId));
  }

  async getPublic(userId: string): Promise<UserProfilePublic> {
    return this.toPublic(await this.getSnapshot(userId));
  }

  async getPublicMany(userIds: string[]): Promise<UserProfilePublic[]> {
    const snapshots = await this.repository.findManyByIds(userIds);
    return snapshots.map((snapshot) => this.toPublic(snapshot));
  }

  async searchByName(
    name: string,
    role: UserRole,
  ): Promise<UserProfilePublic[]> {
    if (role !== 'ADMIN') throw new ForbiddenError();
    const snapshots = await this.repository.findByName(name);
    return snapshots.map((snapshot) => this.toPublic(snapshot));
  }

  private toPublic({
    profile,
    preferences,
  }: UserProfileSnapshot): UserProfilePublic {
    return UserProfilePublicSchema.parse({
      userId: profile.userId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      phone: preferences.showPhone ? profile.phone : null,
      city: preferences.showCity ? profile.city : null,
      updatedAt: profile.updatedAt.toISOString(),
      createdAt: profile.createdAt.toISOString(),
    });
  }

  async update(
    userId: string,
    patch: UpdateUserProfile,
  ): Promise<UserProfilePrivate> {
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
      },
    });
  }
}
