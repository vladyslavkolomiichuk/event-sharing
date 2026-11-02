import type { Prisma } from '../generated/prisma/client.js';

export type EventWithCategory = Prisma.EventGetPayload<{
  include: { category: true };
}>;
