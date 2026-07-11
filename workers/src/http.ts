import type { ApiError } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonResponse<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({
    status: 'ok',
    data,
    server_time: new Date().toISOString()
  }), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...(init.headers || {})
    }
  });
}

export function errorResponse(status: number, error: ApiError): Response {
  return new Response(JSON.stringify({
    status: 'error',
    error,
    server_time: new Date().toISOString()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
  }
}

export function handleError(error: unknown): Response {
  if (error instanceof HttpError) {
    return errorResponse(error.status, {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    });
  }
  return errorResponse(500, {
    code: 'internal_error',
    message: 'Unexpected server error',
    retryable: true
  });
}
