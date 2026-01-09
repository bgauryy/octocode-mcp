/**
 * Session Storage
 *
 * Persistent session storage in ~/.octocode/session.json
 * Cross-platform support for Windows, Linux, and macOS.
 *
 * Uses batch saving to reduce disk I/O - changes are buffered in memory
 * and flushed to disk every 60 seconds or on process exit.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OCTOCODE_DIR, ensureOctocodeDir } from '../credentials/storage.js';
import type {
  PersistedSession,
  SessionStats,
  SessionUpdateResult,
  SessionOptions,
} from './types.js';

// Storage constants
export const SESSION_FILE = join(OCTOCODE_DIR, 'session.json');

// Current schema version
const CURRENT_VERSION = 1 as const;

// Batch save interval (60 seconds)
const FLUSH_INTERVAL_MS = 60_000;

// ─── In-Memory Cache & Batch Saving ─────────────────────────────────────────

/** In-memory session cache */
let cachedSession: PersistedSession | null = null;

/** Whether the cache has unsaved changes */
let isDirty = false;

/** Timer for periodic flush */
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Whether exit handlers are registered */
let exitHandlersRegistered = false;

/** Stored listener references for cleanup */
let exitListener: (() => void) | null = null;
let sigintListener: (() => void) | null = null;
let sigtermListener: (() => void) | null = null;

/**
 * Register process exit handlers to flush session on shutdown.
 *
 * IMPORTANT: This is a library module - we flush data but NEVER call process.exit().
 * The consuming application owns the process lifecycle.
 */
function registerExitHandlers(): void {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;

  // Create listener functions (stored for cleanup in tests)
  exitListener = () => {
    flushSessionSync();
  };
  sigintListener = () => {
    flushSessionSync();
    // Don't call process.exit() - let the application decide
  };
  sigtermListener = () => {
    flushSessionSync();
    // Don't call process.exit() - let the application decide
  };

  // Register handlers
  process.on('exit', exitListener);
  process.once('SIGINT', sigintListener);
  process.once('SIGTERM', sigtermListener);
}

/**
 * Unregister exit handlers (for testing only)
 * @internal
 */
function unregisterExitHandlers(): void {
  if (exitListener) {
    process.removeListener('exit', exitListener);
    exitListener = null;
  }
  if (sigintListener) {
    process.removeListener('SIGINT', sigintListener);
    sigintListener = null;
  }
  if (sigtermListener) {
    process.removeListener('SIGTERM', sigtermListener);
    sigtermListener = null;
  }
  exitHandlersRegistered = false;
}

/**
 * Start the periodic flush timer
 */
function startFlushTimer(): void {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    if (isDirty && cachedSession) {
      writeSessionToDisk(cachedSession);
      isDirty = false;
    }
  }, FLUSH_INTERVAL_MS);

  // Don't prevent process from exiting
  flushTimer.unref();
}

/**
 * Stop the periodic flush timer
 */
function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Write session directly to disk (internal)
 * Uses atomic write (temp file + rename) to prevent corruption on crash
 */
function writeSessionToDisk(session: PersistedSession): void {
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
function readSessionFromDisk(): PersistedSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(SESSION_FILE, 'utf8');
    const session = JSON.parse(content) as PersistedSession;

    // Validate schema version
    if (session.version !== CURRENT_VERSION) {
      // Future: handle migrations here
      return null;
    }

    // Validate required fields
    if (!session.sessionId || !session.createdAt) {
      return null;
    }

    return session;
  } catch {
    // Invalid JSON or read error - return null to create new session
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Default session statistics
 */
function createDefaultStats(): SessionStats {
  return {
    toolCalls: 0,
    promptCalls: 0,
    errors: 0,
    rateLimits: 0,
  };
}

/**
 * Create a new session with default values
 */
function createNewSession(): PersistedSession {
  const now = new Date().toISOString();
  return {
    version: CURRENT_VERSION,
    sessionId: randomUUID(),
    createdAt: now,
    lastActiveAt: now,
    stats: createDefaultStats(),
  };
}

/**
 * Read session (from cache or disk)
 * @returns The persisted session or null if not found/invalid
 */
export function readSession(): PersistedSession | null {
  // Return from cache if available
  if (cachedSession) {
    return cachedSession;
  }

  // Load from disk and cache
  const session = readSessionFromDisk();
  if (session) {
    cachedSession = session;
  }
  return session;
}

/**
 * Write session (to cache, batched to disk)
 * Changes are buffered and flushed every 60 seconds or on process exit.
 */
export function writeSession(session: PersistedSession): void {
  cachedSession = session;
  isDirty = true;

  // Ensure exit handlers and flush timer are set up
  registerExitHandlers();
  startFlushTimer();
}

/**
 * Flush session to disk immediately
 * Use this when you need to ensure data is persisted (e.g., before critical operations)
 */
export function flushSession(): void {
  if (isDirty && cachedSession) {
    writeSessionToDisk(cachedSession);
    isDirty = false;
  }
}

/**
 * Flush session to disk synchronously (for exit handlers)
 */
export function flushSessionSync(): void {
  if (isDirty && cachedSession) {
    try {
      writeSessionToDisk(cachedSession);
      isDirty = false;
    } catch {
      // Best effort - don't throw on exit
    }
  }
}

/**
 * Get or create a session
 * - If session exists and is valid, update lastActiveAt and return it
 * - If session doesn't exist or is invalid, create a new one
 *
 * @param options - Session options (forceNew to create fresh session)
 * @returns The persisted session
 */
export function getOrCreateSession(options?: SessionOptions): PersistedSession {
  // Force new session if requested
  if (options?.forceNew) {
    const newSession = createNewSession();
    writeSession(newSession);
    // Flush immediately for new sessions to ensure ID is persisted
    flushSession();
    return newSession;
  }

  // Try to load existing session (from cache or disk)
  const existingSession = readSession();

  if (existingSession) {
    // Update lastActiveAt timestamp
    const updatedSession: PersistedSession = {
      ...existingSession,
      lastActiveAt: new Date().toISOString(),
    };
    writeSession(updatedSession);
    // Flush immediately on first load to persist lastActiveAt
    flushSession();
    return updatedSession;
  }

  // Create new session
  const newSession = createNewSession();
  writeSession(newSession);
  // Flush immediately for new sessions to ensure ID is persisted
  flushSession();
  return newSession;
}

/**
 * Get the current session ID without modifying the session
 * @returns The session ID or null if no session exists
 */
export function getSessionId(): string | null {
  const session = readSession();
  return session?.sessionId ?? null;
}

/**
 * Update session statistics
 * Increments the specified stat counters (batched to disk)
 *
 * @param updates - Partial stats to increment
 * @returns Result with success status and updated session
 */
export function updateSessionStats(
  updates: Partial<SessionStats>
): SessionUpdateResult {
  const session = readSession();

  if (!session) {
    return { success: false, session: null };
  }

  // Increment stats
  const updatedStats: SessionStats = {
    toolCalls: session.stats.toolCalls + (updates.toolCalls ?? 0),
    promptCalls: session.stats.promptCalls + (updates.promptCalls ?? 0),
    errors: session.stats.errors + (updates.errors ?? 0),
    rateLimits: session.stats.rateLimits + (updates.rateLimits ?? 0),
  };

  const updatedSession: PersistedSession = {
    ...session,
    lastActiveAt: new Date().toISOString(),
    stats: updatedStats,
  };

  // Write to cache (batched to disk every 60s)
  writeSession(updatedSession);
  return { success: true, session: updatedSession };
}

/**
 * Increment tool call counter (batched)
 */
export function incrementToolCalls(count: number = 1): SessionUpdateResult {
  return updateSessionStats({ toolCalls: count });
}

/**
 * Increment prompt call counter (batched)
 */
export function incrementPromptCalls(count: number = 1): SessionUpdateResult {
  return updateSessionStats({ promptCalls: count });
}

/**
 * Increment error counter (batched)
 */
export function incrementErrors(count: number = 1): SessionUpdateResult {
  return updateSessionStats({ errors: count });
}

/**
 * Increment rate limit counter (batched)
 */
export function incrementRateLimits(count: number = 1): SessionUpdateResult {
  return updateSessionStats({ rateLimits: count });
}

/**
 * Reset session statistics to zero
 */
export function resetSessionStats(): SessionUpdateResult {
  const session = readSession();

  if (!session) {
    return { success: false, session: null };
  }

  const updatedSession: PersistedSession = {
    ...session,
    lastActiveAt: new Date().toISOString(),
    stats: createDefaultStats(),
  };

  writeSession(updatedSession);
  return { success: true, session: updatedSession };
}

/**
 * Delete the current session (for testing or cleanup)
 * Also cleans up exit handlers to avoid listener warnings in tests
 * @returns true if session was deleted, false if it didn't exist
 */
export function deleteSession(): boolean {
  // Clear cache
  cachedSession = null;
  isDirty = false;

  // Stop flush timer and unregister handlers
  stopFlushTimer();
  unregisterExitHandlers();

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

/**
 * Reset internal state (for testing)
 * This properly cleans up all listeners to avoid MaxListenersExceededWarning
 * @internal
 */
export function _resetSessionState(): void {
  cachedSession = null;
  isDirty = false;
  stopFlushTimer();
  unregisterExitHandlers();
}
