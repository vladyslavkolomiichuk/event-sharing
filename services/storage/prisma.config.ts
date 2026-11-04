import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { loadServiceEnvFile } from '@event-sharing/common';

const values = loadServiceEnvFile(import.meta.url);
process.env.DATABASE_URL ??= values.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
