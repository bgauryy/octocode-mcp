/**
 * Token Storage Utility
 *
 * Stores OAuth tokens securely using encrypted file storage (~/.octocode/credentials.json).
 * Uses AES-256-GCM encryption with a random key stored in ~/.octocode/.key.
 *
 * This provides a pure JavaScript solution that works across all environments
 * (CI, containers, SSH, desktop) without native dependencies.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { refreshToken as octokitRefreshToken } from '@octokit/oauth-methods';
import { request } from '@octokit/request';
import type {
  StoredCredentials,
  StoreResult,
  DeleteResult,
  CredentialsStore,
  TokenSource,
  OAuthToken,
} from './types.js';
import { HOME } from '../platform/index.js';
import { CredentialsStoreSchema } from './schemas.js';

/**
 * Mask sensitive data in error messages to prevent token leakage in logs.
 * Matches common token patterns (GitHub tokens, OAuth tokens, etc.)
 */
function maskErrorMessage(message: string): string {
  // Mask GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
  // Mask generic long alphanumeric strings that look like tokens
  return message
    .replace(/\b(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/g, '***MASKED***')
    .replace(/\b[a-zA-Z0-9]{40,}\b/g, '***MASKED***');
}

// Default OAuth client ID for octocode (same as CLI)
const DEFAULT_CLIENT_ID = '178c6fc778ccc68e1d6a';
const DEFAULT_HOSTNAME = 'github.com';

// Storage constants for file storage
export const OCTOCODE_DIR = join(HOME, '.octocode');
export const CREDENTIALS_FILE = join(OCTOCODE_DIR, 'credentials.json');
export const KEY_FILE = join(OCTOCODE_DIR, '.key');

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// ============================================================================
// IN-MEMORY CREDENTIALS CACHE
// ============================================================================

/** Cache entry structure */
interface CachedCredentials {
  credentials: StoredCredentials;
  cachedAt: number;
}

/** In-memory credentials cache (per hostname) */
const credentialsCache = new Map<string, CachedCredentials>();

/** Cache TTL in milliseconds (5 minutes - matches token expiry buffer) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Check if cached credentials are still valid (not expired)
 */
function isCacheValid(hostname: string): boolean {
  const cached = credentialsCache.get(hostname);
  if (!cached) return false;

  const age = Date.now() - cached.cachedAt;
  if (age >= CACHE_TTL_MS) return false;

  // Don't serve expired tokens from cache
  return !isTokenExpired(cached.credentials);
}

/**
 * Invalidate cache for a hostname (call after credential changes)
 * @param hostname - Hostname to invalidate, or undefined to clear all
 */
export function invalidateCredentialsCache(hostname?: string): void {
  if (hostname) {
    credentialsCache.delete(normalizeHostname(hostname));
  } else {
    credentialsCache.clear();
  }
}

/**
 * Get cache statistics (for debugging/monitoring)
 * @internal
 */
export function _getCacheStats(): {
  size: number;
  entries: Array<{ hostname: string; age: number; valid: boolean }>;
} {
  const now = Date.now();
  return {
    size: credentialsCache.size,
    entries: Array.from(credentialsCache.entries()).map(
      ([hostname, entry]) => ({
        hostname,
        age: now - entry.cachedAt,
        valid: isCacheValid(hostname),
      })
    ),
  };
}

/**
 * Reset cache state (for testing)
 * @internal
 */
export function _resetCredentialsCache(): void {
  credentialsCache.clear();
}

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
// FILE-BASED ENCRYPTED STORAGE
// ============================================================================

/**
 * Get or create encryption key for file storage
 */
function getOrCreateKey(): Buffer {
  ensureOctocodeDir();

  if (existsSync(KEY_FILE)) {
    // Verify key file permissions are not too permissive (group/others should have no access)
    const mode = statSync(KEY_FILE).mode & 0o777;
    if (mode & 0o077) {
      chmodSync(KEY_FILE, 0o600);
    }
    return Buffer.from(readFileSync(KEY_FILE, 'utf8'), 'hex');
  }

  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

/**
 * Encrypt data for file storage
 */
export function encrypt(data: string): string {
  const key = getOrCreateKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt data from file storage
 */
export function decrypt(encryptedData: string): string {
  const key = getOrCreateKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Ensure .octocode directory exists with secure permissions (0o700)
 */
export function ensureOctocodeDir(): void {
  if (!existsSync(OCTOCODE_DIR)) {
    mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read credentials store from file
 */
export function readCredentialsStore(): CredentialsStore {
  ensureOctocodeDir();

  if (!existsSync(CREDENTIALS_FILE)) {
    return { version: 1, credentials: {} };
  }

  try {
    const encryptedContent = readFileSync(CREDENTIALS_FILE, 'utf8');
    const decrypted = decrypt(encryptedContent);
    const parsed = JSON.parse(decrypted);
    const result = CredentialsStoreSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        '\n  ⚠ Warning: Credentials file has invalid format. Starting fresh.'
      );
      console.error(`  File: ${CREDENTIALS_FILE}`);
      return { version: 1, credentials: {} };
    }
    return result.data;
  } catch (error) {
    // Credentials file is corrupted or key changed - warn user
    console.error(
      '\n  ⚠ Warning: Could not read credentials file. You may need to login again.'
    );
    console.error(`  File: ${CREDENTIALS_FILE}`);
    if (error instanceof Error && error.message) {
      // Mask potential sensitive data in error messages
      console.error(`  Reason: ${maskErrorMessage(error.message)}\n`);
    }
    return { version: 1, credentials: {} };
  }
}

/**
 * Write credentials store to file
 */
function writeCredentialsStore(store: CredentialsStore): void {
  ensureOctocodeDir();

  const encrypted = encrypt(JSON.stringify(store, null, 2));
  writeFileSync(CREDENTIALS_FILE, encrypted, { mode: 0o600 });
}

/**
 * Clean up key file and credentials file (best effort)
 */
function cleanupKeyFile(): void {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      unlinkSync(CREDENTIALS_FILE);
    }
    if (existsSync(KEY_FILE)) {
      unlinkSync(KEY_FILE);
    }
  } catch {
    // Best effort cleanup - ignore errors
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Normalize hostname (lowercase, no protocol)
 */
function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

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
    console.error(`[token-storage] CRITICAL: Storage failed!`);
    // Mask potential sensitive data in error messages
    const errorMsg =
      fileError instanceof Error ? fileError.message : String(fileError);
    console.error(`  Error: ${maskErrorMessage(errorMsg)}`);
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
  if (!options?.bypassCache && isCacheValid(normalizedHostname)) {
    return credentialsCache.get(normalizedHostname)!.credentials;
  }

  // 2. Fetch from file storage
  const store = readCredentialsStore();
  const credentials = store.credentials[normalizedHostname] || null;

  // 3. Update cache (even if null - we cache the absence)
  if (credentials) {
    credentialsCache.set(normalizedHostname, {
      credentials,
      cachedAt: Date.now(),
    });
  } else {
    // Remove stale cache entry if credentials no longer exist
    credentialsCache.delete(normalizedHostname);
  }

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
 * Check if token is expired (for GitHub Apps with expiring tokens)
 */
export function isTokenExpired(credentials: StoredCredentials): boolean {
  if (!credentials.token.expiresAt) {
    return false; // Non-expiring token
  }

  const expiresAt = new Date(credentials.token.expiresAt);

  // Handle invalid date strings - treat as expired for safety
  if (isNaN(expiresAt.getTime())) {
    return true;
  }

  const now = new Date();

  // Consider expired if less than 5 minutes remaining
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

/**
 * Check if refresh token is expired
 */
export function isRefreshTokenExpired(credentials: StoredCredentials): boolean {
  if (!credentials.token.refreshTokenExpiresAt) {
    return false;
  }

  const expiresAt = new Date(credentials.token.refreshTokenExpiresAt);

  // Handle invalid date strings - treat as expired for safety
  if (isNaN(expiresAt.getTime())) {
    return true;
  }

  return new Date() >= expiresAt;
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

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Get GitHub API base URL for a hostname
 */
function getApiBaseUrl(hostname: string): string {
  if (hostname === 'github.com' || hostname === DEFAULT_HOSTNAME) {
    return 'https://api.github.com';
  }
  return `https://${hostname}/api/v3`;
}

/**
 * Result of a token refresh operation
 */
export interface RefreshResult {
  success: boolean;
  username?: string;
  hostname?: string;
  error?: string;
}

/**
 * Refresh an expired OAuth token using the refresh token
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @param clientId - OAuth client ID (default: octocode client ID)
 * @returns RefreshResult with success status and error details
 */
export async function refreshAuthToken(
  hostname: string = DEFAULT_HOSTNAME,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<RefreshResult> {
  const credentials = await getCredentials(hostname);

  if (!credentials) {
    return {
      success: false,
      error: `Not logged in to ${hostname}`,
    };
  }

  if (!credentials.token.refreshToken) {
    return {
      success: false,
      error: 'Token does not support refresh (OAuth App tokens do not expire)',
    };
  }

  if (isRefreshTokenExpired(credentials)) {
    return {
      success: false,
      error: 'Refresh token has expired. Please login again.',
    };
  }

  try {
    const response = await octokitRefreshToken({
      clientType: 'github-app',
      clientId,
      clientSecret: '', // Empty for OAuth apps
      refreshToken: credentials.token.refreshToken,
      request: request.defaults({
        baseUrl: getApiBaseUrl(hostname),
      }),
    } as Parameters<typeof octokitRefreshToken>[0]);

    const newToken: OAuthToken = {
      token: response.authentication.token,
      tokenType: 'oauth',
      refreshToken: response.authentication.refreshToken,
      expiresAt: response.authentication.expiresAt,
      refreshTokenExpiresAt: response.authentication.refreshTokenExpiresAt,
    };

    await updateToken(hostname, newToken);

    return {
      success: true,
      username: credentials.username,
      hostname,
    };
  } catch (error) {
    // Mask potential sensitive data in error messages
    const errorMsg =
      error instanceof Error
        ? maskErrorMessage(error.message)
        : 'Token refresh failed';
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Result of getting a token with refresh capability
 */
export interface TokenWithRefreshResult {
  token: string | null;
  source: 'stored' | 'refreshed' | 'none';
  username?: string;
  refreshError?: string;
}

/**
 * Get token with automatic refresh for expired tokens
 *
 * This is the recommended function for getting stored tokens. It will:
 * 1. Check if credentials exist
 * 2. If token is expired and has a refresh token, attempt to refresh
 * 3. Return the valid token or null
 *
 * NOTE: This does NOT check environment variables. Use resolveTokenWithRefresh()
 * for full resolution including env vars.
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @param clientId - OAuth client ID for refresh (default: octocode client ID)
 * @returns TokenWithRefreshResult with token, source, and any refresh errors
 */
export async function getTokenWithRefresh(
  hostname: string = DEFAULT_HOSTNAME,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<TokenWithRefreshResult> {
  const credentials = await getCredentials(hostname);

  if (!credentials || !credentials.token) {
    return { token: null, source: 'none' };
  }

  // Token is valid - return it
  if (!isTokenExpired(credentials)) {
    return {
      token: credentials.token.token,
      source: 'stored',
      username: credentials.username,
    };
  }

  // Token is expired - try to refresh if we have a refresh token
  if (credentials.token.refreshToken) {
    const refreshResult = await refreshAuthToken(hostname, clientId);

    if (refreshResult.success) {
      // Get the updated credentials after refresh
      const updatedCredentials = await getCredentials(hostname);
      if (updatedCredentials?.token.token) {
        return {
          token: updatedCredentials.token.token,
          source: 'refreshed',
          username: updatedCredentials.username,
        };
      }
    }

    // Refresh failed
    return {
      token: null,
      source: 'none',
      refreshError: refreshResult.error,
    };
  }

  // No refresh token available and token is expired
  return {
    token: null,
    source: 'none',
    refreshError: 'Token expired and no refresh token available',
  };
}

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
