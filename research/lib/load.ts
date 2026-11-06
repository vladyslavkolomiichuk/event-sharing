import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { User } from './api.js';
import {
  ORIGIN,
  PROXY_NETWORK,
  RESEARCH_DIR,
  projectContainers,
} from './stack.js';

const run = promisify(execFile);
const K6_IMAGE = 'grafana/k6:1.4.2';
const WORK_DIR = resolve(RESEARCH_DIR, 'results/tmp');

export type LoadRequest = {
  method: 'POST' | 'DELETE';
  path: string;
  body?: string;
  cookie: string;
};

export const joinRequest = (
  eventId: string,
  cookie: string,
  method: 'POST' | 'DELETE' = 'POST',
): LoadRequest => ({
  method,
  path: `/api/participation/events/${eventId}/join`,
  ...(method === 'POST' ? { body: '{}' } : {}),
  cookie,
});

export type LoadSummary = {
  httpP50: number;
  httpP95: number;
  httpP99: number;
  requestsPerSecond: number;
  accepted: number;
  rejected: number;
  failed: number;
  dropped: number;
  failedStatuses: string;
  cpuPercent: number;
  memoryMiB: number;
};

// Walks events first, which gives unique user and event pairs with little lock contention.
export function joinPairs(
  users: User[],
  eventIds: string[],
  size: number,
): LoadRequest[] {
  if (size > users.length * eventIds.length)
    throw new Error('Not enough users and events for unique pairs.');
  return Array.from({ length: size }, (_, index) =>
    joinRequest(
      eventIds[index % eventIds.length]!,
      users[Math.floor(index / eventIds.length)]!.cookie,
    ),
  );
}

function sampleResources() {
  const containers = projectContainers();
  const samples: { cpu: number; memory: number }[] = [];
  let active = true;
  // Stopping does not wait for this loop, so callers can act right after the load.
  void (async () => {
    while (active) {
      const { stdout } = await run('docker', [
        'stats',
        '--no-stream',
        '--format',
        '{{.CPUPerc}} {{.MemUsage}}',
        ...containers,
      ]);
      const lines = stdout.trim().split('\n');
      samples.push({
        cpu: lines.reduce((sum, line) => sum + parseFloat(line), 0),
        memory: lines.reduce((sum, line) => {
          const [, value = '0', unit = ''] =
            line.match(/ ([\d.]+)(GiB|MiB|KiB)/) ?? [];
          const scale = unit === 'GiB' ? 1024 : unit === 'KiB' ? 1 / 1024 : 1;
          return sum + Number(value) * scale;
        }, 0),
      });
    }
  })().catch(() => {});
  return () => {
    active = false;
    return {
      cpuPercent:
        samples.reduce((sum, sample) => sum + sample.cpu, 0) /
        Math.max(samples.length, 1),
      memoryMiB: Math.max(0, ...samples.map((sample) => sample.memory)),
    };
  };
}

export async function runLoad(
  requests: LoadRequest[],
  options: { vus: number; rate?: number },
): Promise<LoadSummary> {
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(resolve(WORK_DIR, 'requests.json'), JSON.stringify(requests));
  const stopSampling = sampleResources();
  const { stderr } = await run(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      String(process.getuid?.() ?? 0),
      '--network',
      PROXY_NETWORK,
      '-v',
      `${RESEARCH_DIR}/load:/scripts:ro`,
      '-v',
      `${WORK_DIR}:/work`,
      '-e',
      'GATEWAY_URL=http://gateway:8000',
      '-e',
      `ORIGIN=${ORIGIN}`,
      '-e',
      `VUS=${options.vus}`,
      '-e',
      `RATE=${options.rate ?? 0}`,
      K6_IMAGE,
      'run',
      '--quiet',
      '--summary-export',
      '/work/summary.json',
      '/scripts/requests.js',
    ],
    { maxBuffer: 1024 ** 3 },
  );
  const resources = stopSampling();
  const { metrics } = JSON.parse(
    readFileSync(resolve(WORK_DIR, 'summary.json'), 'utf8'),
  );
  const statuses = new Map<string, number>();
  for (const [, status = ''] of stderr.matchAll(/failed status=(\d+)/g))
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
  return {
    httpP50: metrics.http_req_duration.med,
    httpP95: metrics.http_req_duration['p(95)'],
    httpP99: metrics.http_req_duration['p(99)'],
    requestsPerSecond: metrics.http_reqs.rate,
    accepted: metrics.accepted?.count ?? 0,
    rejected: metrics.rejected?.count ?? 0,
    failed: metrics.failed?.count ?? 0,
    dropped: metrics.dropped_iterations?.count ?? 0,
    failedStatuses:
      [...statuses].map(([status, total]) => `${status}:${total}`).join(' ') ||
      '-',
    ...resources,
  };
}
