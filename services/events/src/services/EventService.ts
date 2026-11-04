import {
  CategorySchema,
  EventListSchema,
  ModerationEventListSchema,
  type CreateEvent,
  type EventDetail,
  type UpdateEvent,
  type UserRole,
} from '@event-sharing/contracts';
import { EventNotFoundError } from '../domain/errors/EventNotFoundError.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import type { EventWithCategory } from '../models/EventWithCategory.js';
import {
  decodeEventListCursor,
  encodeEventListCursor,
  type EventListScope,
} from '../lib/event-list-cursor.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { EventRepository } from '../repositories/EventRepository.js';
import { EventResponseFactory } from './EventResponseFactory.js';
import type { EventAction } from '../domain/EventLifecyclePolicy.js';

export class EventService {
  constructor(
    private readonly categories = new CategoryRepository(),
    private readonly events = new EventRepository(),
    private readonly responses = new EventResponseFactory(),
  ) {}

  async listCategories() {
    const categories = await this.categories.list();
    return categories.map((category) =>
      CategorySchema.parse({ id: category.id, name: category.name }),
    );
  }

  async createCategory(name: string, role: UserRole) {
    if (role !== 'ADMIN') throw new ForbiddenError();
    const category = await this.categories.create(name);
    return CategorySchema.parse({ id: category.id, name: category.name });
  }

  async create(
    input: CreateEvent,
    userId: string,
    role: UserRole,
  ): Promise<EventDetail> {
    if (role !== 'ORGANIZER' && role !== 'ADMIN') throw new ForbiddenError();
    return this.responses.detail(await this.events.create(userId, input), true);
  }

  async get(id: string, userId: string, role: UserRole): Promise<EventDetail> {
    const event = await this.events.findById(id);
    if (!event) throw new EventNotFoundError();
    const owner = event.organizerId === userId || role === 'ADMIN';
    if (!owner && !this.events.isPublic(event.status))
      throw new EventNotFoundError();
    if (
      event.visibility === 'INVITE_ONLY' &&
      !owner &&
      !(await this.events.hasParticipantAccess(id, userId))
    )
      throw new EventNotFoundError();
    let revealLocation = owner;
    if (!owner && event.status !== 'CANCELLED' && event.status !== 'ARCHIVED') {
      revealLocation = await this.events.hasParticipantAccess(id, userId);
    }
    return this.responses.detail(event, revealLocation);
  }

  async listPublic(
    cursor: string | undefined,
    categoryId?: string,
    limit = 20,
  ) {
    const scope: EventListScope = {
      list: 'public',
      ...(categoryId ? { categoryId } : {}),
    };
    return this.toList(
      await this.events.listPublic(
        cursor ? decodeEventListCursor(cursor, scope) : null,
        categoryId,
        limit,
      ),
      false,
      scope,
      limit,
    );
  }

  async listPublicByOrganizer(
    organizerId: string,
    cursor: string | undefined,
    limit = 20,
  ) {
    const scope: EventListScope = { list: 'organizer', ownerId: organizerId };
    return this.toList(
      await this.events.listPublicByOrganizer(
        organizerId,
        cursor ? decodeEventListCursor(cursor, scope) : null,
        limit,
      ),
      false,
      scope,
      limit,
    );
  }

  async listMine(userId: string, cursor: string | undefined, limit = 20) {
    const scope: EventListScope = { list: 'mine', ownerId: userId };
    return this.toList(
      await this.events.listMine(
        userId,
        cursor ? decodeEventListCursor(cursor, scope) : null,
        limit,
      ),
      true,
      scope,
      limit,
    );
  }

  hasActiveEvents(userId: string): Promise<boolean> {
    return this.events.hasActiveEvents(userId);
  }

  async listModeration(role: UserRole, cursor?: string, limit = 20) {
    if (role !== 'ADMIN') throw new ForbiddenError();
    const scope: EventListScope = { list: 'moderation' };
    const [rows, total] = await Promise.all([
      this.events.listModeration(
        cursor ? decodeEventListCursor(cursor, scope) : null,
        limit,
      ),
      this.events.countModeration(),
    ]);
    return ModerationEventListSchema.parse({
      ...this.toList(rows, true, scope, limit),
      total,
    });
  }

  async exportMine(userId: string): Promise<EventDetail[]> {
    const events = await this.events.findAllByOrganizer(userId);
    return events.map((event) => this.responses.detail(event, true));
  }

  async update(
    id: string,
    userId: string,
    role: UserRole,
    patch: UpdateEvent,
  ): Promise<EventDetail> {
    return this.responses.detail(
      await this.events.update(id, userId, role, patch),
      true,
    );
  }

  async updateChatSetting(
    id: string,
    userId: string,
    role: UserRole,
    chatEnabled: boolean,
  ): Promise<EventDetail> {
    return this.responses.detail(
      await this.events.updateChatSetting(id, userId, role, chatEnabled),
      true,
    );
  }

  async transition(
    id: string,
    userId: string,
    role: UserRole,
    action: EventAction,
    reason: string | null = null,
  ): Promise<EventDetail> {
    return this.responses.detail(
      await this.events.transition(id, userId, role, action, reason),
      true,
    );
  }

  private toList(
    rows: EventWithCategory[],
    revealLocation: boolean,
    scope: EventListScope,
    limit: number,
  ) {
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return EventListSchema.parse({
      items: page.map((event) => this.responses.detail(event, revealLocation)),
      nextCursor:
        hasMore && last
          ? encodeEventListCursor(last.id, last.createdAt, scope)
          : null,
    });
  }
}
