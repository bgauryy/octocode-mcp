/**
 * Credential Encryption
 *
 * AES-256-GCM encryption for credential storage.
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
import { HOME } from '../platform/index.js';
import { CredentialsStoreSchema } from './schemas.js';
import type { CredentialsStore } from './types.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('token-storage');

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

// Storage constants for file storage
export const OCTOCODE_DIR = join(HOME, '.octocode');
export const CREDENTIALS_FILE = join(OCTOCODE_DIR, 'credentials.json');
export const KEY_FILE = join(OCTOCODE_DIR, '.key');

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Ensure .octocode directory exists with secure permissions (0o700)
 */
export function ensureOctocodeDir(): void {
  if (!existsSync(OCTOCODE_DIR)) {
    mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o700 });
  }
}

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
      logger.warn('Credentials file has invalid format — starting fresh', {
        file: CREDENTIALS_FILE,
      });
      return { version: 1, credentials: {} };
    }
    return result.data;
  } catch (error) {
    // Credentials file is corrupted or key changed - warn user
    const reason =
      error instanceof Error && error.message
        ? maskErrorMessage(error.message)
        : undefined;
    logger.warn(
      'Could not read credentials file — you may need to login again',
      {
        file: CREDENTIALS_FILE,
        ...(reason && { reason }),
      }
    );
    return { version: 1, credentials: {} };
  }
}

/**
 * Write credentials store to file
 */
export function writeCredentialsStore(store: CredentialsStore): void {
  ensureOctocodeDir();

  const encrypted = encrypt(JSON.stringify(store, null, 2));
  writeFileSync(CREDENTIALS_FILE, encrypted, { mode: 0o600 });
}

/**
 * Clean up key file and credentials file (best effort)
 */
export function cleanupKeyFile(): void {
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
