import pg from 'pg';
import { env } from './config/env.js';

const url = new URL(env.DATABASE_URL);
if (url.pathname !== '/storage_db')
  throw new Error('Storage database must be named storage_db.');
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  const existing = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    ['storage_db'],
  );
  if (!existing.rowCount) await client.query('CREATE DATABASE storage_db');
  console.info('Storage database is ready.');
} finally {
  await client.end();
}
