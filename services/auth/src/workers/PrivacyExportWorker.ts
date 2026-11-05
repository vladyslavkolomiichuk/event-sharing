import {
  PrivacyExportResultSchema,
  RPC_OPERATIONS,
  ServiceNameSchema,
} from '@event-sharing/contracts';
import { PostgresOutboxLock } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { privacyDatabase, serviceBus } from '../config/service-bus.js';
import { PrivacyServiceClient } from '../clients/PrivacyServiceClient.js';

type Source = {
  jobId: string;
  userId: string;
  service: string;
  collection: number;
  offset: number;
  expiresAt: Date;
};

export class PrivacyExportWorker {
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private readonly lock = new PostgresOutboxLock(
    env.DATABASE_URL,
    'privacy-export',
  );
  private readonly client = new PrivacyServiceClient();

  start(): void {
    this.interval = setInterval(() => void this.tick(), 2000);
    void this.tick();
  }
  private async tick(): Promise<void> {
    if (this.pending) return;
    this.pending = this.runOnce();
    try {
      await this.pending;
    } catch {
      console.error('Personal data export will retry.');
    } finally {
      this.pending = undefined;
    }
  }
  async runOnce(): Promise<void> {
    await this.lock.run(async () => {
      const pool = privacyDatabase.pool;
      await pool.query(
        'DELETE FROM privacy_export_job WHERE "expiresAt" <= now()',
      );
      const sources = await pool.query<Source>(
        `SELECT source.*, job."userId", job."expiresAt" FROM privacy_export_source source JOIN privacy_export_job job ON job.id = source."jobId" WHERE source."completedAt" IS NULL AND source."nextAttemptAt" <= now() ORDER BY source."nextAttemptAt", source."jobId", source.service LIMIT 100`,
      );
      for (const source of sources.rows) {
        const service = ServiceNameSchema.parse(source.service);
        try {
          const cipher = this.client.cipher(service);
          const reply = await serviceBus.call(
            service,
            RPC_OPERATIONS.privacyExport,
            cipher.encode({
              requestId: source.jobId,
              userId: source.userId,
              collection: source.collection,
              offset: source.offset,
              expiresAt: source.expiresAt.getTime(),
            }),
          );
          if (typeof reply !== 'string')
            throw new Error('Invalid export result.');
          const page = PrivacyExportResultSchema.parse(cipher.decode(reply));
          const tx = await pool.connect();
          try {
            await tx.query('BEGIN');
            await tx.query(
              'INSERT INTO privacy_export_page ("jobId", service, collection, "offset", data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
              [source.jobId, service, source.collection, source.offset, reply],
            );
            await tx.query(
              'UPDATE privacy_export_source SET collection = $3, "offset" = $4, "completedAt" = $5, attempts = 0, "nextAttemptAt" = now() WHERE "jobId" = $1 AND service = $2',
              [
                source.jobId,
                service,
                page.next?.collection ?? source.collection,
                page.next?.offset ?? source.offset,
                page.next ? null : new Date(),
              ],
            );
            await tx.query(
              'UPDATE privacy_export_job SET "completedAt" = now() WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM privacy_export_source WHERE "jobId" = $1 AND "completedAt" IS NULL)',
              [source.jobId],
            );
            await tx.query('COMMIT');
          } catch (error) {
            await tx.query('ROLLBACK');
            throw error;
          } finally {
            tx.release();
          }
        } catch {
          await pool.query(
            `UPDATE privacy_export_source SET attempts = attempts + 1, "nextAttemptAt" = now() + make_interval(secs => LEAST(300, power(2, LEAST(attempts + 1, 8)))::integer) WHERE "jobId" = $1 AND service = $2`,
            [source.jobId, service],
          );
        }
      }
    });
  }
  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    await this.lock.close();
  }
}
