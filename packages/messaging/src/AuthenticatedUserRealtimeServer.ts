import type { Server } from 'node:http';
import type { InternalJwtVerifier } from '@event-sharing/common';
import { WebSocketServer } from 'ws';
import { UserRealtimeHub } from './UserRealtimeHub.js';

export class AuthenticatedUserRealtimeServer extends UserRealtimeHub {
  private readonly sockets = new WebSocketServer({ noServer: true });

  constructor(private readonly verifier: InternalJwtVerifier) {
    super();
  }

  attach(server: Server): void {
    server.on('upgrade', async (request, socket, head) => {
      if (request.url !== '/realtime') return socket.destroy();
      const claims = await this.verifier.verify(request.headers.authorization);
      if (!claims) return socket.destroy();
      this.sockets.handleUpgrade(request, socket, head, (connection) => {
        this.add(claims.sub, connection, claims.exp * 1000);
      });
    });
  }
}
