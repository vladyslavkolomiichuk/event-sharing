import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';

export class FrontendRealtimeProxy {
  private readonly sockets = new WebSocketServer({ noServer: true });
  private readonly active = new Set<WebSocket>();

  constructor(
    private readonly gatewayUrl: string,
    private readonly trustedOrigin: string,
  ) {}

  handles(request: IncomingMessage): boolean {
    const path = request.url?.split('?')[0];
    return path === '/realtime/notifications' || path === '/realtime/messages';
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (
      !this.handles(request) ||
      request.headers.origin !== this.trustedOrigin ||
      !request.headers.cookie
    ) {
      socket.destroy();
      return;
    }

    const upstreamUrl = new URL(request.url!, this.gatewayUrl);
    upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const upstream = new WebSocket(upstreamUrl, {
      headers: {
        cookie: request.headers.cookie,
        origin: this.trustedOrigin,
      },
    });
    upstream.once('error', () => socket.destroy());
    upstream.once('open', () => {
      if (socket.destroyed) return upstream.close();
      this.sockets.handleUpgrade(request, socket, head, (browser) => {
        this.active.add(browser);
        const keepAlive = setInterval(() => {
          if (browser.readyState === WebSocket.OPEN) browser.ping();
          if (upstream.readyState === WebSocket.OPEN) upstream.ping();
        }, 30_000);
        keepAlive.unref();
        upstream.on('message', (data) => {
          if (browser.readyState === WebSocket.OPEN) browser.send(data);
        });
        upstream.on('close', (code, reason) => {
          clearInterval(keepAlive);
          if (browser.readyState !== WebSocket.OPEN) return;
          if (code === 1005 || code === 1006 || code === 1015)
            browser.terminate();
          else browser.close(code, reason.toString());
        });
        browser.on('close', () => {
          clearInterval(keepAlive);
          this.active.delete(browser);
          upstream.close();
        });
        browser.on('error', () => upstream.close());
      });
    });
  }

  close(): void {
    for (const socket of this.active) socket.close(1001, 'Frontend stopping');
    this.active.clear();
  }
}
