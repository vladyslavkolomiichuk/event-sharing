import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import type { AuthServiceClient } from '../clients/AuthServiceClient.js';
import { env } from '../config/env.js';
import { GatewayRealtimeConnection } from './GatewayRealtimeConnection.js';

export class GatewayRealtimeProxy {
  private readonly sockets = new WebSocketServer({ noServer: true });
  private readonly active = new Set<GatewayRealtimeConnection>();

  constructor(
    private readonly auth: AuthServiceClient,
    private readonly renewalMs = 4 * 60_000,
  ) {}

  attach(server: Server): void {
    server.on('upgrade', async (request, socket, head) => {
      const route = request.url?.split('?')[0];
      const serviceUrl =
        route === '/realtime/notifications'
          ? env.NOTIFICATIONS_SERVICE_URL
          : route === '/realtime/messages'
            ? env.MESSAGES_SERVICE_URL
            : null;
      if (!serviceUrl || request.headers.origin !== env.FRONTEND_ORIGIN) {
        socket.destroy();
        return;
      }

      try {
        const identity = await this.auth.getSessionIdentity(
          request.headers.cookie,
        );
        if (!identity) {
          socket.destroy();
          return;
        }
        const upstreamUrl = new URL('/realtime', serviceUrl);
        upstreamUrl.protocol =
          upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        const upstream = new WebSocket(upstreamUrl, {
          headers: { authorization: `Bearer ${identity.token}` },
        });
        const initialError = () => socket.destroy();
        upstream.once('error', initialError);
        upstream.once('open', () => {
          upstream.off('error', initialError);
          if (socket.destroyed) return upstream.close();
          this.sockets.handleUpgrade(request, socket, head, (browser) => {
            const connection = new GatewayRealtimeConnection(
              browser,
              upstream,
              upstreamUrl,
              async () => {
                const refreshed = await this.auth.getSessionIdentity(
                  request.headers.cookie,
                );
                return refreshed?.user.id === identity.user.id
                  ? refreshed.token
                  : null;
              },
              () => this.active.delete(connection),
              this.renewalMs,
            );
            this.active.add(connection);
            connection.start();
          });
        });
      } catch {
        socket.destroy();
      }
    });
  }

  close(): void {
    for (const connection of this.active) connection.close();
    this.active.clear();
  }
}
