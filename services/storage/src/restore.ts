import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { env } from './config/env.js';

const backupName = process.argv[2];
if (!backupName || !/^backup-[0-9TZ.-]+-[0-9a-f-]{36}$/.test(backupName))
  throw new Error('Provide a backup directory name.');
const backup = join(resolve(env.STORAGE_BACKUP_PATH), backupName);
const storage = resolve(env.STORAGE_PATH);
const fileSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    eventId: z.uuid().nullable(),
    eventSlot: z.enum(['avatar', 'cover']).nullable(),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    size: z.number().int().positive().max(5242880),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.iso.datetime(),
  })
  .refine((file) => Boolean(file.eventId) === Boolean(file.eventSlot));
const metadata = z
  .object({ version: z.literal(1), files: z.array(fileSchema) })
  .parse(JSON.parse(await readFile(join(backup, 'metadata.json'), 'utf8')));
if (
  new Set(metadata.files.map((file) => file.id)).size !== metadata.files.length
)
  throw new Error('Duplicate file IDs in backup.');
const run = promisify(execFile);
const archive = join(backup, 'files.tar.gz');
const listing = await run('tar', ['-tzf', archive], {
  maxBuffer: 20 * 1024 * 1024,
});
const names = listing.stdout
  .split('\n')
  .filter(Boolean)
  .filter((name) => name !== './');
if (
  names.some(
    (name) =>
      !/^\.\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        name,
      ),
  )
)
  throw new Error('Unsafe file in backup.');
const client = new pg.Client({ connectionString: env.DATABASE_URL });
let extracted = false;
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)', [194727201]);
  const existing = await client.query('SELECT 1 FROM "stored_file" LIMIT 1');
  await mkdir(storage, { recursive: true, mode: 0o700 });
  if (existing.rowCount || (await readdir(storage)).length)
    throw new Error(
      'Restore requires an empty storage database and directory.',
    );
  extracted = true;
  await run('tar', [
    '-xzf',
    archive,
    '-C',
    storage,
    '--no-same-owner',
    '--no-same-permissions',
  ]);
  for (const name of names) {
    const info = await lstat(join(storage, name.slice(2)));
    if (!info.isFile() || info.size > 5242880)
      throw new Error('An invalid file was found in the backup.');
  }
  for (const file of metadata.files) {
    const path = join(storage, file.id);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.size)
      throw new Error('A backup file is missing or invalid.');
    const hash = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    if (hash !== file.sha256)
      throw new Error('A backup file failed its integrity check.');
    await client.query(
      'INSERT INTO "stored_file" ("id", "ownerId", "eventId", "eventSlot", "mimeType", "size", "sha256", "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        file.id,
        file.ownerId,
        file.eventId,
        file.eventSlot,
        file.mimeType,
        file.size,
        file.sha256,
        file.createdAt,
      ],
    );
  }
  await client.query('COMMIT');
  console.info(`Restored ${metadata.files.length} files.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  if (extracted)
    for (const name of names)
      await unlink(join(storage, name.slice(2))).catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
