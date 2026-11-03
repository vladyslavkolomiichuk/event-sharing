import type { Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { sendProxyError } from './proxy-error.js';

export function createAuthProxy(baseUrl: string): RequestHandler {
  return createProxyMiddleware<Request, Response>({
    target: `${baseUrl.replace(/\/+$/, '')}/backend/auth`,
    changeOrigin: true,
    proxyTimeout: 5000,
    on: {
      proxyReq: (proxyRequest, request) => {
        proxyRequest.removeHeader('authorization');
        proxyRequest.removeHeader('x-internal-user-jwt');
        proxyRequest.setHeader('x-request-id', request.requestId ?? '');
      },
      proxyRes: (proxyResponse) => {
        delete proxyResponse.headers['set-auth-jwt'];
      },
      error: (_error, _request, response) => {
        sendProxyError(
          response,
          'AUTH_SERVICE_UNAVAILABLE',
          'Authentication service is unavailable.',
        );
      },
    },
  });
}
