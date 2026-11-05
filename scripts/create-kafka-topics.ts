import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_TOPICS } from '../packages/contracts/src/events/topics.js';
import { SERVICE_NAMES } from '../packages/contracts/src/common/service-rpc.schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const topics = [
  ...Object.values(EVENT_TOPICS),
  ...SERVICE_NAMES.map((name) => `event-sharing.rpc.${name}.v1`),
  'event-sharing.rpc.replies.v1',
];
for (const topic of topics) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'kafka',
      '/opt/kafka/bin/kafka-topics.sh',
      '--bootstrap-server',
      '127.0.0.1:9092',
      '--create',
      '--if-not-exists',
      '--topic',
      topic,
      '--partitions',
      '3',
      '--replication-factor',
      '1',
      ...(topic.includes('.rpc.') ? ['--config', 'retention.ms=3600000'] : []),
    ],
    { cwd: root, stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to create Kafka topic ${topic}.`);
  }
}
