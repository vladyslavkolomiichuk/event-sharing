import type { Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { sendProxyError } from './proxy-error.js';

export class ServiceProxy {
  constructor(
    private readonly baseUrl: string,
    private readonly path: string,
    private readonly serviceName: string,
    private readonly timeout = 35000,
  ) {}

  create(): RequestHandler {
    return createProxyMiddleware<Request, Response>({
      target: `${this.baseUrl.replace(/\/+$/, '')}${this.path}`,
      changeOrigin: true,
      proxyTimeout: this.timeout,
      on: {
        proxyReq: (proxyRequest, request) => {
          proxyRequest.removeHeader('cookie');
          proxyRequest.removeHeader('authorization');
          proxyRequest.removeHeader('x-internal-user-jwt');
          proxyRequest.removeHeader('x-user-id');
          proxyRequest.removeHeader('x-user-role');
          proxyRequest.setHeader('x-request-id', request.requestId ?? '');

          if (request.internalUserJwt) {
            proxyRequest.setHeader(
              'authorization',
              `Bearer ${request.internalUserJwt}`,
            );
          }
        },
        error: (_error, _request, response) => {
          sendProxyError(
            response,
            'UPSTREAM_UNAVAILABLE',
            `${this.serviceName} service is unavailable.`,
          );
        },
      },
    });
  }
}
