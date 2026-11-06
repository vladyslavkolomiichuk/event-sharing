import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESEARCH_DIR, ROOT, isFinal, mode } from './stack.js';

type Row = Record<string, string | number | boolean>;

export const round = (value: number, digits = 1) =>
  Number(value.toFixed(digits));

function percentile(sorted: number[], share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.ceil(share * sorted.length) - 1] ?? 0;
}

export function stats(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    mean:
      sorted.reduce((sum, value) => sum + value, 0) /
      Math.max(sorted.length, 1),
  };
}

// Random values come from a fixed seed, so every run repeats the same workload.
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// Writes one table as CSV for charts and Markdown for the report.
export function saveTable(experiment: string, name: string, rows: Row[]): void {
  const directory = resolve(RESEARCH_DIR, 'results', experiment);
  mkdirSync(directory, { recursive: true });
  const columns = Object.keys(rows[0] ?? {});
  const cells = (row: Row) => columns.map((column) => String(row[column]));
  writeFileSync(
    resolve(directory, `${name}.csv`),
    [columns.join(','), ...rows.map((row) => cells(row).join(','))].join('\n') +
      '\n',
  );
  writeFileSync(
    resolve(directory, `${name}.md`),
    [
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${cells(row).join(' | ')} |`),
    ].join('\n') + '\n',
  );
  writeFileSync(
    resolve(directory, `${name}.run.json`),
    JSON.stringify(
      {
        profile: isFinal ? 'final' : 'pilot',
        mode,
        finishedAt: new Date().toISOString(),
        commit: git('rev-parse', 'HEAD'),
        uncommittedFiles: git('status', '--short').split('\n').filter(Boolean)
          .length,
      },
      null,
      2,
    ) + '\n',
  );
  console.info(`Saved ${experiment}/${name} with ${rows.length} rows.`);
}
