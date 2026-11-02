import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export function loadServiceEnvFile(moduleUrl: string): Record<string, string> {
  const path = fileURLToPath(new URL('../../.env', moduleUrl));
  return existsSync(path) ? parse(readFileSync(path)) : {};
}
