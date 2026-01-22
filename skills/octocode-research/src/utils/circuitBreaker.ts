import { agentLog, warnLog, successLog, errorLog } from './colors.js';
import { logRateLimit } from '../index.js';
import { fireAndForgetWithTimeout } from './asyncTimeout.js';
/**
 * Circuit breaker pattern for LSP and external services.
 *
 * Prevents cascading failures by temporarily stopping calls to failing services.
 *
 * @module utils/circuitBreaker
 */

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Memory management constants
 */
const MAX_CIRCUITS = 100; // Maximum number of circuits to prevent unbounded growth
const CIRCUIT_TTL_MS = 3600000; // 1 hour TTL for stale circuits
const CLEANUP_INTERVAL_MS = 600000; // 10 minutes between cleanup runs

interface CircuitRecord {
  failures: number;
  successes: number;
  lastFailure: number;
  lastAttempt: number;
  state: CircuitState;
  createdAt: number; // Timestamp when circuit was created
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Number of successes in half-open to close circuit */
  successThreshold: number;
  /** Time in ms before attempting half-open */
  resetTimeoutMs: number;
}

/**
 * Default circuit breaker configuration.
 * Tuned for balance between fault tolerance and quick recovery.
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  // 3 failures: Quick to detect persistent issues,
  // but tolerant of occasional transient errors.
  failureThreshold: 3,

  // 2 successes: Requires service to prove stability
  // before fully resuming (prevents flapping).
  successThreshold: 2,

  // 30s timeout: Allows services time to recover from
  // rate limits or temporary outages before retrying.
  resetTimeoutMs: 30000,
};

/**
 * Circuit breaker registry
 */
const circuits = new Map<string, CircuitRecord>();
const configs = new Map<string, CircuitBreakerConfig>();

/**
 * Get or create circuit breaker for a named service.
 * Enforces MAX_CIRCUITS limit by cleaning up stale circuits when limit is reached.
 */
function getCircuit(name: string): CircuitRecord {
  if (!circuits.has(name)) {
    // Enforce circuit limit by cleaning up stale circuits
    if (circuits.size >= MAX_CIRCUITS) {
      cleanupStaleCircuits();
      // If still at limit after cleanup, remove oldest circuit
      if (circuits.size >= MAX_CIRCUITS) {
        const oldestKey = findOldestCircuit();
        if (oldestKey) {
          circuits.delete(oldestKey);
          configs.delete(oldestKey);
          console.log(warnLog(`⚠️ Evicted oldest circuit '${oldestKey}' to make room`));
        }
      }
    }

    circuits.set(name, {
      failures: 0,
      successes: 0,
      lastFailure: 0,
      lastAttempt: 0,
      state: 'closed',
      createdAt: Date.now(),
    });
  }
  return circuits.get(name)!;
}

/**
 * Find the oldest circuit by lastAttempt time
 */
function findOldestCircuit(): string | null {
  let oldest: string | null = null;
  let oldestTime = Infinity;

  for (const [name, circuit] of circuits) {
    if (circuit.lastAttempt < oldestTime) {
      oldestTime = circuit.lastAttempt;
      oldest = name;
    }
  }

  return oldest;
}

/**
 * Get configuration for a circuit
 */
function getConfig(name: string): CircuitBreakerConfig {
  return configs.get(name) || DEFAULT_CONFIG;
}

/**
 * Configure a specific circuit breaker
 */
export function configureCircuit(
  name: string,
  config: Partial<CircuitBreakerConfig>
): void {
  configs.set(name, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Execute operation with circuit breaker protection.
 *
 * @param name - Circuit breaker name (e.g., 'lsp', 'github')
 * @param operation - Async operation to execute
 * @param fallback - Optional fallback when circuit is open
 * @returns Operation result or fallback
 * @throws CircuitOpenError if circuit is open and no fallback provided
 *
 * @example
 * ```typescript
 * const result = await withCircuitBreaker(
 *   'lsp',
 *   () => lspGotoDefinition({ queries }),
 *   () => ({ fallback: true, locations: [] })
 * );
 * ```
 */
export async function withCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  fallback?: () => T | Promise<T>
): Promise<T> {
  const circuit = getCircuit(name);
  const config = getConfig(name);
  const now = Date.now();

  // Update last attempt time
  circuit.lastAttempt = now;

  // Check circuit state
  if (circuit.state === 'open') {
    // Check if we should try half-open
    if (now - circuit.lastFailure > config.resetTimeoutMs) {
      circuit.state = 'half-open';
      console.log(warnLog(`🟡 Circuit ${name} entering half-open state`));
    } else {
      // Circuit is open - use fallback or throw
      console.log(
        `🔴 Circuit ${name} is OPEN - ${Math.ceil((circuit.lastFailure + config.resetTimeoutMs - now) / 1000)}s until retry`
      );
      if (fallback) {
        return fallback();
      }
      throw new CircuitOpenError(name, circuit.lastFailure + config.resetTimeoutMs - now);
    }
  }

  try {
    const result = await operation();

    // Success - handle state transition
    if (circuit.state === 'half-open') {
      circuit.successes++;
      if (circuit.successes >= config.successThreshold) {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.successes = 0;
        console.log(successLog(`🟢 Circuit ${name} CLOSED after recovery`));
      }
    } else {
      // Reset failures on success in closed state
      circuit.failures = 0;
    }

    return result;
  } catch (error) {
    // Failure - handle state transition
    circuit.failures++;
    circuit.lastFailure = now;
    circuit.successes = 0;

    if (circuit.state === 'half-open') {
      // Failed in half-open - back to open
      circuit.state = 'open';
      console.log(errorLog(`🔴 Circuit ${name} back to OPEN after half-open failure`));
      // Log rate limit/circuit open event to session telemetry
      fireAndForgetWithTimeout(
        () => logRateLimit({
          limit_type: 'secondary',
          api_method: 'circuit_breaker',
          retry_after_seconds: config.resetTimeoutMs / 1000,
          details: `Circuit '${name}' back to OPEN after half-open failure`
        }),
        5000,
        'logRateLimit'
      );
    } else if (circuit.failures >= config.failureThreshold) {
      // Too many failures - open circuit
      circuit.state = 'open';
      console.log(
        `🔴 Circuit ${name} OPENED after ${circuit.failures} failures`
      );
      // Log rate limit/circuit open event to session telemetry
      fireAndForgetWithTimeout(
        () => logRateLimit({
          limit_type: 'secondary',
          api_method: 'circuit_breaker',
          retry_after_seconds: config.resetTimeoutMs / 1000,
          details: `Circuit '${name}' OPENED after ${circuit.failures} failures`
        }),
        5000,
        'logRateLimit'
      );
    }

    throw error;
  }
}

/**
 * Get current state of a circuit breaker
 */
export function getCircuitState(name: string): {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  isHealthy: boolean;
} {
  const circuit = getCircuit(name);
  return {
    state: circuit.state,
    failures: circuit.failures,
    lastFailure: circuit.lastFailure,
    isHealthy: circuit.state === 'closed',
  };
}

/**
 * Reset a circuit breaker to closed state
 */
export function resetCircuit(name: string): void {
  const circuit = getCircuit(name);
  circuit.state = 'closed';
  circuit.failures = 0;
  circuit.successes = 0;
  circuit.lastFailure = 0;
  console.log(agentLog(`🔄 Circuit ${name} manually reset to CLOSED`));
}

/**
 * Get all circuit states (for health endpoint)
 */
export function getAllCircuitStates(): Record<
  string,
  { state: CircuitState; failures: number; isHealthy: boolean }
> {
  const states: Record<
    string,
    { state: CircuitState; failures: number; isHealthy: boolean }
  > = {};

  for (const [name, circuit] of circuits) {
    states[name] = {
      state: circuit.state,
      failures: circuit.failures,
      isHealthy: circuit.state === 'closed',
    };
  }

  return states;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  readonly retryAfterMs: number;

  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker '${name}' is open. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
    this.retryAfterMs = retryAfterMs;
  }
}

// =============================================================================
// Pre-configured circuits (per-tool granularity)
// =============================================================================

// -----------------------------------------------------------------------------
// GitHub circuits - split by API endpoint (different rate limits)
// -----------------------------------------------------------------------------

// GitHub Search API - aggressive rate limiting (30 req/min)
configureCircuit('github:search', {
  failureThreshold: 2,     // 2 failures = likely rate limited
  successThreshold: 1,     // Single success proves API recovered
  resetTimeoutMs: 60000,   // 60s: Give search rate limits time to reset
});

// GitHub Content API - higher limits, separate quota
configureCircuit('github:content', {
  failureThreshold: 3,     // 3 failures = more tolerant
  successThreshold: 1,
  resetTimeoutMs: 30000,   // 30s: Content API recovers faster
});

// GitHub PR API - separate quota from search
configureCircuit('github:pulls', {
  failureThreshold: 2,     // 2 failures = likely rate limited
  successThreshold: 1,
  resetTimeoutMs: 60000,   // 60s: PR API has similar limits to search
});

// Legacy fallback for any uncategorized github tools
configureCircuit('github', {
  failureThreshold: 2,
  successThreshold: 1,
  resetTimeoutMs: 60000,
});

// -----------------------------------------------------------------------------
// LSP circuits - split by operation weight
// -----------------------------------------------------------------------------

// LSP Navigation (definition, references) - fast, single lookup
configureCircuit('lsp:navigation', {
  failureThreshold: 3,     // 3 failures = likely LSP issue
  successThreshold: 1,     // Single success proves LSP recovered
  resetTimeoutMs: 10000,   // 10s: Quick recovery expected
});

// LSP Call Hierarchy - heavier recursive operation
configureCircuit('lsp:hierarchy', {
  failureThreshold: 2,     // 2 failures = operation too heavy or LSP struggling
  successThreshold: 1,
  resetTimeoutMs: 15000,   // 15s: Slightly longer for heavy ops
});

// Legacy fallback
configureCircuit('lsp', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 10000,
});

// -----------------------------------------------------------------------------
// Local circuits - unified (same failure mode: filesystem)
// -----------------------------------------------------------------------------

configureCircuit('local', {
  failureThreshold: 5,     // 5 failures = likely persistent issue
  successThreshold: 1,     // Single success proves local ops recovered
  resetTimeoutMs: 5000,    // 5s: Local ops should recover quickly
});

// -----------------------------------------------------------------------------
// Package circuits - unified (npm/PyPI)
// -----------------------------------------------------------------------------

configureCircuit('package', {
  failureThreshold: 3,     // 3 failures = likely rate limited or down
  successThreshold: 1,     // Single success proves API recovered
  resetTimeoutMs: 45000,   // 45s: Slightly faster than GitHub
});

// =============================================================================
// Automatic Cleanup (Memory Leak Prevention)
// =============================================================================

/**
 * Cleanup interval reference (for graceful shutdown)
 */
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Remove stale circuits that haven't been used recently.
 * A circuit is stale if it hasn't been attempted in CIRCUIT_TTL_MS.
 */
function cleanupStaleCircuits(): void {
  const now = Date.now();
  const staleCutoff = now - CIRCUIT_TTL_MS;
  let removedCount = 0;

  for (const [name, circuit] of circuits) {
    // Don't remove circuits that are currently open (still tracking failure)
    if (circuit.state !== 'open' && circuit.lastAttempt < staleCutoff) {
      circuits.delete(name);
      configs.delete(name);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(agentLog(`🧹 Cleaned up ${removedCount} stale circuit(s)`));
  }
}

/**
 * Start the periodic cleanup interval.
 * Called automatically on module load.
 */
function startPeriodicCleanup(): void {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(() => {
    cleanupStaleCircuits();
  }, CLEANUP_INTERVAL_MS);

  // Unref the interval so it doesn't prevent process exit
  if (cleanupIntervalId.unref) {
    cleanupIntervalId.unref();
  }
}

/**
 * Stop the periodic cleanup interval.
 * Call during graceful shutdown.
 */
export function stopCircuitCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Start periodic cleanup on module load
startPeriodicCleanup();

// =============================================================================
// Manual Cleanup Functions
// =============================================================================

/**
 * Clear a specific circuit breaker.
 * Use for testing or when a service is decommissioned.
 * @param name - Circuit breaker name to clear
 * @returns true if circuit existed and was cleared
 */
export function clearCircuit(name: string): boolean {
  const existed = circuits.delete(name);
  configs.delete(name);
  if (existed) {
    console.log(agentLog(`🧹 Circuit ${name} cleared`));
  }
  return existed;
}

/**
 * Clear all circuit breakers.
 * Use for testing cleanup or server shutdown.
 */
export function clearAllCircuits(): void {
  const count = circuits.size;
  circuits.clear();
  configs.clear();
  console.log(agentLog(`🧹 Cleared ${count} circuit(s)`));
}

/**
 * Get the number of active circuits (for monitoring).
 */
export function getCircuitCount(): number {
  return circuits.size;
}
