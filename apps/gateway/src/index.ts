import { env } from './config/env.js';
import { AuthServiceClient } from './clients/AuthServiceClient.js';
import { ServiceHealthClient } from './clients/ServiceHealthClient.js';
import { createApp } from './app.js';
import { createAuthenticateBrowserSession } from './middleware/authentication.js';
import { createAuthProxy } from './proxies/auth-service.proxy.js';
import { ServiceProxy } from './proxies/ServiceProxy.js';
import { GatewayRealtimeProxy } from './realtime/GatewayRealtimeProxy.js';

const services = [
  ['Auth', env.AUTH_SERVICE_URL],
  ['Users', env.USERS_SERVICE_URL],
  ['Events', env.EVENTS_SERVICE_URL],
  ['Geo Search', env.GEO_SEARCH_SERVICE_URL],
  ['Participation', env.PARTICIPATION_SERVICE_URL],
  ['Notifications', env.NOTIFICATIONS_SERVICE_URL],
  ['Messages', env.MESSAGES_SERVICE_URL],
  ['Event Log', env.EVENT_LOG_SERVICE_URL],
] as const;

const clients = services.map(
  ([name, url]) => new ServiceHealthClient(name, url),
);

const authClient = new AuthServiceClient(env.AUTH_SERVICE_URL);
const realtime = new GatewayRealtimeProxy(authClient);
const app = createApp({
  clients,
  authProxy: createAuthProxy(env.AUTH_SERVICE_URL),
  authenticateBrowserSession: createAuthenticateBrowserSession(authClient),
  serviceProxies: {
    users: new ServiceProxy(
      env.USERS_SERVICE_URL,
      '/api/users',
      'Users',
    ).create(),
    events: new ServiceProxy(
      env.EVENTS_SERVICE_URL,
      '/api/events',
      'Events',
    ).create(),
    search: new ServiceProxy(
      env.GEO_SEARCH_SERVICE_URL,
      '/api/search',
      'Geo Search',
    ).create(),
    participation: new ServiceProxy(
      env.PARTICIPATION_SERVICE_URL,
      '/api/participation',
      'Participation',
    ).create(),
    notifications: new ServiceProxy(
      env.NOTIFICATIONS_SERVICE_URL,
      '/api/notifications',
      'Notifications',
    ).create(),
    messages: new ServiceProxy(
      env.MESSAGES_SERVICE_URL,
      '/api/messages',
      'Messages',
    ).create(),
    eventLog: new ServiceProxy(
      env.EVENT_LOG_SERVICE_URL,
      '/api/event-log',
      'Event Log',
    ).create(),
  },
});

let server!: ReturnType<typeof app.listen>;
await new Promise<void>((resolve, reject) => {
  server = app.listen(env.PORT, '0.0.0.0', () => resolve());
  server.once('error', reject);
});
realtime.attach(server);

console.info(`Gateway listening on port ${env.PORT}.`);

function shutdown(): void {
  realtime.close();
  server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
