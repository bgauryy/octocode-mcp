/**
 * Fetch with retry mechanism and exponential backoff
 */

import { version } from '../../package.json';
import { FETCH_ERRORS } from '../errorCodes.js';
import { logSessionError } from '../session.js';

interface ExtendedError extends Error {
  status?: number;
  headers?: Headers;
  retryable?: boolean;
}

export interface FetchWithRetriesOptions {
  /**
   * Maximum number of retry attempts (excluding the initial request)
   * @default 3
   */
  maxRetries?: number;
  /**
   * Initial delay in milliseconds for exponential backoff
   * @default 1000 (1 second)
   */
  initialDelayMs?: number;
  /**
   * Custom headers to include in the request
   */
  headers?: Record<string, string>;
  /**
   * HTTP method
   * @default 'GET'
   */
  method?: string;
  /**
   * Whether to include the package version as a query parameter
   * @default false
   */
  includeVersion?: boolean;
}

/**
 * Fetches a URL with automatic retries and exponential backoff.
 *
 * Retry behavior:
 * - Retries on network errors, server errors (5xx), and rate limits (429)
 * - Respects 'Retry-After' header for 429 responses
 * - Does NOT retry on client errors (4xx) except rate limits
 * - Uses exponential backoff: 1s, 2s, 4s (default) if no Retry-After header
 *
 * @param url - The URL to fetch
 * @param options - Configuration options for retries and request
 * @returns The JSON response (or null for 204 No Content)
 * @throws Error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const data = await fetchWithRetries('https://api.example.com/data', {
 *   maxRetries: 3,
 *   headers: { 'User-Agent': 'MyApp/1.0' }
 * });
 * ```
 */
export async function fetchWithRetries(
  url: string,
  options: FetchWithRetriesOptions = {}
): Promise<unknown> {
  const {
    maxRetries = 10,
    initialDelayMs = 1000,
    headers = {},
    method = 'GET',
    includeVersion = false,
  } = options;

  let finalUrl = url;
  if (includeVersion) {
    const separator = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${separator}version=${encodeURIComponent(version)}`;
  }

  const finalHeaders: Record<string, string> = {
    'User-Agent': `Octocode-MCP/${version}`,
    ...headers,
  };

  const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  if (!f) {
    logSessionError(
      'fetchWithRetries',
      FETCH_ERRORS.FETCH_NOT_AVAILABLE.code
    ).catch(() => {});
    throw new Error(FETCH_ERRORS.FETCH_NOT_AVAILABLE.message);
  }

  let lastError: Error | undefined;
  const maxAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await f(finalUrl, {
        method,
        headers: finalHeaders,
      });

      if (!res.ok) {
        logSessionError(
          'fetchWithRetries',
          FETCH_ERRORS.FETCH_HTTP_ERROR.code
        ).catch(() => {});
        const error = new Error(
          FETCH_ERRORS.FETCH_HTTP_ERROR.message(res.status, res.statusText)
        ) as ExtendedError;

        error.status = res.status;
        error.headers = res.headers;

        const isRetryable =
          res.status === 429 || (res.status >= 500 && res.status < 600);
        error.retryable = isRetryable;

        throw error;
      }

      if (res.status === 204) {
        return null;
      }

      return await res.json();
    } catch (error: unknown) {
      const extendedError = error as ExtendedError;

      if (extendedError && extendedError.retryable === false) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      let delayMs = initialDelayMs * Math.pow(2, attempt - 1);

      if (
        extendedError &&
        extendedError.headers &&
        typeof extendedError.headers.get === 'function'
      ) {
        const retryAfter = extendedError.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) {
            delayMs = seconds * 1000;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  await logSessionError(
    'fetchWithRetries',
    FETCH_ERRORS.FETCH_FAILED_AFTER_RETRIES.code
  );
  throw new Error(
    FETCH_ERRORS.FETCH_FAILED_AFTER_RETRIES.message(
      maxAttempts,
      lastError?.message || ''
    )
  );
}
