import {
  EventEnvelopeSchema,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { Pool } from 'pg';

type Handler = (event: EventEnvelope) => Promise<unknown>;

// Persist later events before acknowledging their Kafka offsets.
export class OrderedEventProcessor {
  private readonly pool: Pool;
  private interval?: NodeJS.Timeout;
  private recovery: Promise<void> | undefined;

  constructor(
    databaseUrl: string,
    private readonly apply: Handler,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });
  }

  start(): void {
    this.interval = setInterval(() => void this.recover(), 5000);
    void this.recover();
  }

  async run(event: EventEnvelope): Promise<unknown> {
    if (!event.delivery) return this.apply(event);
    await this.pool.query(
      'INSERT INTO ordered_delivery (id, stream, "previousEventId", envelope) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [
        event.eventId,
        event.delivery.stream,
        event.delivery.previousEventId,
        JSON.stringify(event),
      ],
    );
    await this.drain(event.delivery.stream);
  }

  private async drain(stream: string): Promise<void> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const lock = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [`ordered:${stream}`],
      );
      locked = lock.rows[0]!.locked;
      if (!locked) return;
      for (let count = 0; count < 100; count++) {
        const pending = await client.query<{ id: string; envelope: string }>(
          `
          SELECT item.id, item.envelope FROM ordered_delivery item
          WHERE item.stream = $1 AND item."processedAt" IS NULL
            AND (item."previousEventId" IS NULL OR EXISTS (
              SELECT 1 FROM ordered_delivery previous
              WHERE previous.id = item."previousEventId" AND previous."processedAt" IS NOT NULL
            )) ORDER BY item."receivedAt", item.id LIMIT 1`,
          [stream],
        );
        const item = pending.rows[0];
        if (!item) return;
        const event = EventEnvelopeSchema.parse(JSON.parse(item.envelope));
        const result = event.redacted ? 'ignored' : await this.apply(event);
        if (result === 'pending') return;
        // The domain inbox makes a crash before this receipt safe to replay.
        await client.query(
          'UPDATE ordered_delivery SET "processedAt" = now(), envelope = NULL WHERE id = $1',
          [item.id],
        );
      }
    } finally {
      if (locked)
        await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [`ordered:${stream}`],
        );
      client.release();
    }
  }

  private async recover(): Promise<void> {
    if (this.recovery) return;
    this.recovery = this.recoverPending();
    try {
      await this.recovery;
    } catch {
      console.error('Ordered event recovery will retry.');
    } finally {
      this.recovery = undefined;
    }
  }

  async recoverPending(): Promise<void> {
    let after = '';
    while (true) {
      const streams = await this.pool.query<{ stream: string }>(
        'SELECT DISTINCT stream FROM ordered_delivery WHERE "processedAt" IS NULL AND stream > $1 ORDER BY stream LIMIT 100',
        [after],
      );
      if (!streams.rows.length) return;
      for (const { stream } of streams.rows) await this.drain(stream);
      after = streams.rows.at(-1)!.stream;
    }
  }

  async close(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.recovery;
    await this.pool.end();
  }
}
