/**
 * Token Storage Utility
 *
 * Stores OAuth tokens securely using encrypted file storage (~/.octocode/credentials.json).
 * Uses AES-256-GCM encryption with a random key stored in ~/.octocode/.key.
 *
 * This provides a pure JavaScript solution that works across all environments
 * (CI, containers, SSH, desktop) without native dependencies.
 *
 * This file orchestrates credential management by delegating to focused modules:
 * - credentialCache.ts: In-memory cache management
 * - credentialEncryption.ts: Encryption/decryption and file I/O
 * - tokenRefresh.ts: OAuth token refresh logic
 * - tokenResolution.ts: Token resolution with priority chain
 * - credentialUtils.ts: Shared utility functions
 */

import type {
  StoredCredentials,
  StoreResult,
  DeleteResult,
  TokenSource,
} from './types.js';
import { createLogger } from '../logger/index.js';

// Import from focused modules
import {
  invalidateCredentialsCache,
  _getCacheStats,
  _resetCredentialsCache,
  getCachedCredentials,
  setCachedCredentials,
} from './credentialCache.js';
import {
  OCTOCODE_DIR,
  CREDENTIALS_FILE,
  KEY_FILE,
  encrypt,
  decrypt,
  ensureOctocodeDir,
  cleanupKeyFile,
  readCredentialsStore,
  writeCredentialsStore,
} from './credentialEncryption.js';
import {
  refreshAuthToken,
  type RefreshResult,
  getTokenWithRefresh,
  type TokenWithRefreshResult,
} from './tokenRefresh.js';
import {
  resolveToken,
  type ResolvedToken,
  resolveTokenWithRefresh,
  type ResolvedTokenWithRefresh,
  resolveTokenFull,
  type FullTokenResolution,
  type GhCliTokenGetter,
} from './tokenResolution.js';
import {
  normalizeHostname,
  isTokenExpired,
  isRefreshTokenExpired,
} from './credentialUtils.js';

const logger = createLogger('token-storage');

// ============================================================================
// ENVIRONMENT VARIABLE SUPPORT
// ============================================================================

/**
 * Environment variable names for token lookup (in priority order)
 */
export const ENV_TOKEN_VARS = [
  'OCTOCODE_TOKEN', // octocode-specific (highest priority)
  'GH_TOKEN', // gh CLI compatible
  'GITHUB_TOKEN', // GitHub Actions native
] as const;

/**
 * Get token from environment variables
 *
 * Checks environment variables in priority order:
 * 1. OCTOCODE_TOKEN - octocode-specific token
 * 2. GH_TOKEN - GitHub CLI compatible
 * 3. GITHUB_TOKEN - GitHub Actions native
 *
 * @returns Token string or null if not found in any env var
 */
export function getTokenFromEnv(): string | null {
  for (const envVar of ENV_TOKEN_VARS) {
    const token = process.env[envVar];
    if (token && token.trim()) {
      return token.trim();
    }
  }
  return null;
}

/**
 * Get the source of an environment variable token
 *
 * @returns The env var name that contains the token, or null if none found
 */
export function getEnvTokenSource(): TokenSource {
  for (const envVar of ENV_TOKEN_VARS) {
    const token = process.env[envVar];
    if (token && token.trim()) {
      return `env:${envVar}` as TokenSource;
    }
  }
  return null;
}

/**
 * Check if token is available from environment variables
 */
export function hasEnvToken(): boolean {
  return getTokenFromEnv() !== null;
}

// ============================================================================
// PUBLIC API - CRUD OPERATIONS
// ============================================================================

/**
 * Store credentials using encrypted file storage
 *
 * @returns StoreResult with success status
 */
export async function storeCredentials(
  credentials: StoredCredentials
): Promise<StoreResult> {
  const hostname = normalizeHostname(credentials.hostname);
  const normalizedCredentials: StoredCredentials = {
    ...credentials,
    hostname,
    updatedAt: new Date().toISOString(),
  };

  try {
    const store = readCredentialsStore();
    store.credentials[hostname] = normalizedCredentials;
    writeCredentialsStore(store);

    // Invalidate cache for this hostname
    invalidateCredentialsCache(hostname);

    return { success: true };
  } catch (fileError) {
    const errorMsg =
      fileError instanceof Error ? fileError.message : String(fileError);
    logger.error('CRITICAL: Storage failed', {
      error: errorMsg
        .replace(
          /\b(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/g,
          '***MASKED***'
        )
        .replace(/\b[a-zA-Z0-9]{40,}\b/g, '***MASKED***'),
    });
    throw new Error('Failed to store credentials');
  }
}

/**
 * Options for getCredentials
 */
export interface GetCredentialsOptions {
  /** Bypass cache and fetch fresh credentials from storage */
  bypassCache?: boolean;
}

/**
 * Get credentials from encrypted file storage
 *
 * Flow:
 * 1. Check in-memory cache (unless bypassed)
 * 2. Read from file storage
 * 3. Cache result for future calls
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @param options - Optional settings (e.g., bypassCache)
 * @returns Stored credentials or null if not found
 */
export async function getCredentials(
  hostname: string = 'github.com',
  options?: GetCredentialsOptions
): Promise<StoredCredentials | null> {
  const normalizedHostname = normalizeHostname(hostname);

  // 1. Check cache first (unless bypassed)
  if (!options?.bypassCache) {
    const cached = getCachedCredentials(normalizedHostname);
    if (cached) {
      return cached;
    }
  }

  // 2. Fetch from file storage
  const store = readCredentialsStore();
  const credentials = store.credentials[normalizedHostname] || null;

  // 3. Update cache (even if null - we cache the absence)
  setCachedCredentials(normalizedHostname, credentials);

  return credentials;
}

/**
 * Get credentials synchronously (file storage only)
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns Stored credentials from file or null if not found
 */
export function getCredentialsSync(
  hostname: string = 'github.com'
): StoredCredentials | null {
  const normalizedHostname = normalizeHostname(hostname);
  const store = readCredentialsStore();
  return store.credentials[normalizedHostname] || null;
}

/**
 * Delete credentials from file storage
 *
 * @returns DeleteResult with details about what was deleted
 */
export async function deleteCredentials(
  hostname: string = 'github.com'
): Promise<DeleteResult> {
  const normalizedHostname = normalizeHostname(hostname);
  let deletedFromFile = false;

  // Delete from file storage
  const store = readCredentialsStore();
  if (store.credentials[normalizedHostname]) {
    delete store.credentials[normalizedHostname];

    // Clean up files if no more credentials remain
    if (Object.keys(store.credentials).length === 0) {
      cleanupKeyFile();
    } else {
      writeCredentialsStore(store);
    }
    deletedFromFile = true;
  }

  // Invalidate cache for this hostname
  invalidateCredentialsCache(normalizedHostname);

  return {
    success: deletedFromFile,
    deletedFromFile,
  };
}

/**
 * List all stored hostnames from file storage
 */
export async function listStoredHosts(): Promise<string[]> {
  const store = readCredentialsStore();
  return Object.keys(store.credentials);
}

/**
 * List stored hosts synchronously (file storage only)
 */
export function listStoredHostsSync(): string[] {
  const store = readCredentialsStore();
  return Object.keys(store.credentials);
}

/**
 * Check if credentials exist for a hostname
 */
export async function hasCredentials(
  hostname: string = 'github.com'
): Promise<boolean> {
  return (await getCredentials(hostname)) !== null;
}

/**
 * Check if credentials exist synchronously (file storage only)
 */
export function hasCredentialsSync(hostname: string = 'github.com'): boolean {
  return getCredentialsSync(hostname) !== null;
}

/**
 * Update token for a hostname (used for refresh)
 */
export async function updateToken(
  hostname: string,
  token: StoredCredentials['token']
): Promise<boolean> {
  const credentials = await getCredentials(hostname);

  if (!credentials) {
    return false;
  }

  credentials.token = token;
  credentials.updatedAt = new Date().toISOString();
  await storeCredentials(credentials);

  return true;
}

/**
 * Get the credentials storage location (for display purposes)
 */
export function getCredentialsFilePath(): string {
  return CREDENTIALS_FILE;
}

/**
 * Get token from stored credentials (file only)
 *
 * Convenience function that retrieves credentials and returns just the token string.
 * Checks for token expiration before returning.
 *
 * NOTE: This does NOT check environment variables. Use resolveToken() for full resolution.
 * NOTE: This does NOT refresh expired tokens. Use getTokenWithRefresh() for auto-refresh.
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns Token string or null if not found/expired
 */
export async function getToken(
  hostname: string = 'github.com'
): Promise<string | null> {
  const credentials = await getCredentials(hostname);

  if (!credentials || !credentials.token) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(credentials)) {
    return null; // Let caller handle re-auth or use getTokenWithRefresh()
  }

  return credentials.token.token;
}

/**
 * Get token synchronously (file storage only)
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns Token string or null if not found/expired
 */
export function getTokenSync(hostname: string = 'github.com'): string | null {
  const credentials = getCredentialsSync(hostname);

  if (!credentials || !credentials.token) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(credentials)) {
    return null;
  }

  return credentials.token.token;
}

// ============================================================================
// RE-EXPORTS FROM FOCUSED MODULES
// ============================================================================

// Cache management
export { invalidateCredentialsCache, _getCacheStats, _resetCredentialsCache };

// Encryption and file I/O
export {
  encrypt,
  decrypt,
  ensureOctocodeDir,
  readCredentialsStore,
  writeCredentialsStore,
  OCTOCODE_DIR,
  CREDENTIALS_FILE,
  KEY_FILE,
};

// Token refresh
export {
  refreshAuthToken,
  getTokenWithRefresh,
  type RefreshResult,
  type TokenWithRefreshResult,
};

// Token resolution
export {
  resolveToken,
  resolveTokenWithRefresh,
  resolveTokenFull,
  type ResolvedToken,
  type ResolvedTokenWithRefresh,
  type FullTokenResolution,
  type GhCliTokenGetter,
};

// Utility functions
export { isTokenExpired, isRefreshTokenExpired };
