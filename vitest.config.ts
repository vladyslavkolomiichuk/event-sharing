import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) =>
  fileURLToPath(new URL(`./${path}`, import.meta.url));

// Workspace packages resolve to sources, so tests need no build.
const alias = {
  '@event-sharing/contracts': source('packages/contracts/src/index.ts'),
  '@event-sharing/common': source('packages/common/src/index.ts'),
  '@event-sharing/messaging': source('packages/messaging/src/index.ts'),
};

const nodeProject = (root: string) => ({
  resolve: { alias },
  test: {
    name: root.split('/').pop(),
    root: source(root),
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    setupFiles: [source('test/service-env.setup.ts')],
  },
});

export default defineConfig({
  test: {
    projects: [
      ...[
        'packages/common',
        'packages/contracts',
        'packages/messaging',
        'apps/gateway',
        'services/auth',
        'services/event-log',
        'services/events',
        'services/geo-search',
        'services/messages',
        'services/notifications',
        'services/participation',
        'services/storage',
        'services/users',
      ].map(nodeProject),
      {
        resolve: {
          alias: { ...alias, '@': source('apps/frontend/src') },
        },
        test: {
          name: 'frontend',
          root: source('apps/frontend'),
          include: ['test/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
        },
      },
    ],
  },
});
