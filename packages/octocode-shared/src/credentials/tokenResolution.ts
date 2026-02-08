/**
 * Token Resolution
 *
 * Token resolution logic with priority chain (env vars → storage → gh CLI).
 */

import type { TokenSource } from './types.js';
import { getTokenFromEnv, getEnvTokenSource } from './storage.js';
import { getToken } from './storage.js';
import { getTokenWithRefresh } from './tokenRefresh.js';

// Default OAuth client ID for octocode (same as CLI)
const DEFAULT_CLIENT_ID = '178c6fc778ccc68e1d6a';
const DEFAULT_HOSTNAME = 'github.com';

/**
 * Token resolution result with source tracking
 */
export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

/**
 * Resolve token using the full priority chain
 *
 * Priority order:
 * 1. OCTOCODE_TOKEN env var
 * 2. GH_TOKEN env var
 * 3. GITHUB_TOKEN env var
 * 4. Encrypted file storage (~/.octocode/credentials.json)
 *
 * NOTE: This does NOT refresh expired tokens. Use resolveTokenWithRefresh() for auto-refresh.
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns ResolvedToken with token and source, or null if not found
 */
export async function resolveToken(
  hostname: string = 'github.com'
): Promise<ResolvedToken | null> {
  // Priority 1-3: Environment variables
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
    };
  }

  // Priority 4: Stored credentials (file)
  const storedToken = await getToken(hostname);
  if (storedToken) {
    return {
      token: storedToken,
      source: 'file',
    };
  }

  return null;
}

/**
 * Extended resolved token result with refresh support
 */
export interface ResolvedTokenWithRefresh extends ResolvedToken {
  /** Whether the token was refreshed during resolution */
  wasRefreshed?: boolean;
  /** Username associated with the token (if from storage) */
  username?: string;
  /** Error message if refresh was attempted but failed */
  refreshError?: string;
}

/**
 * Resolve token with automatic refresh for expired tokens
 *
 * This is the recommended function for token resolution. It will:
 * 1. Check environment variables first (OCTOCODE_TOKEN, GH_TOKEN, GITHUB_TOKEN)
 * 2. Check stored credentials (file)
 * 3. If stored token is expired and has a refresh token, attempt to refresh
 * 4. Return the valid token with source information
 *
 * Priority order:
 * 1. OCTOCODE_TOKEN env var
 * 2. GH_TOKEN env var
 * 3. GITHUB_TOKEN env var
 * 4. Stored credentials with auto-refresh (file)
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @param clientId - OAuth client ID for refresh (default: octocode client ID)
 * @returns ResolvedTokenWithRefresh with token, source, and refresh status
 */
export async function resolveTokenWithRefresh(
  hostname: string = DEFAULT_HOSTNAME,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<ResolvedTokenWithRefresh | null> {
  // Priority 1-3: Environment variables (no refresh needed)
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
      wasRefreshed: false,
    };
  }

  // Priority 4: Stored credentials with refresh (file)
  const result = await getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    return {
      token: result.token,
      source: 'file',
      wasRefreshed: result.source === 'refreshed',
      username: result.username,
    };
  }

  // No token found, but we might have a refresh error to report
  if (result.refreshError) {
    return {
      token: '',
      source: null,
      wasRefreshed: false,
      refreshError: result.refreshError,
    } as ResolvedTokenWithRefresh;
  }

  return null;
}

/**
 * Full token resolution result including gh CLI fallback
 */
export interface FullTokenResolution {
  /** The resolved token */
  token: string;
  /** Source of the token */
  source: TokenSource | 'gh-cli';
  /** Whether the token was refreshed during resolution */
  wasRefreshed?: boolean;
  /** Username associated with the token (if from storage) */
  username?: string;
  /** Error message if refresh was attempted but failed */
  refreshError?: string;
}

/**
 * Callback type for getting gh CLI token
 */
export type GhCliTokenGetter = (
  hostname?: string
) => string | null | Promise<string | null>;

/**
 * Full token resolution with gh CLI fallback
 *
 * This is the recommended function for complete token resolution across all sources.
 * Uses in-memory cache (5-minute TTL) for performance, with automatic invalidation
 * on credential updates/refresh.
 *
 * Priority order:
 * 1. OCTOCODE_TOKEN env var
 * 2. GH_TOKEN env var
 * 3. GITHUB_TOKEN env var
 * 4. Octocode storage with auto-refresh (file, cached)
 * 5. gh CLI token (fallback via callback)
 *
 * @param options - Resolution options
 * @param options.hostname - GitHub hostname (default: 'github.com')
 * @param options.clientId - OAuth client ID for refresh (default: octocode client ID)
 * @param options.getGhCliToken - Callback to get gh CLI token (optional)
 * @returns FullTokenResolution with token, source, and metadata, or null if not found
 */
export async function resolveTokenFull(options?: {
  hostname?: string;
  clientId?: string;
  getGhCliToken?: GhCliTokenGetter;
}): Promise<FullTokenResolution | null> {
  const hostname = options?.hostname ?? DEFAULT_HOSTNAME;
  const clientId = options?.clientId ?? DEFAULT_CLIENT_ID;
  const getGhCliToken = options?.getGhCliToken;

  // Priority 1-3: Check environment variables first (highest priority, no I/O)
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
      wasRefreshed: false,
    };
  }

  // Priority 4: Resolve from storage (uses in-memory cache)
  const result = await getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    return {
      token: result.token,
      source: 'file',
      wasRefreshed: result.source === 'refreshed',
      username: result.username,
    };
  }

  // Capture refresh error if any
  const refreshError = result.refreshError;

  // Priority 5: gh CLI token (fallback)
  if (getGhCliToken) {
    try {
      const ghToken = await Promise.resolve(getGhCliToken(hostname));
      if (ghToken?.trim()) {
        return {
          token: ghToken.trim(),
          source: 'gh-cli',
          wasRefreshed: false,
          refreshError, // Include any refresh error from step 4
        };
      }
    } catch {
      // gh CLI failed, continue to return null
    }
  }

  // No token found
  if (refreshError) {
    return {
      token: '',
      source: null,
      wasRefreshed: false,
      refreshError,
    } as FullTokenResolution;
  }

  return null;
}
