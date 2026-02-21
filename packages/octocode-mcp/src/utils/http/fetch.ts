/**
 * Fetch with retry mechanism and exponential backoff
 */

import { version } from '../../../package.json';
import { FETCH_ERRORS } from '../../errorCodes.js';
import { logSessionError } from '../../session.js';

interface ExtendedError extends Error {
  status?: number;
  headers?: Headers;
  retryable?: boolean;
}

/** Maximum delay cap for exponential backoff (60 seconds) */
const MAX_BACKOFF_DELAY_MS = 60000;

interface FetchWithRetriesOptions {
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
   * Maximum delay in milliseconds for exponential backoff cap
   * @default 60000 (60 seconds)
   */
  maxDelayMs?: number;
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
  /**
   * AbortSignal for request cancellation (e.g., on shutdown)
   * When aborted, the function throws immediately without retrying
   */
  signal?: AbortSignal;
}

/**
 * Fetches a URL with automatic retries and exponential backoff.
 *
 * Retry behavior:
 * - Retries on network errors, server errors (5xx), request timeouts (408), and rate limits (429)
 * - Respects 'Retry-After' header for 429 responses
 * - Does NOT retry on client errors (4xx) except rate limits and timeouts
 * - Uses exponential backoff: 1s, 2s, 4s, etc. (capped at 60s default)
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
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = MAX_BACKOFF_DELAY_MS,
    headers = {},
    method = 'GET',
    includeVersion = false,
    signal,
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
    // Check if request was aborted before attempting
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    try {
      const res = await f(finalUrl, {
        method,
        headers: finalHeaders,
        signal,
      });

      if (!res.ok) {
        // Release the underlying TCP socket immediately.
        // An unconsumed body keeps the socket allocated until GC.
        res.body?.cancel?.().catch(() => {});

        logSessionError(
          'fetchWithRetries',
          FETCH_ERRORS.FETCH_HTTP_ERROR.code
        ).catch(() => {});
        const error = new Error(
          FETCH_ERRORS.FETCH_HTTP_ERROR.message(res.status, res.statusText)
        ) as ExtendedError;

        error.status = res.status;
        error.headers = res.headers;

        // Retry on rate limits (429), request timeouts (408), and server errors (5xx)
        const isRetryable =
          res.status === 429 ||
          res.status === 408 ||
          (res.status >= 500 && res.status < 600);
        error.retryable = isRetryable;

        throw error;
      }

      if (res.status === 204) {
        return null;
      }

      return await res.json();
    } catch (error: unknown) {
      const extendedError = error as ExtendedError;

      // Don't retry on abort - propagate immediately
      if (
        signal?.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new Error('Request aborted');
      }

      if (extendedError && extendedError.retryable === false) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff, capped at maxDelayMs
      let delayMs = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );

      // Add jitter to prevent thundering herd
      delayMs += Math.floor(Math.random() * initialDelayMs);

      // Respect Retry-After header if present (but still cap at maxDelayMs)
      if (
        extendedError &&
        extendedError.headers &&
        typeof extendedError.headers.get === 'function'
      ) {
        const retryAfter = extendedError.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) {
            delayMs = Math.min(seconds * 1000, maxDelayMs);
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
