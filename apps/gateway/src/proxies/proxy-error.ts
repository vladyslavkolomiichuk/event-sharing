import { ApiErrorSchema } from '@event-sharing/contracts';
import { ServerResponse } from 'node:http';

export function sendProxyError(
  response: ServerResponse | { destroy(): void },
  code: string,
  message: string,
): void {
  if (!(response instanceof ServerResponse) || response.headersSent) {
    response.destroy();
    return;
  }

  response.statusCode = 502;
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      ApiErrorSchema.parse({
        code,
        message,
        details: [],
      }),
    ),
  );
}
