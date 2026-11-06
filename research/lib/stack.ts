import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RESEARCH_DIR = resolve(ROOT, 'research');
export const GATEWAY_URL = 'http://127.0.0.1:18000';
export const ORIGIN = 'http://research.local';
export const PROXY_NETWORK = 'event-sharing-research-proxy';
export const isFinal = process.env.RESEARCH_PROFILE === 'final';

// A separate project name keeps these volumes apart from the deployed data.
const PROJECT = 'event-sharing-research';
const SERVICES = [
  'gateway',
  'auth',
  'users',
  'events',
  'geo-search',
  'participation',
  'notifications',
  'messages',
  'event-log',
];
const environment = {
  ...process.env,
  NETWORK_PREFIX: '10.79',
  GATEWAY_PORT: '18000',
  FRONTEND_ORIGIN: ORIGIN,
  PROXY_NETWORK,
};

export const sleep = (milliseconds: number) =>
  new Promise((done) => setTimeout(done, milliseconds));

export function compose(args: string[], input?: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      '-f',
      'docker-compose.yml',
      '-f',
      'research/compose.research.yaml',
      ...args,
    ],
    {
      cwd: ROOT,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 1024 ** 3,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(input === undefined ? {} : { input }),
    },
  );
}

export function destroyStack(): void {
  compose(['down', '-v', '--remove-orphans']);
  spawnSync('docker', ['network', 'rm', PROXY_NETWORK], { stdio: 'ignore' });
}

export function resetStack(): void {
  destroyStack();
  execFileSync('docker', [
    'network',
    'create',
    '--subnet',
    '10.79.9.0/28',
    PROXY_NETWORK,
  ]);
  compose(['up', '-d', '--no-build', '--wait', ...SERVICES]);
}

// SIGKILL is deliberate: the audit saw a process survive SIGTERM and keep consuming.
export function killService(service: string): void {
  compose(['kill', service]);
  const running = compose(['ps', '-q', '--status', 'running', service]).trim();
  if (running) throw new Error(`${service} is still running.`);
}

export function startService(service: string): void {
  compose(['up', '-d', '--no-build', '--no-deps', service]);
}

export function sql(database: string, query: string): string[][] {
  const output = compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'exec psql -U "$POSTGRES_USER" -d "$0" -AtX -F "|" -v ON_ERROR_STOP=1',
      database,
    ],
    query,
  );
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));
}

export function count(database: string, query: string): number {
  return Number(sql(database, query)[0]?.[0] ?? 0);
}

export function consumerGroups(group: string, args: string[]): string {
  return compose([
    'exec',
    '-T',
    'kafka',
    '/opt/kafka/bin/kafka-consumer-groups.sh',
    '--bootstrap-server',
    '127.0.0.1:9092',
    '--group',
    group,
    ...args,
  ]);
}

export async function waitUntil(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  stepMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      // Services may be restarting, so a failed check only means not ready.
    }
    await sleep(stepMs);
  }
  return false;
}

export function projectContainers(): string[] {
  return compose(['ps', '-q']).split('\n').filter(Boolean);
}
