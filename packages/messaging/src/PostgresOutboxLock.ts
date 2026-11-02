import { Pool } from 'pg';

export class PostgresOutboxLock {
  private readonly pool: Pool;

  constructor(
    connectionString: string,
    private readonly name: string,
  ) {
    this.pool = new Pool({ connectionString, max: 1 });
  }

  async run(work: () => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS acquired',
        ['event-sharing-outbox', this.name],
      );
      if (result.rows[0]?.acquired) await work();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
