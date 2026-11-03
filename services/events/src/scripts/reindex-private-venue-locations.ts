import { prisma } from '../database/client.js';
import { EventRepository } from '../repositories/EventRepository.js';

try {
  const count = await new EventRepository().reindexPrivateVenueLocations();
  console.log(`Queued location updates for ${count} public events.`);
} finally {
  await prisma.$disconnect();
}
