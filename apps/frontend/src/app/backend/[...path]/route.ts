import { NextRequest, NextResponse } from 'next/server';

const allowedPrefixes = ['auth', 'api'];

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path.length || !allowedPrefixes.includes(path[0])) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: 'Route not found.', details: [] },
      { status: 404 },
    );
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    const browserOrigin = request.headers.get('origin');
    const host = request.headers.get('host');
    const requestOrigin = host
      ? `${request.nextUrl.protocol}//${host}`
      : request.nextUrl.origin;
    if (browserOrigin !== requestOrigin) {
      return NextResponse.json(
        {
          code: 'INVALID_ORIGIN',
          message: 'Request origin does not match this site.',
          details: [],
        },
        { status: 403 },
      );
    }
  }

  const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8000';
  const trustedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target = new URL(
    `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    gatewayUrl,
  );
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('origin', trustedOrigin);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'location', 'x-request-id']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append('set-cookie', cookie);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        code: 'GATEWAY_UNAVAILABLE',
        message: 'The API is temporarily unavailable.',
        details: [],
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
