import { NextRequest, NextResponse } from 'next/server';

const allowedPrefixes = ['auth', 'api'];
const maxStorageUploadBytes = 5 * 1024 * 1024;

async function readStorageUpload(
  request: NextRequest,
): Promise<ArrayBuffer | null> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxStorageUploadBytes) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxStorageUploadBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body.buffer;
}

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

  const trustedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:3001';
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== trustedOrigin
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_ORIGIN',
        message: 'Request origin does not match this site.',
        details: [],
      },
      { status: 403 },
    );
  }

  const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8000';
  const target = new URL(
    `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    gatewayUrl,
  );
  const headers = new Headers();
  for (const name of [
    'accept',
    'content-type',
    'cookie',
    'x-request-id',
    'x-forwarded-for',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('origin', trustedOrigin);

  try {
    const storageUpload =
      path[0] === 'api' &&
      path[1] === 'storage' &&
      ['POST', 'PUT'].includes(request.method);
    const body = storageUpload ? await readStorageUpload(request) : undefined;
    if (storageUpload && !body)
      return NextResponse.json(
        {
          code: 'FILE_TOO_LARGE',
          message: 'The file is too large.',
          details: [],
        },
        { status: 413 },
      );
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : storageUpload
            ? body
            : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
    const responseHeaders = new Headers();
    for (const name of [
      'content-type',
      'location',
      'x-request-id',
      'cache-control',
      'content-disposition',
      'x-content-type-options',
      'content-security-policy',
      'cross-origin-resource-policy',
    ]) {
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
