import {
  EVENT_TYPES,
  UserProfileUpdatedPayloadSchema,
  type UpdateUserProfile,
} from '@event-sharing/contracts';
import type {
  Prisma,
  UserPreference,
  UserProfile,
} from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';

export type UserProfileSnapshot = {
  profile: UserProfile;
  preferences: UserPreference;
};

export class UserProfileRepository {
  async findById(userId: string): Promise<UserProfileSnapshot | null> {
    const [profile, preferences] = await prisma.$transaction([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.userPreference.findUnique({ where: { userId } }),
    ]);

    if (!profile) return null;
    if (!preferences) throw new Error('User preferences are missing.');
    return { profile, preferences };
  }

  async findManyByIds(userIds: string[]): Promise<UserProfileSnapshot[]> {
    const [profiles, preferences] = await prisma.$transaction([
      prisma.userProfile.findMany({ where: { userId: { in: userIds } } }),
      prisma.userPreference.findMany({ where: { userId: { in: userIds } } }),
    ]);
    const byUserId = new Map(preferences.map((item) => [item.userId, item]));
    return profiles.map((profile) => {
      const preference = byUserId.get(profile.userId);
      if (!preference) throw new Error('User preferences are missing.');
      return { profile, preferences: preference };
    });
  }

  async findByName(name: string): Promise<UserProfileSnapshot[]> {
    const matches = await prisma.userProfile.findMany({
      where: { name: { contains: name, mode: 'insensitive' } },
      select: { userId: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    const snapshots = await this.findManyByIds(
      matches.map((item) => item.userId),
    );
    const byUserId = new Map(
      snapshots.map((item) => [item.profile.userId, item]),
    );
    return matches.flatMap((item) => {
      const snapshot = byUserId.get(item.userId);
      return snapshot ? [snapshot] : [];
    });
  }

  async provision(
    eventId: string,
    userId: string,
    eventType: typeof EVENT_TYPES.userRegistered,
    name?: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: eventId, eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return false;

      await transaction.userProfile.createMany({
        data: { userId, name: name ?? 'Member' },
        skipDuplicates: true,
      });
      if (name) {
        await transaction.userProfile.update({
          where: { userId },
          data: { name },
        });
      }
      await transaction.userPreference.createMany({
        data: { userId },
        skipDuplicates: true,
      });
      return true;
    });
  }

  async updateName(
    eventId: string,
    userId: string,
    name: string,
    eventType: typeof EVENT_TYPES.userNameUpdated,
  ): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: eventId, eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return false;
      await transaction.userProfile.updateMany({
        where: { userId },
        data: { name },
      });
      return true;
    });
  }

  async update(
    userId: string,
    patch: UpdateUserProfile,
  ): Promise<UserProfileSnapshot | null> {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.userProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!existing) return null;

      const profileData: Prisma.UserProfileUpdateInput = {
        version: { increment: 1 },
      };
      if (patch.avatarUrl !== undefined)
        profileData.avatarUrl = patch.avatarUrl;
      if (patch.bio !== undefined) profileData.bio = patch.bio;
      if (patch.phone !== undefined) profileData.phone = patch.phone;
      if (patch.city !== undefined) profileData.city = patch.city;

      const profile = await transaction.userProfile.update({
        where: { userId },
        data: profileData,
      });

      let preferences: UserPreference;
      if (patch.preferences) {
        const preferenceData: Prisma.UserPreferenceUpdateInput = {};
        if (patch.preferences.showPhone !== undefined) {
          preferenceData.showPhone = patch.preferences.showPhone;
        }
        if (patch.preferences.showCity !== undefined) {
          preferenceData.showCity = patch.preferences.showCity;
        }
        if (patch.preferences.notificationsEnabled !== undefined) {
          preferenceData.notificationsEnabled =
            patch.preferences.notificationsEnabled;
        }
        preferences = await transaction.userPreference.update({
          where: { userId },
          data: preferenceData,
        });
      } else {
        preferences = await transaction.userPreference.findUniqueOrThrow({
          where: { userId },
        });
      }

      await transaction.outboxEvent.create({
        data: {
          aggregateId: userId,
          eventType: EVENT_TYPES.userProfileUpdated,
          payload: UserProfileUpdatedPayloadSchema.parse({
            userId,
            profileVersion: profile.version,
            city: preferences.showCity ? profile.city : null,
            notificationsEnabled: preferences.notificationsEnabled,
          }),
        },
      });

      return { profile, preferences };
    });
  }
}
