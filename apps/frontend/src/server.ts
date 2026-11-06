import { createServer } from 'node:http';
import next from 'next';
import { FrontendRealtimeProxy } from './realtime/FrontendRealtimeProxy.js';

const dev = process.argv.includes('--dev');
const hostname = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
const app = next({ dev, hostname, port });
await app.prepare();

const realtime = new FrontendRealtimeProxy(
  process.env.GATEWAY_URL ?? 'http://127.0.0.1:8000',
  process.env.FRONTEND_ORIGIN ?? `http://127.0.0.1:${port}`,
);
const handleRequest = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();
const server = createServer((request, response) => {
  void handleRequest(request, response);
});
server.on('upgrade', (request, socket, head) => {
  if (realtime.handles(request)) {
    realtime.upgrade(request, socket, head);
    return;
  }
  void handleUpgrade(request, socket, head);
});

await new Promise<void>((resolve, reject) => {
  server.listen(port, hostname, resolve);
  server.once('error', reject);
});
console.info(`Frontend listening on ${hostname}:${port}.`);

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  realtime.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await app.close();
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
