/**
 * Session Context
 *
 * Simple module to track the current session ID for use by tools.
 * This allows background tasks to be associated with their parent session.
 */

import { nanoid } from 'nanoid';

let currentSessionId: string | null = null;

/**
 * Get the current session ID.
 * If no session is active, generates a unique ID for this process.
 */
export function getCurrentSessionId(): string {
  if (!currentSessionId) {
    // Generate a process-unique ID if no session is set
    currentSessionId = `session_${nanoid(8)}`;
  }
  return currentSessionId;
}

/**
 * Set the current session ID.
 * Call this when starting a new session.
 */
export function setCurrentSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * Clear the current session ID.
 * Call this when a session ends.
 */
export function clearCurrentSessionId(): void {
  currentSessionId = null;
}

/**
 * Check if a session is currently active.
 */
export function hasActiveSession(): boolean {
  return currentSessionId !== null;
}
