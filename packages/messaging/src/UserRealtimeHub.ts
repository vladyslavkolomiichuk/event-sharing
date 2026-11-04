import WebSocket from 'ws';
import type { RealtimeSignal } from '@event-sharing/contracts';

export class UserRealtimeHub {
  private readonly connections = new Map<string, Set<WebSocket>>();

  add(userId: string, socket: WebSocket, expiresAt: number): void {
    const sockets = this.connections.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.connections.set(userId, sockets);

    const expiry = setTimeout(
      () => socket.close(4001, 'Session expired'),
      Math.max(0, expiresAt - Date.now()),
    );
    const remove = () => {
      clearTimeout(expiry);
      sockets.delete(socket);
      if (sockets.size === 0) this.connections.delete(userId);
    };
    socket.on('close', remove);
    socket.on('error', remove);
  }

  publish(userIds: Iterable<string>, signal: RealtimeSignal): void {
    const message = JSON.stringify(signal);
    for (const userId of new Set(userIds)) {
      for (const socket of this.connections.get(userId) ?? []) {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(message);
          } catch {
            socket.terminate();
          }
        }
      }
    }
  }

  broadcast(signal: RealtimeSignal): void {
    this.publish(this.connections.keys(), signal);
  }

  close(): void {
    for (const sockets of this.connections.values()) {
      for (const socket of sockets) socket.close(1001, 'Service stopping');
    }
    this.connections.clear();
  }
}
