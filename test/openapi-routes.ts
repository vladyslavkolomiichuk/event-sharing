import { METHODS } from 'node:http';
import type { ApiOperation } from '@event-sharing/contracts';

type Route = {
  path: string;
  methods: Record<string, boolean>;
  _handlesMethod(method: string): boolean;
};
type Layer = {
  route?: Route;
  path?: string;
  handle: { stack?: Layer[] };
  match(path: string): boolean;
};

const samples: Record<string, string> = {
  username: 'iryna_melnyk',
  token: 'sample-token',
  slot: 'cover',
};

// Compares documented operations with the routes an app serves.
export function compareRoutes(
  app: unknown,
  operations: ApiOperation[],
  options: { rewrite?: (path: string) => string; ignore?: string[] } = {},
): { missing: string[]; undocumented: string[] } {
  const stack = (app as { router: { stack: Layer[] } }).router.stack;
  const covered = new Map<Route, Set<string>>();
  const missing: string[] = [];
  for (const operation of operations) {
    const sample = operation.path.replace(/\{(\w+)\}/g, (_, name: string) =>
      name.endsWith('Id')
        ? '7d4f6c2a-1b3e-4f5a-9c8d-0e1f2a3b4c5d'
        : (samples[name] ?? 'sample'),
    );
    const path = options.rewrite ? options.rewrite(sample) : sample;
    const route = resolve(stack, operation.method, path);
    if (!route) missing.push(`${operation.method} ${operation.path}`);
    else {
      const methods = covered.get(route) ?? new Set<string>();
      methods.add(catchAll(route) ? '*' : operation.method);
      covered.set(route, methods);
    }
  }
  const undocumented = routes(stack)
    .filter((route) => !(options.ignore ?? []).includes(route.path))
    .flatMap((route) =>
      Object.keys(route.methods)
        .filter((method) => !covered.get(route)?.has(method))
        .filter(() => !(catchAll(route) && covered.get(route)?.has('*')))
        .map((method) => `${method} ${route.path}`),
    );
  return { missing, undocumented };
}

// Finds the route that would answer a request, like Express does.
function resolve(
  stack: Layer[],
  method: string,
  path: string,
): Route | undefined {
  for (const layer of stack) {
    if (!layer.match(path)) continue;
    if (layer.route) {
      if (layer.route._handlesMethod(method)) return layer.route;
      continue;
    }
    if (layer.handle.stack) {
      const rest = path.slice(layer.path?.length ?? 0) || '/';
      const found = resolve(layer.handle.stack, method, rest);
      if (found) return found;
    }
  }
  return undefined;
}

function routes(stack: Layer[]): Route[] {
  return stack.flatMap((layer) =>
    layer.route
      ? [layer.route]
      : layer.handle.stack
        ? routes(layer.handle.stack)
        : [],
  );
}

// app.all() routes list every method; one documented call covers them.
const catchAll = (route: Route) =>
  METHODS.every((method) => route.methods[method.toLowerCase()]);
