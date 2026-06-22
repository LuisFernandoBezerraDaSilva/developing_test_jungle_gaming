import { env } from '@/config/env';
import { authService } from './auth.service';
import type { ApiError } from '@/types/contract';

/**
 * Cliente HTTP base (camada Service). Centraliza:
 * - baseUrl (Kong),
 * - injeção do header Authorization (Bearer) quando autenticado,
 * - parsing do envelope de erro padronizado (§0).
 *
 * Importante: corpos com valores monetários chegam como `string`; usamos o
 * texto cru + JSON.parse padrão (que mantém strings como strings), nunca
 * coerção para number.
 */

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(payload: ApiError) {
    super(payload.message);
    this.name = 'HttpError';
    this.statusCode = payload.statusCode;
    this.code = payload.error;
  }
}

type RequestOptions = {
  auth?: boolean;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\//, ''), `${env.apiBaseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth) {
    const token = await authService.getAccessToken();
    if (!token) {
      throw new HttpError({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Sessão expirada. Faça login novamente.',
      });
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const payload: ApiError =
      data && typeof data === 'object' && 'error' in data
        ? (data as ApiError)
        : {
            statusCode: response.status,
            error: 'UNKNOWN_ERROR',
            message: response.statusText || 'Erro inesperado',
          };
    throw new HttpError(payload);
  }

  return data as T;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
};
