import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { EventImageSlot, UserRole } from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { StorageError } from '../domain/StorageError.js';
import { FileRepository } from '../repositories/FileRepository.js';
import { EventAccessClient } from '../clients/EventAccessClient.js';
import { ProfileAccessClient } from '../clients/ProfileAccessClient.js';
import { MalwareScanner } from '../clients/MalwareScanner.js';
import { ImageValidator } from './ImageValidator.js';

const lockId = 194727201;

export class FileStorageService {
  private readonly directory = resolve(env.STORAGE_PATH);
  constructor(
    private readonly files = new FileRepository(),
    private readonly events = new EventAccessClient(),
    private readonly scanner = new MalwareScanner(),
    private readonly validator = new ImageValidator(),
    private readonly profiles = new ProfileAccessClient(),
  ) {}

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }
  scannerReady() {
    return this.scanner.ready();
  }
  path(id: string) {
    return join(this.directory, id);
  }

  async eventAccess(
    eventId: string,
    userId: string,
    role: UserRole,
    authorization: string,
    manage = false,
  ) {
    const event = await this.events.get(eventId, authorization);
    if (manage && event.organizerId !== userId && role !== 'ADMIN')
      throw new StorageError(
        'You cannot manage this event image.',
        'FORBIDDEN',
        403,
      );
  }

  async upload(
    ownerId: string,
    mimeType: string,
    input: Buffer,
    eventId?: string,
    eventSlot?: EventImageSlot,
    profileOwnerId?: string,
  ) {
    if (profileOwnerId && (profileOwnerId !== ownerId || eventId || eventSlot))
      throw new StorageError(
        'Invalid profile avatar.',
        'INVALID_FILE_OWNER',
        400,
      );
    if (!Buffer.isBuffer(input) || input.length === 0)
      throw new StorageError('Choose a file to upload.', 'FILE_REQUIRED', 400);
    if (input.length > env.STORAGE_MAX_FILE_BYTES)
      throw new StorageError('The file is too large.', 'FILE_TOO_LARGE', 413);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType))
      throw new StorageError(
        'Use a PNG, JPEG, or WebP image.',
        'INVALID_FILE_TYPE',
        415,
      );
    await this.scanner.scan(input);
    const data = await this.validator.normalize(input, mimeType);
    const id = randomUUID();
    const sha256 = createHash('sha256').update(data).digest('hex');
    let oldId: string | undefined;
    // Unreferenced files are removed by cleanup after failed transactions.
    const record = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lockId})`;
      const previous =
        eventId && eventSlot
          ? await tx.storedFile.findUnique({
              where: { eventId_eventSlot: { eventId, eventSlot } },
            })
          : profileOwnerId
            ? await tx.storedFile.findUnique({ where: { profileOwnerId } })
            : null;
      const usage = await tx.storedFile.aggregate({
        where: { ownerId },
        _sum: { size: true },
      });
      const count = await tx.storedFile.count({ where: { ownerId } });
      if (count >= 500 && previous?.ownerId !== ownerId)
        throw new StorageError(
          'Your storage file limit is full.',
          'STORAGE_QUOTA_EXCEEDED',
          413,
        );
      const used =
        (usage._sum.size ?? 0) -
        (previous?.ownerId === ownerId ? previous.size : 0);
      if (used + data.length > env.STORAGE_USER_QUOTA_BYTES)
        throw new StorageError(
          'Your storage quota is full.',
          'STORAGE_QUOTA_EXCEEDED',
          413,
        );
      await writeFile(this.path(id), data, { flag: 'wx', mode: 0o600 });
      if (previous) {
        await tx.storedFile.delete({ where: { id: previous.id } });
        oldId = previous.id;
      }
      return tx.storedFile.create({
        data: {
          id,
          ownerId,
          mimeType,
          size: data.length,
          sha256,
          eventId: eventId ?? null,
          eventSlot: eventSlot ?? null,
          profileOwnerId: profileOwnerId ?? null,
        },
      });
    });
    if (oldId) await unlink(this.path(oldId)).catch(() => {});
    return record;
  }

  async get(id: string, userId: string, role: UserRole, authorization: string) {
    const file = await this.files.get(id);
    if (!file)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    if (file.eventId)
      await this.eventAccess(file.eventId, userId, role, authorization);
    else if (file.ownerId !== userId) {
      if (!file.profileOwnerId)
        throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
      await this.profiles.assertAvatarVisible(
        file.profileOwnerId,
        authorization,
      );
    }
    return file;
  }
  async profileAvatar(ownerId: string, authorization: string) {
    await this.profiles.assertAvatarVisible(ownerId, authorization);
    const file = await this.files.profileAvatar(ownerId);
    if (!file)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    return file;
  }
  async removeProfileAvatar(
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    const file = await this.files.profileAvatar(userId);
    if (file) await this.remove(file.id, userId, role, authorization);
  }
  async eventImage(
    eventId: string,
    slot: EventImageSlot,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    await this.eventAccess(eventId, userId, role, authorization);
    const file = await this.files.eventImage(eventId, slot);
    if (!file)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    return file;
  }
  list(ownerId: string, cursor?: string) {
    return this.files.list(ownerId, cursor);
  }
  export(ownerId: string) {
    return this.files.export(ownerId);
  }
  async eventImages(
    eventId: string,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    await this.eventAccess(eventId, userId, role, authorization);
    const [avatar, cover] = await Promise.all([
      this.files.eventImage(eventId, 'avatar'),
      this.files.eventImage(eventId, 'cover'),
    ]);
    return { avatar: Boolean(avatar), cover: Boolean(cover) };
  }

  async remove(
    id: string,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    const file = await this.files.get(id);
    if (!file)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    if (file.eventId)
      await this.eventAccess(file.eventId, userId, role, authorization, true);
    else if (file.ownerId !== userId)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lockId})`;
      await tx.storedFile.deleteMany({ where: { id } });
    });
    await unlink(this.path(id)).catch(() => {});
  }

  async cleanup() {
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lockId})`;
        for (const name of await readdir(this.directory)) {
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              name,
            )
          )
            continue;
          const path = this.path(name);
          const info = await stat(path).catch(() => null);
          if (!info?.isFile() || info.mtimeMs > Date.now() - 3600000) continue;
          if (
            !(await tx.storedFile.findUnique({
              where: { id: name },
              select: { id: true },
            }))
          )
            await unlink(path).catch(() => {});
        }
      },
      { timeout: 60000 },
    );
  }
}
