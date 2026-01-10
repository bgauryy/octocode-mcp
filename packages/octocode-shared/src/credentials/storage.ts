/**
 * Token Storage Utility
 *
 * Stores OAuth tokens securely using:
 * 1. System keychain (native OS commands) - preferred for desktop environments
 * 2. Encrypted file fallback (~/.octocode/credentials.json) - for CI/server
 *
 * Behavior matches gh CLI's credential storage approach.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
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
import * as keychain from './keychain.js';

// Default OAuth client ID for octocode (same as CLI)
const DEFAULT_CLIENT_ID = '178c6fc778ccc68e1d6a';
const DEFAULT_HOSTNAME = 'github.com';

// ============================================================================
// TOKEN CACHE (1-minute TTL using node-cache)
// ============================================================================

import NodeCache from 'node-cache';

/** Cache TTL in seconds (1 minute) */
const TOKEN_CACHE_TTL_SECONDS = 60;

/**
 * Token cache using node-cache with automatic TTL expiration.
 * - stdTTL: 60 seconds (1 minute)
 * - checkperiod: 30 seconds (cleanup expired keys)
 * - useClones: false (return references for performance)
 */
const tokenCache = new NodeCache({
  stdTTL: TOKEN_CACHE_TTL_SECONDS,
  checkperiod: 30,
  useClones: false,
  deleteOnExpire: true,
});

/**
 * Clear the token resolution cache.
 * Use this when credentials change (login, logout, refresh).
 *
 * @param hostname - Optional hostname to clear. If not provided, clears all.
 */
export function clearTokenCache(hostname?: string): void {
  if (hostname) {
    tokenCache.del(hostname);
  } else {
    tokenCache.flushAll();
  }
}

// ============================================================================
// TIMEOUT UTILITIES (like gh CLI's 3 second timeout)
// ============================================================================

const KEYRING_TIMEOUT_MS = 3000;

/**
 * Timeout error for keyring operations
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout (like gh CLI's keyring timeout)
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`Operation timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

// Check if native keychain is available
let _keychainAvailable: boolean | null = null;

function checkKeychainAvailable(): boolean {
  if (_keychainAvailable === null) {
    _keychainAvailable = keychain.isKeychainAvailable();
  }
  return _keychainAvailable;
}

// Service name for keychain storage (like gh uses "gh:github.com")
const KEYCHAIN_SERVICE = 'octocode-cli';

// Storage constants for file fallback
export const OCTOCODE_DIR = join(HOME, '.octocode');
export const CREDENTIALS_FILE = join(OCTOCODE_DIR, 'credentials.json');
export const KEY_FILE = join(OCTOCODE_DIR, '.key');

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

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

// Track storage mode
let _useSecureStorage: boolean | null = null;
let _keychainInitialized = false;

/**
 * Initialize secure storage by checking keychain availability.
 * Call this before using any credential functions to ensure keychain is checked.
 *
 * Note: Migration from file to keychain happens lazily on first credential access,
 * not at startup. This avoids triggering keychain permission prompts on every app launch.
 *
 * @returns true if secure storage (native keychain) is available
 */
export async function initializeSecureStorage(): Promise<boolean> {
  if (_keychainInitialized) {
    return _useSecureStorage ?? false;
  }

  _keychainInitialized = true;
  _useSecureStorage = checkKeychainAvailable();

  // Note: Migration is now lazy - happens on first getCredentials() call
  // This prevents keychain permission prompts on every app startup

  return _useSecureStorage;
}

/**
 * Check if secure storage (native keychain) is available
 */
export function isSecureStorageAvailable(): boolean {
  if (_useSecureStorage !== null) {
    return _useSecureStorage;
  }

  // Check current keychain availability
  _useSecureStorage = checkKeychainAvailable();
  return _useSecureStorage;
}

/**
 * Force set secure storage availability (for testing)
 * @internal
 */
export function _setSecureStorageAvailable(available: boolean): void {
  _useSecureStorage = available;
  _keychainAvailable = available;
  _keychainInitialized = true;
}

/**
 * Reset secure storage state (for testing)
 * @internal
 */
export function _resetSecureStorageState(): void {
  _useSecureStorage = null;
  _keychainAvailable = null;
  _keychainInitialized = false;
}

// ============================================================================
// NATIVE KEYCHAIN SECURE STORAGE (Primary)
// ============================================================================

/**
 * Store credentials in system keychain
 */
async function keychainStore(
  hostname: string,
  credentials: StoredCredentials
): Promise<void> {
  if (!checkKeychainAvailable()) {
    throw new Error('Keychain not available');
  }

  const data = JSON.stringify(credentials);
  await keychain.setPassword(KEYCHAIN_SERVICE, hostname, data);
}

/**
 * Get credentials from system keychain
 */
async function keychainGet(
  hostname: string
): Promise<StoredCredentials | null> {
  if (!checkKeychainAvailable()) return null;

  try {
    const data = await keychain.getPassword(KEYCHAIN_SERVICE, hostname);
    if (!data) return null;
    return JSON.parse(data) as StoredCredentials;
  } catch {
    return null;
  }
}

/**
 * Delete credentials from system keychain
 */
async function keychainDelete(hostname: string): Promise<boolean> {
  if (!checkKeychainAvailable()) return false;

  try {
    return await keychain.deletePassword(KEYCHAIN_SERVICE, hostname);
  } catch {
    return false;
  }
}

/**
 * List all stored hostnames from keychain
 */
async function keychainList(): Promise<string[]> {
  if (!checkKeychainAvailable()) return [];

  try {
    const credentials = await keychain.findCredentials(KEYCHAIN_SERVICE);
    return credentials.map(c => c.account);
  } catch {
    return [];
  }
}

// ============================================================================
// FILE-BASED ENCRYPTED STORAGE (Fallback)
// ============================================================================

/**
 * Get or create encryption key for file storage
 */
function getOrCreateKey(): Buffer {
  ensureOctocodeDir();

  if (existsSync(KEY_FILE)) {
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
    return JSON.parse(decrypted) as CredentialsStore;
  } catch (error) {
    // Credentials file is corrupted or key changed - warn user
    console.error(
      '\n  ⚠ Warning: Could not read credentials file. You may need to login again.'
    );
    console.error(`  File: ${CREDENTIALS_FILE}`);
    if (error instanceof Error && error.message) {
      console.error(`  Reason: ${error.message}\n`);
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

// ============================================================================
// FILE CLEANUP HELPERS (for keyring-first strategy)
// ============================================================================

/**
 * Remove credentials from file storage (used after successful keyring store)
 */
function removeFromFileStorage(hostname: string): boolean {
  try {
    const store = readCredentialsStore();
    if (store.credentials[hostname]) {
      delete store.credentials[hostname];

      // Clean up files if no more credentials remain
      if (Object.keys(store.credentials).length === 0) {
        cleanupKeyFile();
      } else {
        writeCredentialsStore(store);
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn(
      `[token-storage] Failed to remove from file storage: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
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
// MIGRATION: Legacy file to keychain
// ============================================================================

/**
 * Migrate a single credential from file to keychain (lazy migration)
 * Called on first access to a file-stored credential.
 */
async function migrateSingleCredential(
  hostname: string,
  credentials: StoredCredentials
): Promise<void> {
  try {
    // Store in keychain
    await withTimeout(keychainStore(hostname, credentials), KEYRING_TIMEOUT_MS);

    // Remove from file storage after successful migration
    removeFromFileStorage(hostname);
  } catch {
    // Migration failed - credential remains in file storage
    // Don't log to avoid noise during normal operation
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
 * Store credentials using keyring-first strategy (like gh CLI)
 *
 * Flow:
 * 1. Try keyring with timeout
 * 2. On success: remove from file storage (clean migration)
 * 3. On failure: fallback to encrypted file storage
 *
 * @returns StoreResult with insecureStorageUsed flag
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

  // 1. Try keyring FIRST (with timeout) - like gh CLI
  if (isSecureStorageAvailable()) {
    try {
      await withTimeout(
        keychainStore(hostname, normalizedCredentials),
        KEYRING_TIMEOUT_MS
      );

      // 2. SUCCESS: Clean up file storage (single source of truth)
      removeFromFileStorage(hostname);

      return { success: true, insecureStorageUsed: false };
    } catch (err) {
      console.warn(
        `[token-storage] Keyring storage failed, using file fallback: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 3. FALLBACK: Encrypted file storage
  try {
    const store = readCredentialsStore();
    store.credentials[hostname] = normalizedCredentials;
    writeCredentialsStore(store);

    return { success: true, insecureStorageUsed: true };
  } catch (fileError) {
    console.error(`[token-storage] CRITICAL: All storage methods failed!`);
    console.error(
      `  Error: ${fileError instanceof Error ? fileError.message : String(fileError)}`
    );
    throw new Error('Failed to store credentials');
  }
}

/**
 * Get credentials using keyring-first strategy (like gh CLI)
 *
 * Flow:
 * 1. Try keyring with timeout
 * 2. Fallback to file storage (with lazy migration to keyring)
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns Stored credentials or null if not found
 */
export async function getCredentials(
  hostname: string = 'github.com'
): Promise<StoredCredentials | null> {
  const normalizedHostname = normalizeHostname(hostname);

  // 1. Try keyring first (with timeout)
  if (isSecureStorageAvailable()) {
    try {
      const creds = await withTimeout(
        keychainGet(normalizedHostname),
        KEYRING_TIMEOUT_MS
      );
      if (creds) return creds;
    } catch (err) {
      // Timeout or error - try file fallback
      if (!(err instanceof TimeoutError)) {
        console.warn(
          `[token-storage] Keyring read failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  // 2. Fallback to file storage
  const store = readCredentialsStore();
  const fileCreds = store.credentials[normalizedHostname];

  if (fileCreds) {
    // Lazy migration: migrate this credential to keyring on first access
    if (isSecureStorageAvailable()) {
      migrateSingleCredential(normalizedHostname, fileCreds).catch(() => {
        // Migration failed silently - credentials still available from file
      });
    }
    return fileCreds;
  }

  return null;
}

/**
 * Get credentials synchronously (file storage only)
 *
 * ⚠️ WARNING: This only reads from file storage, not keyring.
 * Use getCredentials() (async) for the full keyring-first lookup.
 * This sync version is kept for backward compatibility only.
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
 * Delete credentials from both keyring and file storage
 *
 * Flow:
 * 1. Delete from keyring (with timeout, best-effort)
 * 2. Delete from file storage
 * 3. Return combined result with details
 *
 * @returns DeleteResult with details about what was deleted
 */
export async function deleteCredentials(
  hostname: string = 'github.com'
): Promise<DeleteResult> {
  const normalizedHostname = normalizeHostname(hostname);
  let deletedFromKeyring = false;
  let deletedFromFile = false;

  // 1. Delete from keyring (best-effort with timeout)
  if (isSecureStorageAvailable()) {
    try {
      deletedFromKeyring = await withTimeout(
        keychainDelete(normalizedHostname),
        KEYRING_TIMEOUT_MS
      );
    } catch (err) {
      console.warn(
        `[token-storage] Keyring delete failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 2. Delete from file storage
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

  return {
    success: deletedFromKeyring || deletedFromFile,
    deletedFromKeyring,
    deletedFromFile,
  };
}

/**
 * List all stored hostnames (from both keyring and file)
 */
export async function listStoredHosts(): Promise<string[]> {
  const hosts = new Set<string>();

  // Try keyring first (with timeout)
  if (isSecureStorageAvailable()) {
    try {
      const keychainHosts = await withTimeout(
        keychainList(),
        KEYRING_TIMEOUT_MS
      );
      keychainHosts.forEach(h => hosts.add(h));
    } catch (err) {
      // Timeout or error - continue with file
      if (!(err instanceof TimeoutError)) {
        console.warn(
          `[token-storage] Keyring list failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  // Also include file-based hosts
  const store = readCredentialsStore();
  Object.keys(store.credentials).forEach(h => hosts.add(h));

  return Array.from(hosts);
}

/**
 * List stored hosts synchronously (file storage only)
 *
 * ⚠️ WARNING: This only lists file storage, not keyring.
 * Use listStoredHosts() (async) for full list.
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
 *
 * ⚠️ WARNING: This only checks file storage, not keyring.
 * Use hasCredentials() (async) for full check.
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
  if (isSecureStorageAvailable()) {
    return 'System Keychain (secure)';
  }
  return CREDENTIALS_FILE;
}

/**
 * Alias for isSecureStorageAvailable (for backward compatibility)
 */
export function isUsingSecureStorage(): boolean {
  return isSecureStorageAvailable();
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
 * Get token from stored credentials (keychain/file only)
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
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
 * 4. Native keychain (most secure for desktop)
 * 5. Encrypted file storage (~/.octocode/credentials.json)
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

  // Priority 4-5: Stored credentials (keychain → file)
  const storedToken = await getToken(hostname);
  if (storedToken) {
    // Determine if from keychain or file
    const source: TokenSource = isSecureStorageAvailable()
      ? 'keychain'
      : 'file';
    return {
      token: storedToken,
      source,
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
 * 2. Check stored credentials (keychain → file)
 * 3. If stored token is expired and has a refresh token, attempt to refresh
 * 4. Return the valid token with source information
 *
 * Priority order:
 * 1. OCTOCODE_TOKEN env var
 * 2. GH_TOKEN env var
 * 3. GITHUB_TOKEN env var
 * 4. Stored credentials with auto-refresh (keychain → file)
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

  // Priority 4-5: Stored credentials with refresh (keychain → file)
  const result = await getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    const source: TokenSource = isSecureStorageAvailable()
      ? 'keychain'
      : 'file';
    return {
      token: result.token,
      source,
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
 * Full token resolution with gh CLI fallback and 1-minute caching
 *
 * This is the recommended function for complete token resolution across all sources.
 * Results are cached for 1 minute to reduce I/O overhead.
 *
 * Priority order:
 * 1. OCTOCODE_TOKEN env var
 * 2. GH_TOKEN env var
 * 3. GITHUB_TOKEN env var
 * 4. Octocode storage with auto-refresh (keychain → file)
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

  // Priority 1-3: ALWAYS check environment variables first (highest priority, no I/O)
  // This ensures env vars take precedence over any cached token from other sources
  const envToken = getTokenFromEnv();
  if (envToken) {
    return {
      token: envToken,
      source: getEnvTokenSource() ?? 'env:GITHUB_TOKEN',
      wasRefreshed: false,
    };
  }

  // Check cache for non-env token results (keychain/file/gh-cli)
  const cached = tokenCache.get<FullTokenResolution | null>(hostname);
  if (cached !== undefined) {
    return cached;
  }

  // Cache miss or expired - resolve from storage/gh-cli (skips env since already checked)
  const result = await resolveTokenFullInternalNoEnv(
    hostname,
    clientId,
    getGhCliToken
  );

  // Cache the result (including null) with default TTL
  tokenCache.set(hostname, result);

  return result;
}

/**
 * Internal token resolution skipping env vars (for use after env check)
 * This allows env vars to be checked before cache in resolveTokenFull
 */
async function resolveTokenFullInternalNoEnv(
  hostname: string,
  clientId: string,
  getGhCliToken?: GhCliTokenGetter
): Promise<FullTokenResolution | null> {
  // Priority 4-5: Octocode storage with auto-refresh (keychain → file)
  const result = await getTokenWithRefresh(hostname, clientId);

  if (result.token) {
    const source: TokenSource = isSecureStorageAvailable()
      ? 'keychain'
      : 'file';
    return {
      token: result.token,
      source,
      wasRefreshed: result.source === 'refreshed',
      username: result.username,
    };
  }

  // Capture refresh error if any
  const refreshError = result.refreshError;

  // Priority 6: gh CLI token (fallback)
  if (getGhCliToken) {
    try {
      const ghToken = await Promise.resolve(getGhCliToken(hostname));
      if (ghToken?.trim()) {
        return {
          token: ghToken.trim(),
          source: 'gh-cli',
          wasRefreshed: false,
          refreshError, // Include any refresh error from step 4-5
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
 * ⚠️ WARNING: This only reads from file storage, not keyring.
 * Use getToken() (async) for the full keyring-first lookup.
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
