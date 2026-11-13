import { vi } from 'vitest';

export type Responder = (
  sql: string,
  params: unknown[],
) => { rows?: unknown[]; rowCount?: number } | undefined;

// Records SQL and answers from one shared responder.
export function createFakePg() {
  const state = {
    queries: [] as { sql: string; params: unknown[] }[],
    respond: (() => undefined) as Responder,
  };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    state.queries.push({ sql, params });
    const result = state.respond(sql, params) ?? {};
    const rows = result.rows ?? [];
    return { rows, rowCount: result.rowCount ?? rows.length };
  });
  const client = { query, release: vi.fn() };
  const pool = {
    query,
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
  const sql = () => state.queries.map((entry) => entry.sql);
  return { state, query, client, pool, sql };
}
