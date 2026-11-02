import { once } from 'node:events';
import WebSocket from 'ws';

export class GatewayRealtimeConnection {
  private renewalTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly browser: WebSocket,
    private upstream: WebSocket,
    private readonly upstreamUrl: URL,
    private readonly getToken: () => Promise<string | null>,
    private readonly onClosed: () => void,
    private readonly renewalMs = 4 * 60_000,
  ) {}

  start(): void {
    this.browser.on('close', () => this.stop());
    this.browser.on('error', () => this.stop());
    this.attachUpstream(this.upstream);
    this.scheduleRenewal(this.renewalMs);
    this.heartbeatTimer = setInterval(() => {
      if (this.upstream.readyState === WebSocket.OPEN) this.upstream.ping();
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  close(code = 1001): void {
    if (this.browser.readyState === WebSocket.OPEN) this.browser.close(code);
    this.stop();
  }

  private attachUpstream(socket: WebSocket): void {
    socket.on('message', (data) => {
      if (
        socket === this.upstream &&
        this.browser.readyState === WebSocket.OPEN
      )
        this.browser.send(data);
    });
    socket.on('close', (code) => {
      if (socket !== this.upstream || this.stopped) return;
      this.close(code === 4001 ? 4001 : 1001);
    });
    socket.on('error', () => {
      if (socket !== this.upstream || this.stopped) return;
      this.browser.terminate();
      this.stop();
    });
  }

  private scheduleRenewal(delay: number): void {
    if (this.stopped) return;
    this.renewalTimer = setTimeout(() => void this.renew(), delay);
  }

  private async renew(): Promise<void> {
    if (this.stopped) return;
    try {
      const token = await this.getToken();
      if (!token) {
        this.close(4001);
        return;
      }
      const replacement = new WebSocket(this.upstreamUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
      try {
        await once(replacement, 'open', { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        replacement.terminate();
        throw error;
      }
      if (this.stopped) {
        replacement.close();
        return;
      }
      const previous = this.upstream;
      this.upstream = replacement;
      this.attachUpstream(replacement);
      previous.close();
      this.scheduleRenewal(this.renewalMs);
    } catch {
      this.scheduleRenewal(Math.min(10_000, this.renewalMs));
    }
  }

  private stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.renewalTimer) clearTimeout(this.renewalTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.upstream.close();
    this.onClosed();
  }
}
