import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Router, type Response } from 'express';

const swaggerDirectory = (
  createRequire(import.meta.url)(
    'swagger-ui-dist/absolute-path.js',
  ) as () => string
)();
const assets = ['swagger-ui.css', 'swagger-ui-bundle.js'];

// Relative links work both at /api/docs and behind /backend.
const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Event Sharing API</title>
    <link rel="stylesheet" href="docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="docs/assets/swagger-ui-bundle.js"></script>
    <script src="docs/init.js"></script>
  </body>
</html>
`;
const init = `window.ui = SwaggerUIBundle({
  url: 'openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  withCredentials: true,
});
`;

// Swagger UI sets inline styles, but runs no inline scripts.
const policy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export function docsRoutes(specPath: URL): Router {
  const spec = readFileSync(specPath, 'utf8');
  const router = Router();
  const send = (response: Response, type: string, body: string) =>
    response
      .set({
        'content-type': type,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      })
      .send(body);
  router.get('/openapi.json', (_request, response) =>
    send(response, 'application/json; charset=utf-8', spec),
  );
  router.get('/docs', (_request, response) => {
    response.set('content-security-policy', policy);
    send(response, 'text/html; charset=utf-8', page);
  });
  router.get('/docs/init.js', (_request, response) =>
    send(response, 'text/javascript; charset=utf-8', init),
  );
  router.get('/docs/assets/:file', (request, response, next) => {
    const file = String(request.params.file);
    if (!assets.includes(file)) return next();
    response.set('cache-control', 'public, max-age=86400');
    // The root keeps the .pnpm folder out of the dotfile check.
    response.sendFile(file, { root: swaggerDirectory });
  });
  return router;
}
