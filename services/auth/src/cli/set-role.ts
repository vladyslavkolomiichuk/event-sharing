import { UserRoleSchema } from '@event-sharing/contracts';
import { z } from 'zod';
import {
  connectDatabase,
  disconnectDatabase,
  prisma,
} from '../database/client.js';

const email = z.email().parse(process.argv[2]);
const role = UserRoleSchema.parse(process.argv[3]);

await connectDatabase();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  console.info('User role updated.');
} finally {
  await disconnectDatabase();
}
