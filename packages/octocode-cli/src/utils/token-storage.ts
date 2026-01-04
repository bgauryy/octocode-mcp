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
import type { StoredCredentials } from '../types/index.js';
import { HOME } from './platform.js';

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
// MIGRATION: Legacy file to keychain
// ============================================================================

/**
 * Check for and migrate legacy credentials to keychain
 */
async function migrateLegacyCredentials(): Promise<void> {
  if (!isSecureStorageAvailable()) return;
  if (!existsSync(CREDENTIALS_FILE)) return;

  try {
    const store = readCredentialsStore();
    const hostnames = Object.keys(store.credentials);

    if (hostnames.length === 0) return;

    // Migrate each credential to keychain
    for (const hostname of hostnames) {
      const existing = await keytarGet(hostname);
      if (!existing) {
        await keytarStore(hostname, store.credentials[hostname]);
      }
    }

    // Remove legacy files after successful migration
    try {
      unlinkSync(CREDENTIALS_FILE);
      if (existsSync(KEY_FILE)) {
        unlinkSync(KEY_FILE);
      }
    } catch (cleanupError) {
      console.error(
        `[token-storage] Legacy file cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      );
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
 * Store credentials for a hostname
 * Uses keychain if available, falls back to encrypted file
 *
 * NOTE: This sync function always writes to file storage for sync API compatibility.
 * When keytar is available, it also writes to keytar asynchronously.
 * For async-only environments, prefer storeCredentialsAsync().
 */
export function storeCredentials(credentials: StoredCredentials): void {
  const hostname = normalizeHostname(credentials.hostname);
  const normalizedCredentials = {
    ...credentials,
    hostname,
    updatedAt: new Date().toISOString(),
  };

  // Always write to file for sync API compatibility (getCredentials reads from file)
  try {
    const store = readCredentialsStore();
    store.credentials[hostname] = normalizedCredentials;
    writeCredentialsStore(store);
  } catch (fileError) {
    console.error(
      `[token-storage] CRITICAL: Failed to store credentials to file!`
    );
    console.error(
      `  Error: ${fileError instanceof Error ? fileError.message : String(fileError)}`
    );
    throw new Error('Failed to store credentials to file storage');
  }

  // Also write to keytar if available (async, for getCredentialsAsync)
  if (isSecureStorageAvailable()) {
    keytarStore(hostname, normalizedCredentials).catch(keytarError => {
      // Keytar failed, but file storage succeeded - log warning
      console.warn(
        `[token-storage] Keytar storage failed (file storage OK): ${keytarError instanceof Error ? keytarError.message : String(keytarError)}`
      );
    });
  }
}

/**
 * Store credentials for a hostname (async version)
 *
 * Always writes to file storage for sync API compatibility.
 * Also writes to keytar when available.
 */
export async function storeCredentialsAsync(
  credentials: StoredCredentials
): Promise<void> {
  const hostname = normalizeHostname(credentials.hostname);
  const normalizedCredentials = {
    ...credentials,
    hostname,
    updatedAt: new Date().toISOString(),
  };

  // Always write to file for sync API compatibility
  try {
    const store = readCredentialsStore();
    store.credentials[hostname] = normalizedCredentials;
    writeCredentialsStore(store);
  } catch (fileError) {
    console.error(
      `[token-storage] CRITICAL: Failed to store credentials to file!`
    );
    console.error(
      `  Error: ${fileError instanceof Error ? fileError.message : String(fileError)}`
    );
    throw new Error('Failed to store credentials to file storage');
  }

  // Also write to keytar if available
  if (isSecureStorageAvailable()) {
    try {
      await keytarStore(hostname, normalizedCredentials);
    } catch (keytarError) {
      // Keytar failed, but file storage succeeded - log warning
      console.warn(
        `[token-storage] Keytar storage failed (file storage OK): ${keytarError instanceof Error ? keytarError.message : String(keytarError)}`
      );
    }
  }
}

/**
 * Get credentials for a hostname (sync version)
 *
 * Reads from file storage only (keytar is async and cannot be called synchronously).
 * Since storeCredentials() always writes to file storage, this will find credentials
 * stored via either sync or async methods.
 *
 * For async contexts, prefer getCredentialsAsync() which also checks keytar.
 *
 * @param hostname - GitHub hostname (default: 'github.com')
 * @returns Stored credentials or null if not found
 */
export function getCredentials(
  hostname: string = 'github.com'
): StoredCredentials | null {
  const normalizedHostname = normalizeHostname(hostname);

  // Sync API reads from file only - keytar requires async
  // This works because storeCredentials() always writes to file for sync compatibility
  const store = readCredentialsStore();
  return store.credentials[normalizedHostname] || null;
}

/**
 * Get credentials for a hostname (async version - preferred)
 */
export async function getCredentialsAsync(
  hostname: string = 'github.com'
): Promise<StoredCredentials | null> {
  const normalizedHostname = normalizeHostname(hostname);

  if (isSecureStorageAvailable()) {
    const creds = await keytarGet(normalizedHostname);
    if (creds) return creds;
  }

  // Fallback to file
  const store = readCredentialsStore();
  return store.credentials[normalizedHostname] || null;
}

/**
 * Delete credentials for a hostname
 */
export function deleteCredentials(hostname: string = 'github.com'): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  if (isSecureStorageAvailable()) {
    // Fire and forget for keychain
    keytarDelete(normalizedHostname).catch(error => {
      console.error(
        `[token-storage] Keytar delete failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }

  // Always try to delete from file store too
  const store = readCredentialsStore();
  if (store.credentials[normalizedHostname]) {
    delete store.credentials[normalizedHostname];
    writeCredentialsStore(store);
    return true;
  }

  return isSecureStorageAvailable(); // Return true if keychain delete was attempted
}

/**
 * Delete credentials for a hostname (async version)
 */
export async function deleteCredentialsAsync(
  hostname: string = 'github.com'
): Promise<boolean> {
  const normalizedHostname = normalizeHostname(hostname);
  let deleted = false;

  if (isSecureStorageAvailable()) {
    deleted = await keytarDelete(normalizedHostname);
  }

  // Always try to delete from file store too
  const store = readCredentialsStore();
  if (store.credentials[normalizedHostname]) {
    delete store.credentials[normalizedHostname];
    writeCredentialsStore(store);
    deleted = true;
  }

  return deleted;
}

/**
 * List all stored hostnames
 */
export function listStoredHosts(): string[] {
  if (!isSecureStorageAvailable()) {
    const store = readCredentialsStore();
    return Object.keys(store.credentials);
  }

  // Sync fallback - just return file-based hosts
  const store = readCredentialsStore();
  return Object.keys(store.credentials);
}

/**
 * List all stored hostnames (async version - preferred)
 */
export async function listStoredHostsAsync(): Promise<string[]> {
  const hosts = new Set<string>();

  if (isSecureStorageAvailable()) {
    const keychainHosts = await keytarList();
    keychainHosts.forEach(h => hosts.add(h));
  }

  // Also include file-based hosts
  const store = readCredentialsStore();
  Object.keys(store.credentials).forEach(h => hosts.add(h));

  return Array.from(hosts);
}

/**
 * Check if credentials exist for a hostname
 */
export function hasCredentials(hostname: string = 'github.com'): boolean {
  return getCredentials(hostname) !== null;
}

/**
 * Check if credentials exist for a hostname (async version)
 */
export async function hasCredentialsAsync(
  hostname: string = 'github.com'
): Promise<boolean> {
  return (await getCredentialsAsync(hostname)) !== null;
}

/**
 * Update token for a hostname (used for refresh)
 */
export function updateToken(
  hostname: string,
  token: StoredCredentials['token']
): boolean {
  const credentials = getCredentials(hostname);

  if (!credentials) {
    return false;
  }

  credentials.token = token;
  credentials.updatedAt = new Date().toISOString();
  storeCredentials(credentials);

  return true;
}

/**
 * Update token for a hostname (async version)
 */
export async function updateTokenAsync(
  hostname: string,
  token: StoredCredentials['token']
): Promise<boolean> {
  const credentials = await getCredentialsAsync(hostname);

  if (!credentials) {
    return false;
  }

  credentials.token = token;
  credentials.updatedAt = new Date().toISOString();
  await storeCredentialsAsync(credentials);

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
