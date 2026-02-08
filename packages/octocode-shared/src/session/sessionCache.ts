/**
 * Session Cache
 *
 * In-memory session cache management with batch saving.
 * Handles flush timer and exit handlers for safe persistence.
 */

import type { PersistedSession } from './types.js';
import { writeSessionToDisk, readSessionFromDisk } from './sessionDiskIO.js';

// Batch save interval (60 seconds)
const FLUSH_INTERVAL_MS = 60_000;

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

/** Guard flag to prevent re-entrant flushes from rapid signal delivery */
let isFlushing = false;

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
  process.on('SIGINT', sigintListener);
  process.on('SIGTERM', sigtermListener);
}

/**
 * Unregister exit handlers (for testing only)
 * @internal
 */
export function unregisterExitHandlers(): void {
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
export function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
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
  if (isFlushing) return;
  if (isDirty && cachedSession) {
    isFlushing = true;
    try {
      writeSessionToDisk(cachedSession);
      isDirty = false;
    } catch {
      // Best effort - don't throw on exit
    } finally {
      isFlushing = false;
    }
  }
}

/**
 * Clear cache state
 */
export function clearCache(): void {
  cachedSession = null;
  isDirty = false;
  isFlushing = false;
}

/**
 * Reset internal state (for testing)
 * This properly cleans up all listeners to avoid MaxListenersExceededWarning
 * @internal
 */
export function resetCacheState(): void {
  clearCache();
  stopFlushTimer();
  unregisterExitHandlers();
}
