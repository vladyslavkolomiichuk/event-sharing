import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_TOPICS } from '../packages/contracts/src/events/topics.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const topic of Object.values(EVENT_TOPICS)) {
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
    ],
    { cwd: root, stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to create Kafka topic ${topic}.`);
  }
}
