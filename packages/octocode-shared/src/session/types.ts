/**
 * Session Types
 *
 * Types for session persistence across octocode packages.
 */

/**
 * Session statistics tracking
 */
export interface SessionStats {
  toolCalls: number;
  promptCalls: number;
  errors: number;
  rateLimits: number;
}

/**
 * Persisted session data stored in ~/.octocode/session.json
 */
export interface PersistedSession {
  /** Schema version for future migrations */
  version: 1;
  /** Unique session identifier (UUID) */
  sessionId: string;
  /** When the session was first created */
  createdAt: string;
  /** Last time the session was active (updated on init) */
  lastActiveAt: string;
  /** Cumulative session statistics */
  stats: SessionStats;
}

/**
 * Result from updating session stats
 */
export interface SessionUpdateResult {
  success: boolean;
  session: PersistedSession | null;
}

/**
 * Options for creating/loading a session
 */
export interface SessionOptions {
  /** Force create a new session even if one exists */
  forceNew?: boolean;
}

