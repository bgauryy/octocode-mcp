/**
 * Session Storage
 *
 * Persistent session storage in ~/.octocode/session.json
 * Cross-platform support for Windows, Linux, and macOS.
 *
 * Uses batch saving to reduce disk I/O - changes are buffered in memory
 * and flushed to disk every 60 seconds or on process exit.
 */

import { randomUUID } from 'node:crypto';
import type {
  PersistedSession,
  SessionStats,
  SessionUpdateResult,
  SessionOptions,
} from './types.js';
import { deleteSessionFile } from './sessionDiskIO.js';
import {
  readSession as readSessionFromCache,
  writeSession as writeSessionToCache,
  flushSession as flushSessionFromCache,
  flushSessionSync as flushSessionSyncFromCache,
  clearCache,
  stopFlushTimer,
  unregisterExitHandlers,
  resetCacheState,
} from './sessionCache.js';

// Current schema version
const CURRENT_VERSION = 1 as const;

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
  return readSessionFromCache();
}

/**
 * Write session (to cache, batched to disk)
 * Changes are buffered and flushed every 60 seconds or on process exit.
 */
export function writeSession(session: PersistedSession): void {
  writeSessionToCache(session);
}

/**
 * Flush session to disk immediately
 * Use this when you need to ensure data is persisted (e.g., before critical operations)
 */
export function flushSession(): void {
  flushSessionFromCache();
}

/**
 * Flush session to disk synchronously (for exit handlers)
 */
export function flushSessionSync(): void {
  flushSessionSyncFromCache();
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
    writeSessionToCache(newSession);
    // Flush immediately for new sessions to ensure ID is persisted
    flushSessionFromCache();
    return newSession;
  }

  // Try to load existing session (from cache or disk)
  const existingSession = readSessionFromCache();

  if (existingSession) {
    // Update lastActiveAt timestamp
    const updatedSession: PersistedSession = {
      ...existingSession,
      lastActiveAt: new Date().toISOString(),
    };
    writeSessionToCache(updatedSession);
    // Flush immediately on first load to persist lastActiveAt
    flushSessionFromCache();
    return updatedSession;
  }

  // Create new session
  const newSession = createNewSession();
  writeSessionToCache(newSession);
  // Flush immediately for new sessions to ensure ID is persisted
  flushSessionFromCache();
  return newSession;
}

/**
 * Get the current session ID without modifying the session
 * @returns The session ID or null if no session exists
 */
export function getSessionId(): string | null {
  const session = readSessionFromCache();
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
  const session = readSessionFromCache();

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
  writeSessionToCache(updatedSession);
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
  const session = readSessionFromCache();

  if (!session) {
    return { success: false, session: null };
  }

  const updatedSession: PersistedSession = {
    ...session,
    lastActiveAt: new Date().toISOString(),
    stats: createDefaultStats(),
  };

  writeSessionToCache(updatedSession);
  return { success: true, session: updatedSession };
}

/**
 * Delete the current session (for testing or cleanup)
 * Also cleans up exit handlers to avoid listener warnings in tests
 * @returns true if session was deleted, false if it didn't exist
 */
export function deleteSession(): boolean {
  // Clear cache
  clearCache();

  // Stop flush timer and unregister handlers
  stopFlushTimer();
  unregisterExitHandlers();

  return deleteSessionFile();
}

/**
 * Reset internal state (for testing)
 * This properly cleans up all listeners to avoid MaxListenersExceededWarning
 * @internal
 */
export function _resetSessionState(): void {
  resetCacheState();
}

// Re-export SESSION_FILE constant
export { SESSION_FILE } from './sessionDiskIO.js';
