import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  SERVICE_NAMES,
  type ServiceName,
} from '../packages/contracts/src/common/service-rpc.schema.js';

type Configuration = {
  path: string;
  text: string;
  values: Record<string, string>;
  keys: Partial<Record<ServiceName, string>>;
};
const configurations = new Map<ServiceName, Configuration>();

function set(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, () => line)
    : `${text.trimEnd()}\n${line}\n`;
}

for (const service of SERVICE_NAMES) {
  const path = resolve(
    `${service === 'gateway' ? 'apps' : 'services'}/${service}/.env`,
  );
  const text = await readFile(path, 'utf8');
  const values = parse(text);
  configurations.set(service, {
    path,
    text,
    values,
    keys: JSON.parse(values.SERVICE_BUS_KEYS ?? '{}'),
  });
}

const auth = configurations.get('auth')!;
const privacyKeys: Record<string, string> = JSON.parse(
  auth.values.PRIVACY_SERVICE_KEYS ?? '{}',
);
for (const [service, config] of configurations) {
  for (const [peer, other] of configurations) {
    const existing = config.keys[peer];
    const reverse = other.keys[service];
    if (existing && reverse && existing !== reverse)
      throw new Error(`Service key mismatch: ${service}, ${peer}.`);
    const key = existing ?? reverse ?? randomBytes(32).toString('hex');
    if (!/^[a-f0-9]{64}$/i.test(key))
      throw new Error(`Invalid service key: ${service}, ${peer}.`);
    config.keys[peer] = key;
    other.keys[service] = key;
  }
  if (service === 'gateway') continue;
  privacyKeys[service] ??=
    config.values.PRIVACY_SERVICE_KEY ?? randomBytes(32).toString('hex');
  if (
    config.values.PRIVACY_SERVICE_KEY &&
    config.values.PRIVACY_SERVICE_KEY !== privacyKeys[service]
  )
    throw new Error(`Privacy key mismatch in ${service}.`);
  config.text = set(config.text, 'PRIVACY_SERVICE_KEY', privacyKeys[service]!);
}

auth.text = set(
  auth.text,
  'PRIVACY_SERVICE_KEYS',
  `'${JSON.stringify(privacyKeys)}'`,
);
for (const config of configurations.values()) {
  let text = config.text.replace(/^SERVICE_BUS_KEY=.*\r?\n/gm, '');
  text = set(text, 'SERVICE_BUS_KEYS', `'${JSON.stringify(config.keys)}'`);
  text = set(
    text,
    'KAFKA_BROKERS',
    config.values.KAFKA_BROKERS ?? '127.0.0.1:9092',
  );
  await writeFile(config.path, text, { mode: 0o600 });
}
console.info('Service bus keys configured. Existing keys were preserved.');
