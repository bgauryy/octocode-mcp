/**
 * GitHub API rate limit tracking and management.
 *
 * @module utils/rateLimitHandler
 */

/**
 * Rate limit state for a service
 */
interface RateLimitState {
  remaining: number;
  limit: number;
  reset: Date;
  used: number;
  isLimited: boolean;
  lastUpdated: number;
}

/**
 * Rate limit thresholds
 */
const THRESHOLDS = {
  /** Warn when remaining falls below this */
  warnBelow: 100,
  /** Consider limited when remaining falls below this */
  limitBelow: 10,
  /** Pause requests when remaining falls below this */
  pauseBelow: 5,
};

/**
 * Rate limit state store
 */
const rateLimitStates = new Map<string, RateLimitState>();

/**
 * Default state for new services
 */
function createDefaultState(): RateLimitState {
  return {
    remaining: 5000,
    limit: 5000,
    reset: new Date(Date.now() + 3600000),
    used: 0,
    isLimited: false,
    lastUpdated: 0,
  };
}

/**
 * Get or create rate limit state for a service
 */
function getState(service: string): RateLimitState {
  if (!rateLimitStates.has(service)) {
    rateLimitStates.set(service, createDefaultState());
  }
  return rateLimitStates.get(service)!;
}

/**
 * Update rate limit state from response headers.
 *
 * @param service - Service name (e.g., 'github')
 * @param headers - Response headers containing rate limit info
 *
 * @example
 * ```typescript
 * updateRateLimitFromHeaders('github', {
 *   'x-ratelimit-remaining': '4500',
 *   'x-ratelimit-limit': '5000',
 *   'x-ratelimit-reset': '1705320000',
 *   'x-ratelimit-used': '500'
 * });
 * ```
 */
export function updateRateLimitFromHeaders(
  service: string,
  headers: Record<string, string | undefined>
): void {
  const state = getState(service);

  if (headers['x-ratelimit-remaining']) {
    state.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
  }

  if (headers['x-ratelimit-limit']) {
    state.limit = parseInt(headers['x-ratelimit-limit'], 10);
  }

  if (headers['x-ratelimit-reset']) {
    state.reset = new Date(parseInt(headers['x-ratelimit-reset'], 10) * 1000);
  }

  if (headers['x-ratelimit-used']) {
    state.used = parseInt(headers['x-ratelimit-used'], 10);
  }

  state.isLimited = state.remaining < THRESHOLDS.limitBelow;
  state.lastUpdated = Date.now();

  // Log warnings
  if (state.remaining < THRESHOLDS.warnBelow && state.remaining >= THRESHOLDS.limitBelow) {
    console.log(`⚠️ ${service} rate limit warning: ${state.remaining} remaining`);
  } else if (state.isLimited) {
    console.log(`🔴 ${service} rate limit critical: ${state.remaining} remaining`);
  }
}

/**
 * Wait if rate limited, with timeout protection.
 *
 * @param service - Service to check
 * @param maxWaitMs - Maximum time to wait (default: 60s)
 * @returns True if waited, false if no wait needed
 */
export async function waitForRateLimit(
  service: string,
  maxWaitMs: number = 60000
): Promise<boolean> {
  const state = getState(service);

  if (!state.isLimited) {
    return false;
  }

  const waitMs = Math.max(0, state.reset.getTime() - Date.now());

  if (waitMs <= 0) {
    // Reset time has passed, clear the limit
    state.isLimited = false;
    return false;
  }

  if (waitMs > maxWaitMs) {
    console.log(
      `⏳ ${service} rate limited for ${Math.ceil(waitMs / 1000)}s (exceeds max wait of ${maxWaitMs / 1000}s)`
    );
    // Don't wait, let the caller handle it
    return false;
  }

  console.log(`⏳ ${service} rate limited - waiting ${Math.ceil(waitMs / 1000)}s`);
  await sleep(waitMs + 1000); // Add 1s buffer

  // Clear limit after wait
  state.isLimited = false;
  return true;
}

/**
 * Check if a service is currently rate limited.
 */
export function isRateLimited(service: string): boolean {
  const state = getState(service);
  return state.isLimited || state.remaining < THRESHOLDS.pauseBelow;
}

/**
 * Get rate limit status for a service.
 */
export function getRateLimitStatus(service: string): {
  remaining: number;
  limit: number;
  resetIn: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'critical' | 'limited';
} {
  const state = getState(service);
  const resetIn = Math.max(0, state.reset.getTime() - Date.now());
  const percentUsed = state.limit > 0 ? ((state.limit - state.remaining) / state.limit) * 100 : 0;

  let status: 'ok' | 'warning' | 'critical' | 'limited';
  if (state.remaining < THRESHOLDS.pauseBelow) {
    status = 'limited';
  } else if (state.remaining < THRESHOLDS.limitBelow) {
    status = 'critical';
  } else if (state.remaining < THRESHOLDS.warnBelow) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return {
    remaining: state.remaining,
    limit: state.limit,
    resetIn,
    percentUsed,
    status,
  };
}

/**
 * Get rate limit hints for response.
 */
export function getRateLimitHints(service: string): string[] {
  const status = getRateLimitStatus(service);
  const hints: string[] = [];

  if (status.status === 'limited') {
    hints.push(
      `🔴 ${service} rate limit exhausted - resets in ${Math.ceil(status.resetIn / 1000)}s`
    );
    hints.push('Consider using /local/* tools instead');
  } else if (status.status === 'critical') {
    hints.push(
      `⚠️ ${service} rate limit critical: ${status.remaining} remaining (${status.percentUsed.toFixed(0)}% used)`
    );
  } else if (status.status === 'warning') {
    hints.push(
      `${service} rate limit: ${status.remaining}/${status.limit} remaining`
    );
  }

  return hints;
}

/**
 * Get all rate limit states (for health/debug endpoints)
 */
export function getAllRateLimitStates(): Record<
  string,
  ReturnType<typeof getRateLimitStatus>
> {
  const states: Record<string, ReturnType<typeof getRateLimitStatus>> = {};

  for (const service of rateLimitStates.keys()) {
    states[service] = getRateLimitStatus(service);
  }

  return states;
}

/**
 * Manually set rate limit state (for testing or manual override)
 */
export function setRateLimitState(
  service: string,
  state: Partial<RateLimitState>
): void {
  const current = getState(service);
  Object.assign(current, state);
  current.lastUpdated = Date.now();
}

// =============================================================================
// Utilities
// =============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
