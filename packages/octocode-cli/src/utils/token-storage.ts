/**
 * Token Storage Utility
 *
 * Stores OAuth tokens securely using:
 * 1. System keychain (via keytar) - preferred for desktop environments
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
import type {
  StoredCredentials,
  StoreResult,
  DeleteResult,
} from '../types/index.js';
import { HOME } from './platform.js';

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

// Keytar is optional - will fallback to file storage if not available
let keytar: typeof import('keytar') | null = null;

// Dynamic import of keytar - allows graceful fallback
async function loadKeytar(): Promise<typeof import('keytar') | null> {
  if (keytar !== null) return keytar;
  try {
    const module = await import('keytar');
    keytar = module.default || module;
    return keytar;
  } catch {
    // keytar not available - will use file fallback
    return null;
  }
}

// Try to load keytar on module init (non-blocking)
loadKeytar().catch(error => {
  console.error(
    `[token-storage] Keytar load failed (using file fallback): ${error instanceof Error ? error.message : String(error)}`
  );
});

// Service name for keychain storage (like gh uses "gh:github.com")
const KEYCHAIN_SERVICE = 'octocode-cli';

// Storage constants for file fallback
const OCTOCODE_DIR = join(HOME, '.octocode');
const CREDENTIALS_FILE = join(OCTOCODE_DIR, 'credentials.json');
const KEY_FILE = join(OCTOCODE_DIR, '.key');

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Track storage mode
let _useSecureStorage: boolean | null = null;
let _keytarInitialized = false;

/**
 * Initialize secure storage by loading keytar
 * Call this before using any credential functions to ensure keytar is loaded
 * @returns true if secure storage (keytar) is available
 */
export async function initializeSecureStorage(): Promise<boolean> {
  if (_keytarInitialized) {
    return _useSecureStorage ?? false;
  }

  await loadKeytar();
  _keytarInitialized = true;
  _useSecureStorage = keytar !== null;
  return _useSecureStorage;
}

/**
 * Check if secure storage (keytar) is available
 * Note: This may return false before initializeSecureStorage() is called
 * due to the async nature of keytar loading.
 */
export function isSecureStorageAvailable(): boolean {
  if (_useSecureStorage !== null) {
    return _useSecureStorage;
  }

  // If keytar hasn't been initialized yet, check current state
  // This may return false even if keytar is available (race condition)
  // Use initializeSecureStorage() for reliable detection
  _useSecureStorage = keytar !== null;
  return _useSecureStorage;
}

/**
 * Force set secure storage availability (for testing)
 * @internal
 */
export function _setSecureStorageAvailable(available: boolean): void {
  _useSecureStorage = available;
  _keytarInitialized = true; // Mark as initialized to prevent re-initialization
  if (!available) {
    keytar = null;
  }
}

/**
 * Reset secure storage state (for testing)
 * @internal
 */
export function _resetSecureStorageState(): void {
  _useSecureStorage = null;
  _keytarInitialized = false;
  keytar = null;
}

/**
 * Storage interface for credentials (file fallback)
 */
interface CredentialsStore {
  version: number;
  credentials: Record<string, StoredCredentials>;
}

// ============================================================================
// KEYTAR-BASED SECURE STORAGE (Primary)
// ============================================================================

/**
 * Store credentials in system keychain
 */
async function keytarStore(
  hostname: string,
  credentials: StoredCredentials
): Promise<void> {
  if (!keytar) throw new Error('Keytar not available');

  const data = JSON.stringify(credentials);
  await keytar.setPassword(KEYCHAIN_SERVICE, hostname, data);
}

/**
 * Get credentials from system keychain
 */
async function keytarGet(hostname: string): Promise<StoredCredentials | null> {
  if (!keytar) return null;

  try {
    const data = await keytar.getPassword(KEYCHAIN_SERVICE, hostname);
    if (!data) return null;
    return JSON.parse(data) as StoredCredentials;
  } catch {
    return null;
  }
}

/**
 * Delete credentials from system keychain
 */
async function keytarDelete(hostname: string): Promise<boolean> {
  if (!keytar) return false;

  try {
    return await keytar.deletePassword(KEYCHAIN_SERVICE, hostname);
  } catch {
    return false;
  }
}

/**
 * List all stored hostnames from keychain
 */
async function keytarList(): Promise<string[]> {
  if (!keytar) return [];

  try {
    const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE);
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
function encrypt(data: string): string {
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
function decrypt(encryptedData: string): string {
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
 * Ensure .octocode directory exists
 */
function ensureOctocodeDir(): void {
  if (!existsSync(OCTOCODE_DIR)) {
    mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read credentials store from file
 */
function readCredentialsStore(): CredentialsStore {
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
 * Check for and migrate legacy credentials to keychain (with timeout protection)
 */
async function migrateLegacyCredentials(): Promise<void> {
  if (!isSecureStorageAvailable()) return;
  if (!existsSync(CREDENTIALS_FILE)) return;

  try {
    const store = readCredentialsStore();
    const hostnames = Object.keys(store.credentials);

    if (hostnames.length === 0) return;

    let migratedCount = 0;

    // Migrate each credential to keychain with timeout
    for (const hostname of hostnames) {
      try {
        // Check if already in keyring (with timeout)
        const existing = await withTimeout(
          keytarGet(hostname),
          KEYRING_TIMEOUT_MS
        );
        if (!existing) {
          await withTimeout(
            keytarStore(hostname, store.credentials[hostname]),
            KEYRING_TIMEOUT_MS
          );
        }
        // Remove from file after successful migration
        delete store.credentials[hostname];
        migratedCount++;
      } catch (err) {
        console.warn(
          `[token-storage] Migration failed for ${hostname}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // Keep in file storage if migration fails
      }
    }

    // Update file storage (may be empty now)
    if (Object.keys(store.credentials).length === 0) {
      cleanupKeyFile();
    } else if (migratedCount > 0) {
      writeCredentialsStore(store);
    }
  } catch (migrationError) {
    console.error(
      `[token-storage] Credential migration failed: ${migrationError instanceof Error ? migrationError.message : String(migrationError)}`
    );
  }
}

// Run migration on module load
migrateLegacyCredentials().catch(error => {
  console.error(
    `[token-storage] Migration failed (keeping current storage): ${error instanceof Error ? error.message : String(error)}`
  );
});

// ============================================================================
// PUBLIC API (Sync wrappers for compatibility)
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
        keytarStore(hostname, normalizedCredentials),
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
 * 2. Fallback to file storage
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
        keytarGet(normalizedHostname),
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
  return store.credentials[normalizedHostname] || null;
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
        keytarDelete(normalizedHostname),
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
      const keychainHosts = await withTimeout(keytarList(), KEYRING_TIMEOUT_MS);
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
 * Check if using secure storage
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
