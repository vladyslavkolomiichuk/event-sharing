// Runs named experiments on the isolated stack, then removes that stack.
import { run as delivery } from './experiments/exp-01-delivery.js';
import { run as failures } from './experiments/exp-02-failures.js';
import { run as geoSearch } from './experiments/exp-03-geo-search.js';
import { run as consistency } from './experiments/exp-04-consistency.js';
import { destroyStack } from './lib/stack.js';

const EXPERIMENTS: Record<string, () => Promise<void>> = {
  'exp-01': delivery,
  'exp-02': failures,
  'exp-03': geoSearch,
  'exp-04': consistency,
};

const requested = process.argv.slice(2).filter((name) => name !== '--');
const names = requested.length > 0 ? requested : Object.keys(EXPERIMENTS);

try {
  for (const name of names) {
    const experiment = EXPERIMENTS[name];
    if (!experiment) throw new Error(`Unknown experiment ${name}.`);
    const startedAt = Date.now();
    console.info(`Starting ${name}.`);
    await experiment();
    console.info(
      `Finished ${name} in ${Math.round((Date.now() - startedAt) / 1000)} s.`,
    );
  }
} finally {
  destroyStack();
}
