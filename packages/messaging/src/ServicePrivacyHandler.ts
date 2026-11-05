import {
  ANONYMOUS_USER_ID,
  PrivacyExportPageSchema,
  RPC_OPERATIONS,
  type RpcRequest,
  type PrivacyWork,
} from '@event-sharing/contracts';
import type { PoolClient } from 'pg';
import { PrivacyDatabase } from './PrivacyDatabase.js';
import { ServiceRpcError } from './ServiceRpcError.js';

export type ExportCollection = { name: string; query: string };

export abstract class ServicePrivacyHandler {
  constructor(protected readonly database: PrivacyDatabase) {}
  protected abstract readonly collections: ExportCollection[];
  protected abstract erase(tx: PoolClient, work: PrivacyWork): Promise<unknown>;

  async handle(request: RpcRequest): Promise<unknown> {
    if (request.sender !== 'auth')
      throw new ServiceRpcError(
        'Privacy commands require Auth.',
        'FORBIDDEN',
        403,
      );
    if (request.operation === RPC_OPERATIONS.privacyExport)
      return this.exportPage(request.data);
    return this.database.process(
      request.operation,
      request.data,
      async (tx, work) => {
        if (request.operation === RPC_OPERATIONS.privacyReserve)
          return this.reserve(tx, work);
        if (request.operation !== RPC_OPERATIONS.privacyErase)
          throw new ServiceRpcError(
            'Unsupported privacy command.',
            'BAD_REQUEST',
            400,
          );
        await tx.query(
          'INSERT INTO privacy_deleted_user ("userId") VALUES ($1) ON CONFLICT DO NOTHING',
          [work.userId],
        );
        for (const id of work.mailRequestIds)
          await tx.query(
            'INSERT INTO privacy_deleted_mail (id) VALUES ($1) ON CONFLICT DO NOTHING',
            [id],
          );
        for (const eventId of work.removedEventIds)
          await tx.query(
            'INSERT INTO privacy_deleted_event ("eventId") VALUES ($1) ON CONFLICT DO NOTHING',
            [eventId],
          );
        const result = await this.erase(tx, work);
        await this.scrubQueues(tx, work);
        return result;
      },
    );
  }

  protected async reserve(
    _tx: PoolClient,
    _work: PrivacyWork,
  ): Promise<unknown> {
    throw new ServiceRpcError('Unsupported reservation.', 'BAD_REQUEST', 400);
  }

  private async exportPage(input: unknown): Promise<string> {
    if (typeof input !== 'string')
      throw new ServiceRpcError('Invalid export command.', 'FORBIDDEN', 403);
    const page = PrivacyExportPageSchema.parse(
      this.database.cipher.decode(input),
    );
    if (page.expiresAt < Date.now())
      throw new ServiceRpcError('Export expired.', 'EXPORT_EXPIRED', 410);
    const tx = await this.database.pool.connect();
    try {
      await tx.query('SELECT pg_advisory_lock_shared(194727202)');
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `export:${page.requestId}`,
      ]);
      const deleted = await tx.query(
        'SELECT 1 FROM privacy_deleted_user WHERE "userId" = $1',
        [page.userId],
      );
      if (deleted.rowCount)
        throw new ServiceRpcError(
          'Account deletion is in progress.',
          'ACCOUNT_DELETED',
          410,
        );
      const existing = await tx.query(
        'SELECT 1 FROM privacy_export_snapshot WHERE "requestId" = $1 LIMIT 1',
        [page.requestId],
      );
      if (!existing.rowCount) {
        for (const [index, collection] of this.collections.entries()) {
          let offset = 0;
          while (true) {
            const result = await tx.query<Record<string, unknown>>(
              `${collection.query} LIMIT 25 OFFSET $2`,
              [page.userId, offset],
            );
            const next =
              result.rows.length === 25
                ? { collection: index, offset: offset + 25 }
                : index + 1 < this.collections.length
                  ? { collection: index + 1, offset: 0 }
                  : null;
            const data = this.database.cipher.encode({
              collection: collection.name,
              rows: result.rows,
              next,
            });
            await tx.query(
              'INSERT INTO privacy_export_snapshot ("requestId", "userId", collection, "offset", data, "expiresAt") VALUES ($1, $2, $3, $4, $5, $6)',
              [
                page.requestId,
                page.userId,
                index,
                offset,
                data,
                new Date(page.expiresAt),
              ],
            );
            if (result.rows.length < 25) break;
            offset += 25;
          }
        }
      }
      const snapshot = await tx.query<{ data: string }>(
        'SELECT data FROM privacy_export_snapshot WHERE "requestId" = $1 AND "userId" = $2 AND collection = $3 AND "offset" = $4 AND "expiresAt" > now()',
        [page.requestId, page.userId, page.collection, page.offset],
      );
      if (!snapshot.rows[0])
        throw new ServiceRpcError('Export page not found.', 'NOT_FOUND', 404);
      await tx.query('COMMIT');
      return snapshot.rows[0].data;
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    } finally {
      await tx.query('SELECT pg_advisory_unlock_shared(194727202)');
      tx.release();
    }
  }

  private async scrubQueues(tx: PoolClient, work: PrivacyWork): Promise<void> {
    await tx.query('DELETE FROM privacy_export_snapshot WHERE "userId" = $1', [
      work.userId,
    ]);
    const tables = await tx.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const available = new Set(tables.rows.map((row) => row.table_name));
    if (available.has('ordered_delivery')) {
      await tx.query(
        `UPDATE ordered_delivery SET envelope = NULL, "processedAt" = now() WHERE "processedAt" IS NULL AND envelope LIKE '%' || $1 || '%'`,
        [work.userId],
      );
    }
    if (available.has('outbox_stream_head')) {
      // Retain empty predecessor markers so other users' streams can advance.
      await tx.query(
        `UPDATE outbox_event SET redacted = true, payload = '{}' WHERE ordered AND payload::text LIKE '%' || $1 || '%'`,
        [work.userId],
      );
    }
    for (const table of [
      'pending_snapshot_event',
      'pending_membership_event',
    ]) {
      if (!available.has(table)) continue;
      if (table === 'pending_membership_event') {
        await tx.query(
          `DELETE FROM ${table} WHERE envelope::jsonb -> 'payload' ->> 'userId' = $1`,
          [work.userId],
        );
      } else {
        await tx.query(
          `UPDATE ${table} SET envelope = replace(envelope, $1, $2) WHERE envelope LIKE '%' || $1 || '%'`,
          [work.userId, ANONYMOUS_USER_ID],
        );
      }
      await tx.query(
        `DELETE FROM ${table} WHERE COALESCE(envelope::jsonb -> 'payload' ->> 'eventId', envelope::jsonb -> 'payload' ->> 'id') = ANY($1::text[])`,
        [work.removedEventIds],
      );
    }
    if (available.has('outbox_event')) {
      await tx.query(
        `DELETE FROM outbox_event WHERE payload ->> 'userId' = $1 OR payload ->> 'senderId' = $1 OR payload ->> 'recipientId' = $1 OR payload ->> 'actorId' = $1 OR payload ->> 'subjectId' = $1`,
        [work.userId],
      );
      await tx.query(
        `UPDATE outbox_event SET payload = jsonb_set(payload, '{organizerId}', to_jsonb($2::text)) WHERE payload ->> 'organizerId' = $1`,
        [work.userId, ANONYMOUS_USER_ID],
      );
      await tx.query(
        `UPDATE outbox_event SET payload = jsonb_set(payload, '{completedParticipantIds}', COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(payload -> 'completedParticipantIds') WHERE value #>> '{}' <> $1), '[]')) WHERE jsonb_typeof(payload -> 'completedParticipantIds') = 'array'`,
        [work.userId],
      );
      await tx.query(
        `DELETE FROM outbox_event WHERE COALESCE(payload ->> 'eventId', payload ->> 'id') = ANY($1::text[])`,
        [work.removedEventIds],
      );
    }
  }
}
