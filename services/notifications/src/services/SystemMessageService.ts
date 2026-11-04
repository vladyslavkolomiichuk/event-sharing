import {
  SystemMessageListSchema,
  SystemMessageSchema,
  type CreateSystemMessage,
  type UserRole,
} from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';
import { SystemMessageRepository } from '../repositories/SystemMessageRepository.js';

export class SystemMessageService {
  constructor(
    private readonly repository = new SystemMessageRepository(),
    private readonly onChanged: () => void = () => {},
  ) {}

  async list(role: UserRole, cursor?: string) {
    if (cursor) {
      const message = await this.repository.find(cursor);
      if (
        !message ||
        (role !== 'ADMIN' &&
          message.audience !== 'ALL' &&
          message.audience !== role)
      )
        throw new ResourceNotFoundError();
    }
    const records = await this.repository.list(role, cursor);
    const items = records.slice(0, 20).map((record) => this.toResponse(record));
    return SystemMessageListSchema.parse({
      items,
      nextCursor: records.length > 20 ? (items.at(-1)?.id ?? null) : null,
    });
  }

  async create(role: UserRole, input: CreateSystemMessage) {
    if (role !== 'ADMIN') throw new ForbiddenError();
    const record = await this.repository.create(input);
    this.onChanged();
    return this.toResponse(record);
  }

  async remove(id: string, role: UserRole) {
    if (role !== 'ADMIN') throw new ForbiddenError();
    const result = await this.repository.remove(id);
    if (result.count === 0) throw new ResourceNotFoundError();
    this.onChanged();
    return { deleted: true };
  }

  private toResponse(record: {
    id: string;
    title: string;
    body: string;
    audience: string;
    createdAt: Date;
  }) {
    return SystemMessageSchema.parse({
      id: record.id,
      title: record.title,
      body: record.body,
      audience: record.audience,
      createdAt: record.createdAt.toISOString(),
    });
  }
}
