/**
 * Session Module
 *
 * Persistent session management for Octocode packages.
 * Stores session data in ~/.octocode/session.json with cross-platform support.
 */

// Types
export type {
  PersistedSession,
  SessionStats,
  SessionUpdateResult,
  SessionOptions,
} from './types.js';

// Storage constants
export { SESSION_FILE } from './storage.js';

// Core operations
export {
  readSession,
  writeSession,
  getOrCreateSession,
  getSessionId,
  deleteSession,
  flushSession,
  flushSessionSync,
} from './storage.js';

// Stats operations
export {
  updateSessionStats,
  incrementToolCalls,
  incrementPromptCalls,
  incrementErrors,
  incrementRateLimits,
  resetSessionStats,
} from './storage.js';

// Testing utilities
export { _resetSessionState } from './storage.js';

