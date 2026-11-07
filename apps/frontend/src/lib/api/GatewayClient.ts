export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class GatewayClient {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/backend${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      credentials: 'include',
      cache: 'no-store',
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === 'AbortError')
        throw cause;
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Could not reach the server. Check your connection and try again.',
      );
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && path.startsWith('/api/'))
        window.dispatchEvent(new Event('auth:expired'));
      const error = body as { code?: string; message?: string } | null;
      throw new ApiError(
        response.status,
        error?.code ?? 'REQUEST_FAILED',
        error?.message ??
          (response.status >= 500
            ? 'The service is unavailable right now. Try again soon.'
            : 'The request could not be completed.'),
      );
    }
    return body as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, data: unknown = {}): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  patch<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const gateway = new GatewayClient();
