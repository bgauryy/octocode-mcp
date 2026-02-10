/**
 * Session Disk I/O
 *
 * File read/write/flush operations for session storage.
 * Uses atomic writes (temp file + rename) to prevent corruption.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { OCTOCODE_DIR, ensureOctocodeDir } from '../credentials/storage.js';
import { createLogger } from '../logger/index.js';
import { PersistedSessionSchema } from './schemas.js';
import type { PersistedSession } from './types.js';

const logger = createLogger('session');

// Storage constants
export const SESSION_FILE = join(OCTOCODE_DIR, 'session.json');

/**
 * Write session directly to disk (internal)
 * Uses atomic write (temp file + rename) to prevent corruption on crash
 */
export function writeSessionToDisk(session: PersistedSession): void {
  ensureOctocodeDir();

  const tempFile = `${SESSION_FILE}.tmp`;

  // Write to temp file first
  writeFileSync(tempFile, JSON.stringify(session, null, 2), {
    mode: 0o600,
  });

  // Atomic rename (POSIX guarantees atomicity)
  renameSync(tempFile, SESSION_FILE);
}

/**
 * Read session directly from disk (internal)
 */
export function readSessionFromDisk(): PersistedSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(SESSION_FILE, 'utf8');
    const parsed = JSON.parse(content);
    const result = PersistedSessionSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('Session file has invalid format', { file: SESSION_FILE });
      return null;
    }
    return result.data;
  } catch {
    // Invalid JSON or read error - return null to create new session
    return null;
  }
}

/**
 * Delete session file from disk
 */
export function deleteSessionFile(): boolean {
  if (!existsSync(SESSION_FILE)) {
    return false;
  }

  try {
    unlinkSync(SESSION_FILE);
    return true;
  } catch {
    return false;
  }
}
