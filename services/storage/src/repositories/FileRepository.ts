import { prisma } from '../database/client.js';

export class FileRepository {
  get(id: string) {
    return prisma.storedFile.findUnique({ where: { id } });
  }
  eventImage(eventId: string, eventSlot: string) {
    return prisma.storedFile.findUnique({
      where: { eventId_eventSlot: { eventId, eventSlot } },
    });
  }
  profileAvatar(userId: string) {
    return prisma.storedFile.findUnique({ where: { profileOwnerId: userId } });
  }
  async list(ownerId: string, cursor?: string) {
    const rows = await prisma.storedFile.findMany({
      where: { ownerId, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: 51,
    });
    const items = rows.slice(0, 50);
    return {
      items,
      nextCursor: rows.length > 50 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  export(ownerId: string) {
    return prisma.storedFile.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
