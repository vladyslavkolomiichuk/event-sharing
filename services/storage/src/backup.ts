import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, rename, rm, writeFile, readdir, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { env } from './config/env.js';

const storagePath = resolve(env.STORAGE_PATH);
const backupPath = resolve(env.STORAGE_BACKUP_PATH);
const nested = relative(storagePath, backupPath);
if (!nested || (!nested.startsWith('..') && !isAbsolute(nested)))
  throw new Error('Backup directory must be outside the storage directory.');

async function archive(destination: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('tar', ['-czf', destination, '-C', storagePath, '.'], {
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error('File backup failed.')),
    );
  });
}

async function backup(): Promise<void> {
  await mkdir(backupPath, { recursive: true, mode: 0o700 });
  const name = `backup-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const temporary = join(backupPath, `.partial-${name}`);
  const destination = join(backupPath, name);
  await mkdir(temporary, { mode: 0o700 });
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect();
    await client.query('SELECT pg_advisory_lock($1)', [194727201]);
    const result = await client.query(
      'SELECT "id", "ownerId", "eventId", "eventSlot", "profileOwnerId", "mimeType", "size", "sha256", "createdAt" FROM "stored_file" ORDER BY "id"',
    );
    await writeFile(
      join(temporary, 'metadata.json'),
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        files: result.rows,
      }),
      { mode: 0o600 },
    );
    await archive(join(temporary, 'files.tar.gz'));
    await rename(temporary, destination);
    const cutoff = Date.now() - env.STORAGE_BACKUP_RETENTION_DAYS * 86400000;
    for (const name of await readdir(backupPath)) {
      if (!/^backup-\d{4}-\d{2}-\d{2}T[\d.-]+Z-[0-9a-f-]{36}$/.test(name))
        continue;
      const path = resolve(backupPath, name);
      if (relative(backupPath, path) !== name) continue;
      const entry = await lstat(path);
      if (entry.isDirectory() && entry.mtimeMs < cutoff)
        await rm(path, { recursive: true });
    }
    console.info(`Storage backup created: ${name}`);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv.includes('--once')) await backup();
else {
  const run = async () => {
    try {
      await backup();
      setTimeout(() => void run(), 24 * 60 * 60 * 1000);
    } catch (error) {
      console.error(
        'Storage backup failed.',
        error instanceof Error ? error.name : 'UnknownError',
      );
      setTimeout(() => void run(), 5 * 60 * 1000);
    }
  };
  await run();
}
