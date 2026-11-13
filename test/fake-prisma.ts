import { vi, type Mock } from 'vitest';

type Model = Record<string, Mock>;
export type FakePrisma = Record<string, any> & {
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
  reset: () => void;
};

// Any model method is a mock, created on first use.
export function createFakePrisma(): FakePrisma {
  let models = new Map<string, Model>();
  const model = (name: string): Model => {
    let entry = models.get(name);
    if (!entry) {
      const methods = new Map<string, Mock>();
      entry = new Proxy({} as Model, {
        get(_target, method: string) {
          if (!methods.has(method)) methods.set(method, vi.fn());
          return methods.get(method);
        },
      });
      models.set(name, entry);
    }
    return entry;
  };
  const fixed: Record<string, Mock> = {};
  const root: FakePrisma = new Proxy({} as FakePrisma, {
    get(_target, name: string) {
      if (name === 'reset')
        return () => {
          models = new Map();
          for (const key of Object.keys(fixed)) delete fixed[key];
        };
      if (name === 'then') return undefined;
      if (name.startsWith('$')) {
        fixed[name] ??= defaultRaw(name, () => root);
        return fixed[name];
      }
      return model(name);
    },
  });
  return root;
}

function defaultRaw(name: string, root: () => FakePrisma): Mock {
  if (name === '$transaction')
    return vi.fn(async (work: unknown) =>
      typeof work === 'function'
        ? work(root())
        : Promise.all(work as Promise<unknown>[]),
    );
  if (name === '$queryRaw' || name === '$queryRawUnsafe')
    return vi.fn(async () => []);
  if (name === '$executeRaw' || name === '$executeRawUnsafe')
    return vi.fn(async () => 0);
  return vi.fn(async () => undefined);
}

// Joins a Prisma.sql fragment into text for assertions.
export function sqlText(query: { sql?: string; strings?: string[] }): string {
  return (query.sql ?? query.strings?.join('?') ?? '').replace(/\s+/g, ' ');
}
