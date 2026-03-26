/**
 * Token Resolution
 *
 * Token resolution logic with priority chain (env vars → storage → gh CLI).
 *
 * Uses dependency injection (initTokenResolution) to receive storage functions,
 * breaking the former circular dependency with storage.ts.
 */

import type { TokenSource } from './types.js';
import type { TokenWithRefreshResult } from './tokenRefresh.js';
import { getTokenFromEnv, getEnvTokenSource } from './envTokens.js';

const DEFAULT_CLIENT_ID = '178c6fc778ccc68e1d6a';
const DEFAULT_HOSTNAME = 'github.com';

/** Storage functions injected at init time by storage.ts. */
interface StorageDeps {
  getToken: (hostname: string) => Promise<string | null>;
  getTokenWithRefresh: (
    hostname?: string,
    clientId?: string
  ) => Promise<TokenWithRefreshResult>;
}

let _storage: StorageDeps | null = null;

/**
 * Initialize token resolution with storage dependencies.
 * Called once by storage.ts to break the circular import.
 */
export function initTokenResolution(deps: StorageDeps): void {
  _storage = deps;
}

function getStorage(): StorageDeps {
  if (!_storage) {
    throw new Error(
      'Token resolution not initialized. Call initTokenResolution() first.'
    );
  }
  return _storage;
}

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

export async function resolveToken(
  hostname: string = 'github.com'
): Promise<ResolvedToken | null> {
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
    };
  }

  const storedToken = await getStorage().getToken(hostname);
  if (storedToken) {
    return {
      token: storedToken,
      source: 'file',
    };
  }

  return null;
}

export interface ResolvedTokenWithRefresh extends ResolvedToken {
  wasRefreshed?: boolean;
  username?: string;
  refreshError?: string;
}

export async function resolveTokenWithRefresh(
  hostname: string = DEFAULT_HOSTNAME,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<ResolvedTokenWithRefresh | null> {
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
      wasRefreshed: false,
    };
  }

  const result = await getStorage().getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    return {
      token: result.token,
      source: 'file',
      wasRefreshed: result.source === 'refreshed',
      username: result.username,
    };
  }

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

export interface FullTokenResolution {
  token: string;
  source: TokenSource | 'gh-cli';
  wasRefreshed?: boolean;
  username?: string;
  refreshError?: string;
}

export type GhCliTokenGetter = (
  hostname?: string
) => string | null | Promise<string | null>;

export async function resolveTokenFull(options?: {
  hostname?: string;
  clientId?: string;
  getGhCliToken?: GhCliTokenGetter;
}): Promise<FullTokenResolution | null> {
  const hostname = options?.hostname ?? DEFAULT_HOSTNAME;
  const clientId = options?.clientId ?? DEFAULT_CLIENT_ID;
  const getGhCliToken = options?.getGhCliToken;

  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
      wasRefreshed: false,
    };
  }

  const result = await getStorage().getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    return {
      token: result.token,
      source: 'file',
      wasRefreshed: result.source === 'refreshed',
      username: result.username,
    };
  }

  const refreshError = result.refreshError;

  if (getGhCliToken) {
    try {
      const ghToken = await Promise.resolve(getGhCliToken(hostname));
      if (ghToken?.trim()) {
        return {
          token: ghToken.trim(),
          source: 'gh-cli',
          wasRefreshed: false,
          refreshError,
        };
      }
    } catch {
      // gh CLI failed, fall through
    }
  }

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
