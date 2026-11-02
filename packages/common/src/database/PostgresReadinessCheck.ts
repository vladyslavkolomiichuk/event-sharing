import pg from 'pg';
import type { ReadinessCheck } from './ReadinessCheck.js';

export class PostgresReadinessCheck implements ReadinessCheck {
  constructor(private readonly connectionString: string) {}

  async check(): Promise<boolean> {
    const client = new pg.Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: 1000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
