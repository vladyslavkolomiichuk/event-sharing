import {
  SystemServicesResponseSchema,
  type ApiOperation,
} from '@event-sharing/contracts';

export const operations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/system/services',
    tag: 'System',
    summary: 'Readiness of every backend service',
    access: 'admin',
    response: SystemServicesResponseSchema,
  },
  {
    method: 'get',
    path: '/api/openapi.json',
    tag: 'System',
    summary: 'This OpenAPI document',
    access: 'public',
    responseType: 'application/json',
  },
  {
    method: 'get',
    path: '/api/docs',
    tag: 'System',
    summary: 'Interactive API documentation',
    access: 'public',
    responseType: 'text/html',
  },
  {
    method: 'get',
    path: '/api/docs/init.js',
    tag: 'System',
    summary: 'Script that starts the documentation page',
    access: 'public',
    responseType: 'text/javascript',
  },
  {
    method: 'get',
    path: '/api/docs/assets/{file}',
    tag: 'System',
    summary: 'Swagger UI files',
    access: 'public',
    responseType: 'text/plain',
  },
];
