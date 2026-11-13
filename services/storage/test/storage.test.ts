import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { profileAvatarPath, RPC_OPERATIONS } from '@event-sharing/contracts';
import sharp from 'sharp';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { eventDetail } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase, serviceBus } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});

// A fake ClamAV daemon answers each request with the next reply.
const clamav = { replies: [] as string[], received: [] as Buffer[] };
const scanner = createServer((socket: Socket) => {
  const chunks: Buffer[] = [];
  socket.on('data', (chunk) => {
    chunks.push(chunk);
    const data = Buffer.concat(chunks);
    const done =
      data.toString('latin1').startsWith('zPING') ||
      data.subarray(-4).equals(Buffer.alloc(4));
    if (!done) return;
    clamav.received.push(data);
    const reply = clamav.replies.shift();
    if (reply === undefined) socket.end();
    else socket.write(reply);
  });
});
await new Promise<void>((resolve) => scanner.listen(0, '127.0.0.1', resolve));
const directory = mkdtempSync(join(tmpdir(), 'storage-test-'));
Object.assign(process.env, {
  CLAMAV_HOST: '127.0.0.1',
  CLAMAV_PORT: String((scanner.address() as { port: number }).port),
  STORAGE_PATH: directory,
  STORAGE_USER_QUOTA_BYTES: '200000',
});

const { ImageValidator } = await import('../src/services/ImageValidator.js');
const { MalwareScanner } = await import('../src/clients/MalwareScanner.js');
const { FileStorageService } =
  await import('../src/services/FileStorageService.js');
const { FileRepository } =
  await import('../src/repositories/FileRepository.js');
const { EventAccessClient } =
  await import('../src/clients/EventAccessClient.js');
const { ProfileAccessClient } =
  await import('../src/clients/ProfileAccessClient.js');
const { StoragePrivacyHandler } =
  await import('../src/privacy/StoragePrivacyHandler.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { createApp } = await import('../src/app.js');

const png = () =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: '#f2a56c' } })
    .png()
    .toBuffer();
const jpeg = () =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
    .jpeg()
    .toBuffer();

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
afterAll(() => {
  scanner.close();
  rmSync(directory, { recursive: true, force: true });
});
beforeEach(() => {
  prisma.reset();
  clamav.replies = [];
  clamav.received = [];
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  prisma.storedFile.aggregate.mockResolvedValue({ _sum: { size: 0 } });
  prisma.storedFile.count.mockResolvedValue(0);
  prisma.storedFile.create.mockImplementation(async ({ data }: any) => ({
    ...data,
    createdAt: new Date(),
  }));
});

describe('ImageValidator', () => {
  it('re-encodes valid images of the declared type', async () => {
    const clean = await new ImageValidator().normalize(
      await png(),
      'image/png',
    );
    expect((await sharp(clean).metadata()).format).toBe('png');
  });

  it('rejects mismatched, broken and unsupported files', async () => {
    const validator = new ImageValidator();
    await expect(
      validator.normalize(await png(), 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(
      validator.normalize(Buffer.from('not an image'), 'image/png'),
    ).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(
      validator.normalize(await png(), 'image/gif'),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
  });
});

describe('MalwareScanner', () => {
  it('pings the daemon', async () => {
    clamav.replies = ['PONG\0'];
    expect(await new MalwareScanner().ready()).toBe(true);
    clamav.replies = ['NOPE\0'];
    expect(await new MalwareScanner().ready()).toBe(false);
  });

  it('streams data and maps the verdict', async () => {
    const data = Buffer.from('hello');
    clamav.replies = ['stream: OK\0'];
    await expect(new MalwareScanner().scan(data)).resolves.toBeUndefined();
    const sent = clamav.received[0]!;
    expect(sent.toString('latin1').startsWith('zINSTREAM\0')).toBe(true);
    expect(sent.readUInt32BE(10)).toBe(5);
    clamav.replies = ['stream: Eicar FOUND\0'];
    await expect(new MalwareScanner().scan(data)).rejects.toMatchObject({
      code: 'FILE_REJECTED',
    });
    clamav.replies = [];
    await expect(new MalwareScanner().scan(data)).rejects.toMatchObject({
      code: 'SCANNER_UNAVAILABLE',
    });
  });
});

describe('access clients', () => {
  it('checks public events and visible avatars', async () => {
    serviceBus.call.mockResolvedValueOnce({ visible: false });
    await expect(
      new EventAccessClient().assertPublic(randomUUID()),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(serviceBus.call).toHaveBeenCalledWith(
      'events',
      RPC_OPERATIONS.publicEvent,
      expect.any(Object),
    );
    const userId = randomUUID();
    const profile = {
      userId,
      name: 'Olena',
      username: 'olena',
      avatarUrl: profileAvatarPath(userId),
      bio: null,
      phone: null,
      city: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serviceBus.call.mockResolvedValueOnce(profile);
    await expect(
      new ProfileAccessClient().assertAvatarVisible(userId, 'B'),
    ).resolves.toBeUndefined();
    serviceBus.call.mockResolvedValueOnce({ ...profile, avatarUrl: null });
    await expect(
      new ProfileAccessClient().assertAvatarVisible(userId, 'B'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('FileStorageService', () => {
  const owner = randomUUID();
  const setup = () => {
    const events = {
      get: vi.fn(async () => eventDetail({ organizerId: owner })),
      assertPublic: vi.fn(),
    };
    const profiles = { assertAvatarVisible: vi.fn() };
    const scan = { scan: vi.fn(), ready: vi.fn(async () => true) };
    const service = new FileStorageService(
      new FileRepository(),
      events as never,
      scan as never,
      new ImageValidator(),
      profiles as never,
    );
    return { service, events, profiles, scan };
  };

  it('scans, cleans and stores an upload', async () => {
    const { service, scan } = setup();
    await service.initialize();
    const record = await service.upload(owner, 'image/png', await png());
    expect(scan.scan).toHaveBeenCalled();
    expect(record).toMatchObject({
      ownerId: owner,
      mimeType: 'image/png',
      eventId: null,
    });
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(service.path(record.id))).toBe(true);
  });

  it('validates input before scanning', async () => {
    const { service, scan } = setup();
    await expect(
      service.upload(owner, 'image/png', Buffer.alloc(0)),
    ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    await expect(
      service.upload(owner, 'text/html', Buffer.from('x')),
    ).rejects.toMatchObject({
      code: 'INVALID_FILE_TYPE',
    });
    await expect(
      service.upload(owner, 'image/png', Buffer.alloc(5242881)),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    await expect(
      service.upload(
        owner,
        'image/png',
        await png(),
        undefined,
        undefined,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_OWNER' });
    expect(scan.scan).not.toHaveBeenCalled();
  });

  it('enforces the quota and file count', async () => {
    const { service } = setup();
    prisma.storedFile.aggregate.mockResolvedValue({ _sum: { size: 199990 } });
    await expect(
      service.upload(owner, 'image/png', await png()),
    ).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
    });
    prisma.storedFile.aggregate.mockResolvedValue({ _sum: { size: 0 } });
    prisma.storedFile.count.mockResolvedValue(500);
    await expect(
      service.upload(owner, 'image/png', await png()),
    ).rejects.toThrow('Your storage file limit is full.');
  });

  it('replaces the previous event image', async () => {
    const { service } = setup();
    const oldId = randomUUID();
    writeFileSync(service.path(oldId), 'old');
    prisma.storedFile.findUnique.mockResolvedValue({
      id: oldId,
      ownerId: owner,
      size: 3,
    });
    await service.upload(
      owner,
      'image/jpeg',
      await jpeg(),
      randomUUID(),
      'cover',
    );
    expect(prisma.storedFile.delete).toHaveBeenCalledWith({
      where: { id: oldId },
    });
    expect(existsSync(service.path(oldId))).toBe(false);
  });

  it('reads files by event access, ownership or a visible avatar', async () => {
    const { service, events, profiles } = setup();
    prisma.storedFile.findUnique.mockResolvedValueOnce(null);
    await expect(service.get('x', owner, 'USER', 'B')).rejects.toMatchObject({
      statusCode: 404,
    });
    prisma.storedFile.findUnique.mockResolvedValueOnce({
      id: 'f',
      eventId: 'e',
      ownerId: 'o',
    });
    await service.get('f', owner, 'USER', 'B');
    expect(events.get).toHaveBeenCalledWith('e', 'B');
    prisma.storedFile.findUnique.mockResolvedValueOnce({
      id: 'f',
      ownerId: 'other',
      profileOwnerId: null,
    });
    await expect(service.get('f', owner, 'USER', 'B')).rejects.toMatchObject({
      statusCode: 404,
    });
    prisma.storedFile.findUnique.mockResolvedValueOnce({
      id: 'f',
      ownerId: 'other',
      profileOwnerId: 'other',
    });
    await service.get('f', owner, 'USER', 'B');
    expect(profiles.assertAvatarVisible).toHaveBeenCalledWith('other', 'B');
  });

  it('lets only organizers manage event images', async () => {
    const { service } = setup();
    await expect(
      service.eventAccess('e', randomUUID(), 'USER', 'B', true),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      service.eventAccess('e', randomUUID(), 'ADMIN', 'B', true),
    ).resolves.toBeUndefined();
  });

  it('reports event images and public avatars', async () => {
    const { service, events } = setup();
    prisma.storedFile.findUnique
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce(null);
    expect(await service.eventImages('e', owner, 'USER', 'B')).toEqual({
      avatar: true,
      cover: false,
    });
    prisma.storedFile.findUnique.mockResolvedValueOnce(null);
    await expect(service.publicEventAvatar('e')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(events.assertPublic).toHaveBeenCalledWith('e');
  });

  it('removes own files and cleans old orphans only', async () => {
    const { service } = setup();
    const id = randomUUID();
    writeFileSync(service.path(id), 'x');
    prisma.storedFile.findUnique.mockResolvedValueOnce({
      id,
      ownerId: owner,
      eventId: null,
    });
    await service.remove(id, owner, 'USER', 'B');
    expect(existsSync(service.path(id))).toBe(false);
    prisma.storedFile.findUnique.mockResolvedValueOnce({
      id,
      ownerId: 'other',
      eventId: null,
    });
    await expect(service.remove(id, owner, 'USER', 'B')).rejects.toMatchObject({
      statusCode: 404,
    });
    const orphan = randomUUID();
    const fresh = randomUUID();
    writeFileSync(service.path(orphan), 'x');
    writeFileSync(service.path(fresh), 'x');
    const old = new Date(Date.now() - 7200000);
    utimesSync(service.path(orphan), old, old);
    prisma.storedFile.findUnique.mockResolvedValue(null);
    await service.cleanup();
    const left = readdirSync(directory);
    expect(left).toContain(fresh);
    expect(left).not.toContain(orphan);
  });

  it('pages and exports files', async () => {
    prisma.storedFile.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({ id: `f${index}` })),
    );
    expect((await new FileRepository().list('o')).nextCursor).toBe('f49');
    await new FileRepository().export('o');
    await new FileRepository().profileAvatar('u');
    expect(prisma.storedFile.findUnique).toHaveBeenCalledWith({
      where: { profileOwnerId: 'u' },
    });
  });
});

describe('HTTP API', () => {
  const service = () =>
    new FileStorageService(
      new FileRepository(),
      {} as never,
      { scan: vi.fn(), ready: async () => true } as never,
    );
  const app = () => createApp({ check: async () => true }, service());
  const as = async (sub = randomUUID()) => ({
    sub,
    headers: { authorization: `Bearer ${await jwt.token({ sub })}` },
  });

  it('reports readiness of the database and scanner', async () => {
    expect((await send(app(), 'GET', '/ready')).status).toBe(200);
    const down = createApp(
      { check: async () => true },
      new FileStorageService(
        new FileRepository(),
        {} as never,
        { ready: async () => false } as never,
      ),
    );
    expect((await send(down, 'GET', '/ready')).status).toBe(503);
  });

  it('uploads and serves a file with safe headers', async () => {
    const { headers } = await as();
    const body = await png();
    const server = app();
    const uploaded = await fetchUpload(server, headers.authorization, body);
    expect(uploaded.status).toBe(201);
    prisma.storedFile.findUnique.mockResolvedValue({
      ...uploaded.body,
      createdAt: new Date(),
    });
    const file = await send(
      server,
      'GET',
      `/api/storage/files/${uploaded.body.id}`,
      undefined,
      headers,
    );
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toBe(
      "default-src 'none'",
    );
  });

  it('rejects requests without a token and unknown routes', async () => {
    expect((await send(app(), 'GET', '/api/storage/files')).status).toBe(401);
    expect((await send(app(), 'GET', '/missing')).status).toBe(404);
  });
});

async function fetchUpload(app: any, authorization: string, body: Buffer) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/storage/files`,
      {
        method: 'POST',
        headers: { authorization, 'content-type': 'image/png' },
        body,
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('privacy and RPC', () => {
  it('deletes stored files of the user and missing files are fine', async () => {
    const present = randomUUID();
    writeFileSync(join(directory, present), 'x');
    const query = vi.fn(async (sql: string) =>
      sql.startsWith('SELECT id')
        ? { rows: [{ id: present }, { id: randomUUID() }] }
        : { rows: [] },
    );
    await (new StoragePrivacyHandler(privacyDatabase as never) as any).erase(
      { query },
      { userId: randomUUID(), removedEventIds: [] },
    );
    expect(existsSync(join(directory, present))).toBe(false);
    expect(String(query.mock.calls.at(-1)![0])).toContain(
      'DELETE FROM stored_file',
    );
  });

  it('answers readiness', async () => {
    const handler = new ServiceRequestHandler();
    expect(
      await handler.handle({ operation: RPC_OPERATIONS.readiness } as never),
    ).toMatchObject({ status: 'ok' });
  });
});
