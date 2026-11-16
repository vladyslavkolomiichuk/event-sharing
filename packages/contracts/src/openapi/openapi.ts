import { z } from 'zod';
import { ApiErrorSchema } from '../common/api-error.schema.js';

export type ApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// Who may call an operation through Gateway.
export type ApiAccess =
  'public' | 'user' | 'organizer' | 'admin' | 'provider-signature';

export type ApiOperation = {
  method: ApiMethod;
  // Public Gateway path with {param} placeholders.
  path: string;
  tag: string;
  summary: string;
  access: ApiAccess;
  description?: string;
  query?: z.ZodObject;
  params?: Record<string, z.ZodType>;
  body?: z.ZodType;
  // Raw upload, for example an image, instead of JSON.
  bodyType?: string;
  status?: number;
  response?: z.ZodType;
  // Non-JSON success body, for example an image or a redirect.
  responseType?: string;
};

export type OpenApiInfo = {
  title: string;
  version: string;
  description: string;
};

type JsonSchema = Record<string, unknown>;

const SESSION_COOKIE = 'better-auth.session_token';

const accessNotes: Record<ApiAccess, string> = {
  public: 'No session needed.',
  user: 'Requires a signed-in user with a complete profile.',
  organizer: 'Requires the ORGANIZER or ADMIN role.',
  admin: 'Requires the ADMIN role.',
  'provider-signature':
    'Called by the payment provider; the body must carry a valid signature.',
};

// Builds an OpenAPI 3.1 document from Zod schemas.
export function buildOpenApiDocument(
  info: OpenApiInfo,
  operations: ApiOperation[],
  names: Map<z.ZodType, string>,
): JsonSchema {
  const components = new Components(names);
  const paths: Record<string, Record<string, JsonSchema>> = {};
  const sorted = [...operations].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method),
  );
  for (const operation of sorted) {
    const entry = (paths[operation.path] ??= {});
    if (entry[operation.method])
      throw new Error(`Duplicate ${operation.method} ${operation.path}.`);
    entry[operation.method] = describe(operation, components);
  }
  return {
    openapi: '3.1.0',
    info,
    servers: [
      { url: '/backend', description: 'Through the website' },
      { url: 'http://127.0.0.1:8000', description: 'Gateway in development' },
    ],
    tags: [...new Set(sorted.map((operation) => operation.tag))]
      .sort()
      .map((name) => ({ name })),
    paths,
    components: {
      schemas: components.schemas,
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: SESSION_COOKIE,
          description: `Better Auth session cookie. HTTPS sites prefix it with __Secure-.`,
        },
        providerSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'stripe-signature',
        },
      },
    },
  };
}

function describe(operation: ApiOperation, components: Components) {
  const status = String(operation.status ?? 200);
  const parameters = [
    ...pathParameters(operation),
    ...queryParameters(operation.query),
  ];
  const result: JsonSchema = {
    tags: [operation.tag],
    summary: operation.summary,
    description: [operation.description, accessNotes[operation.access]]
      .filter(Boolean)
      .join('\n\n'),
    operationId: operationId(operation),
    'x-access': operation.access,
  };
  if (parameters.length) result.parameters = parameters;
  if (operation.body)
    result.requestBody = {
      required: true,
      content: {
        'application/json': { schema: components.ref(operation.body, 'input') },
      },
    };
  if (operation.bodyType)
    result.requestBody = {
      required: true,
      content: {
        [operation.bodyType]: {
          schema: { type: 'string', contentMediaType: operation.bodyType },
        },
      },
    };
  result.responses = {
    [status]: success(operation, components),
    ...(operation.access === 'public' ||
    operation.access === 'provider-signature'
      ? {}
      : { 401: errorResponse('No valid session.', components) }),
    default: errorResponse('Error with a code and message.', components),
  };
  if (operation.access === 'provider-signature')
    result.security = [{ providerSignature: [] }];
  else if (operation.access !== 'public')
    result.security = [{ sessionCookie: [] }];
  return result;
}

function success(operation: ApiOperation, components: Components) {
  if (operation.responseType)
    return {
      description: 'Success.',
      content: { [operation.responseType]: { schema: { type: 'string' } } },
    };
  if (!operation.response) return { description: 'Success, no body.' };
  return {
    description: 'Success.',
    content: {
      'application/json': {
        schema: components.ref(operation.response, 'output'),
      },
    },
  };
}

function errorResponse(description: string, components: Components) {
  return {
    description,
    content: {
      'application/json': { schema: components.ref(ApiErrorSchema, 'output') },
    },
  };
}

function pathParameters(operation: ApiOperation) {
  return [...operation.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: operation.params?.[name!]
      ? toJson(operation.params[name!]!, 'input')
      : name!.endsWith('Id')
        ? { type: 'string', format: 'uuid' }
        : { type: 'string' },
  }));
}

function queryParameters(query: z.ZodObject | undefined) {
  if (!query) return [];
  const schema = toJson(query, 'input');
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

function operationId(operation: ApiOperation): string {
  const words = operation.path
    .split('/')
    .filter((part) => part && part !== 'api')
    .map((part) =>
      part.replace(/[{}]/g, '').replace(/^\w/, (c) => c.toUpperCase()),
    )
    .map((part) => part.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()));
  return `${operation.method}${words.join('')}`;
}

function toJson(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  return withoutFormatPatterns(json) as JsonSchema;
}

// A format already says it; its regex only spoils generated examples.
function withoutFormatPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFormatPatterns);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).filter(
    ([key]) => !(key === 'pattern' && 'format' in value),
  );
  return Object.fromEntries(
    entries.map(([key, item]) => [key, withoutFormatPatterns(item)]),
  );
}

// Named schemas become shared components; others stay inline.
class Components {
  readonly schemas: Record<string, JsonSchema> = {};
  private readonly owners = new Map<string, z.ZodType>();

  constructor(private readonly names: Map<z.ZodType, string>) {}

  // The output form keeps the name; a different input form gets "Input".
  ref(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
    const base = this.names.get(schema);
    if (!base) return toJson(schema, io);
    const owner = this.owners.get(base);
    if (owner && owner !== schema)
      throw new Error(`Two different schemas are named ${base}.`);
    this.owners.set(base, schema);
    const output = toJson(schema, 'output');
    const input = toJson(schema, 'input');
    const same = JSON.stringify(output) === JSON.stringify(input);
    const name = io === 'output' || same ? base : `${base}Input`;
    this.schemas[name] = io === 'output' || same ? output : input;
    return { $ref: `#/components/schemas/${name}` };
  }
}

// Names every exported XxxSchema of a module as Xxx.
export function schemaNames(
  ...modules: Record<string, unknown>[]
): Map<z.ZodType, string> {
  const names = new Map<z.ZodType, string>();
  for (const module of modules)
    for (const [key, value] of Object.entries(module))
      if (
        key.endsWith('Schema') &&
        value instanceof z.ZodType &&
        !names.has(value)
      )
        names.set(value, key.slice(0, -'Schema'.length));
  return names;
}
