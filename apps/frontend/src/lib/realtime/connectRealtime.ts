type RealtimeOptions = {
  path: string;
  signalType: string;
  onConnected: () => void;
  onSignal: (signal: Record<string, unknown>) => void;
  onDisconnected: () => void;
  onRestored: () => void;
};

function socketUrl(path: string): string {
  const base = new URL(
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`,
  );
  base.pathname = path;
  return base.toString();
}

export function connectRealtime(options: RealtimeOptions): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let warning: ReturnType<typeof setTimeout> | null = null;
  let warned = false;
  let stopped = false;
  let retryDelay = 1000;

  const reconnect = () => {
    if (stopped) return;
    if (retry) clearTimeout(retry);
    socket?.close();
    socket = null;
    open();
  };

  const scheduleRetry = () => {
    if (stopped || retry) return;
    if (!warning) {
      warning = setTimeout(() => {
        warned = true;
        options.onDisconnected();
        warning = null;
      }, 5000);
    }
    retry = setTimeout(() => {
      retry = null;
      open();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };

  const open = () => {
    if (stopped || socket) return;
    let current: WebSocket;
    try {
      current = new WebSocket(socketUrl(options.path));
    } catch {
      scheduleRetry();
      return;
    }
    socket = current;
    current.onopen = () => {
      if (stopped || socket !== current) return;
      retryDelay = 1000;
      if (warning) clearTimeout(warning);
      warning = null;
      if (warned) options.onRestored();
      warned = false;
      options.onConnected();
    };
    current.onmessage = (event) => {
      if (stopped || socket !== current) return;
      try {
        const signal: unknown = JSON.parse(String(event.data));
        if (!signal || typeof signal !== 'object') return;
        const data = signal as Record<string, unknown>;
        if (data.type === options.signalType) options.onSignal(data);
      } catch {
        // Ignore malformed transport signals.
      }
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      scheduleRetry();
    };
  };

  const visible = () => {
    if (document.visibilityState !== 'visible') return;
    if (socket) options.onConnected();
    else reconnect();
  };
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', visible);
  open();

  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (warning) clearTimeout(warning);
    window.removeEventListener('online', reconnect);
    document.removeEventListener('visibilitychange', visible);
    socket?.close();
    socket = null;
  };
}
