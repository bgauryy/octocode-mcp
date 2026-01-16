/**
 * Context propagation middleware for research sessions.
 * Tracks tool chains and provides session-aware hints.
 *
 * Note: The full contextPropagation middleware, getContext, getContextualHints,
 * getActiveSessions, and clearAllContexts functions were removed as they were
 * dead code (exported but never used in the application).
 *
 * @module middleware/contextPropagation
 */

import { agentLog } from '../utils/colors.js';

interface ResearchContext {
  sessionId: string;
  mainGoal: string;
  toolChain: string[];
  startTime: number;
  lastActivity: number;
}

const CONFIG = {
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
};

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the context cleanup interval.
 * Safe to call multiple times (idempotent).
 */
function startContextCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    // Cleanup logic placeholder - currently just logs
    console.log(agentLog('🧹 Context cleanup tick'));
  }, CONFIG.cleanupIntervalMs);
}

/**
 * Stop the context cleanup interval.
 * Called during graceful shutdown.
 */
export function stopContextCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Start cleanup on module load
startContextCleanup();
