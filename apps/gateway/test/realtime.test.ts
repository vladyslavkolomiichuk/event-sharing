import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

vi.mock('../src/config/service-bus.js', () => ({
  serviceBus: { call: vi.fn() },
}));

// The upstream service records tokens and echoes a greeting.
const tokens: string[] = [];
const upstream = new WebSocketServer({ port: 0, host: '127.0.0.1' });
upstream.on('connection', (socket, request) => {
  tokens.push(String(request.headers.authorization));
  socket.send(JSON.stringify({ type: 'notifications.changed' }));
});
await new Promise((resolve) => upstream.once('listening', resolve));
process.env.NOTIFICATIONS_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

const { GatewayRealtimeProxy } =
  await import('../src/realtime/GatewayRealtimeProxy.js');

const userId = randomUUID();
const identity = (token: string) => ({
  token,
  username: 'iryna',
  user: { id: userId, role: 'USER' },
});
const auth = { getSessionIdentity: vi.fn() };
const server = createServer();
const proxy = new GatewayRealtimeProxy(auth as never, 200);
proxy.attach(server);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => {
  proxy.close();
  server.close();
  upstream.close();
});
beforeEach(() => {
  tokens.length = 0;
  auth.getSessionIdentity.mockReset();
});

function connect(path: string, origin = 'http://app.test') {
  const socket = new WebSocket(`${url}${path}`, {
    headers: { origin, cookie: 'session=1' },
  });
  const messages: string[] = [];
  socket.on('message', (data) => messages.push(String(data)));
  const closed = new Promise<number>((resolve) => {
    socket.on('close', (code) => resolve(code));
    socket.on('error', () => resolve(-1));
  });
  return { socket, messages, closed };
}

describe('GatewayRealtimeProxy', () => {
  it('relays upstream messages with the internal token', async () => {
    auth.getSessionIdentity.mockResolvedValue(identity('first'));
    const { socket, messages } = connect('/realtime/notifications');
    await vi.waitFor(() =>
      expect(messages).toEqual([
        JSON.stringify({ type: 'notifications.changed' }),
      ]),
    );
    expect(tokens).toEqual(['Bearer first']);
    socket.close();
  });

  it('renews the upstream connection with a fresh token', async () => {
    auth.getSessionIdentity
      .mockResolvedValueOnce(identity('first'))
      .mockResolvedValue(identity('second'));
    const { socket } = connect('/realtime/notifications');
    await vi.waitFor(() => expect(tokens).toContain('Bearer second'), {
      timeout: 2000,
    });
    socket.close();
  });

  it('closes with 4001 when the session ends', async () => {
    auth.getSessionIdentity
      .mockResolvedValueOnce(identity('first'))
      .mockResolvedValue(null);
    const { closed } = connect('/realtime/notifications');
    expect(await closed).toBe(4001);
  });

  it('rejects foreign origins, unknown routes and missing sessions', async () => {
    auth.getSessionIdentity.mockResolvedValue(null);
    for (const [path, origin] of [
      ['/realtime/notifications', 'https://evil.test'],
      ['/realtime/other', 'http://app.test'],
      ['/realtime/notifications', 'http://app.test'],
    ] as const) {
      const { closed } = connect(path, origin);
      expect(await closed).not.toBe(1000);
    }
    expect(tokens).toEqual([]);
  });
});
