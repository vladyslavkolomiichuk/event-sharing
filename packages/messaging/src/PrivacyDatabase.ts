import { Pool, type PoolClient } from 'pg';
import { PrivacyWorkSchema, type PrivacyWork } from '@event-sharing/contracts';
import { ServiceMessageCipher } from './ServiceMessageCipher.js';
import { ServiceRpcError } from './ServiceRpcError.js';

export const PRIVACY_LOCK = 194727202;
export type PrivacyHandler = (
  transaction: PoolClient,
  work: PrivacyWork,
) => Promise<unknown>;

export class PrivacyDatabase {
  readonly pool: Pool;
  readonly cipher: ServiceMessageCipher;
  private cleanup?: NodeJS.Timeout;

  constructor(databaseUrl: string, key: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
    this.cipher = new ServiceMessageCipher(key);
  }

  startCleanup(): void {
    const cleanup = async () => {
      try {
        await this.pool.query(
          'DELETE FROM privacy_export_snapshot WHERE "expiresAt" <= now()',
        );
      } catch {
        console.error('Expired export cleanup will retry.');
      }
    };
    this.cleanup = setInterval(() => void cleanup(), 3600000);
    void cleanup();
  }

  async process(
    operation: string,
    input: unknown,
    handler: PrivacyHandler,
  ): Promise<string> {
    if (typeof input !== 'string')
      throw new ServiceRpcError('Invalid privacy command.', 'FORBIDDEN', 403);
    const decoded = this.cipher.decode(input) as {
      operation?: unknown;
      work?: unknown;
    };
    if (decoded.operation !== operation)
      throw new ServiceRpcError('Invalid privacy operation.', 'FORBIDDEN', 403);
    const work = PrivacyWorkSchema.parse(decoded.work);
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock($1)', [PRIVACY_LOCK]);
      const receipt = await tx.query<{ result: string }>(
        'SELECT result FROM privacy_receipt WHERE "requestId" = $1 AND operation = $2',
        [work.requestId, operation],
      );
      if (receipt.rows[0]) {
        await tx.query('COMMIT');
        return receipt.rows[0].result;
      }
      const result = await handler(tx, work);
      const sealed = this.cipher.encode({
        requestId: work.requestId,
        operation,
        result,
      });
      await tx.query(
        'INSERT INTO privacy_receipt ("requestId", operation, result) VALUES ($1, $2, $3)',
        [work.requestId, operation, sealed],
      );
      await tx.query('COMMIT');
      console.info(
        `Privacy ${operation} completed for request ${work.requestId}.`,
      );
      return sealed;
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    } finally {
      tx.release();
    }
  }

  async close(): Promise<void> {
    if (this.cleanup) clearInterval(this.cleanup);
    await this.pool.end();
  }
}
