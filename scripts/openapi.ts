// Builds apps/gateway/openapi.json from every service's operations.
// Usage: tsx scripts/openapi.ts [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import * as contracts from '@event-sharing/contracts';
import {
  buildOpenApiDocument,
  schemaNames,
  type ApiOperation,
} from '@event-sharing/contracts';
import * as gateway from '../apps/gateway/src/openapi.js';
import * as auth from '../services/auth/src/openapi.js';
import * as eventLog from '../services/event-log/src/openapi.js';
import * as events from '../services/events/src/openapi.js';
import * as geoSearch from '../services/geo-search/src/openapi.js';
import * as messages from '../services/messages/src/openapi.js';
import * as notifications from '../services/notifications/src/openapi.js';
import * as participation from '../services/participation/src/openapi.js';
import * as storage from '../services/storage/src/openapi.js';
import * as users from '../services/users/src/openapi.js';

type Module = { operations: ApiOperation[]; schemas?: Record<string, unknown> };

const modules: Module[] = [
  gateway,
  auth,
  users,
  events,
  geoSearch,
  participation,
  notifications,
  messages,
  eventLog,
  storage,
];

export const specPath = new URL(
  '../apps/gateway/openapi.json',
  import.meta.url,
);

export function openApiDocument(): Record<string, unknown> {
  const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return buildOpenApiDocument(
    {
      title: 'Event Sharing API',
      version,
      description:
        'Public HTTP API of the event sharing platform, served by Gateway. ' +
        'Browsers sign in through /auth and send the session cookie; ' +
        'Gateway passes a short-lived internal JWT to each service. ' +
        'Errors use { code, message, details }.',
    },
    modules.flatMap((module) => module.operations),
    schemaNames(
      contracts as Record<string, unknown>,
      ...modules.map((module) => module.schemas ?? {}),
    ),
  );
}

export const serialize = (document: unknown) =>
  `${JSON.stringify(document, null, 2)}\n`;

if (process.argv[1]?.endsWith('openapi.ts')) {
  const next = serialize(openApiDocument());
  if (process.argv.includes('--check')) {
    if (readFileSync(specPath, 'utf8') !== next) {
      console.error('openapi.json is out of date. Run pnpm openapi.');
      process.exit(1);
    }
  } else writeFileSync(specPath, next);
}
