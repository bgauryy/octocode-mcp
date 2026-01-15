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

interface CircuitRecord {
  failures: number;
  successes: number;
  lastFailure: number;
  lastAttempt: number;
  state: CircuitState;
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

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeoutMs: 30000,
};

/**
 * Circuit breaker registry
 */
const circuits = new Map<string, CircuitRecord>();
const configs = new Map<string, CircuitBreakerConfig>();

/**
 * Get or create circuit breaker for a named service
 */
function getCircuit(name: string): CircuitRecord {
  if (!circuits.has(name)) {
    circuits.set(name, {
      failures: 0,
      successes: 0,
      lastFailure: 0,
      lastAttempt: 0,
      state: 'closed',
    });
  }
  return circuits.get(name)!;
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
      console.log(`🟡 Circuit ${name} entering half-open state`);
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
        console.log(`🟢 Circuit ${name} CLOSED after recovery`);
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
      console.log(`🔴 Circuit ${name} back to OPEN after half-open failure`);
    } else if (circuit.failures >= config.failureThreshold) {
      // Too many failures - open circuit
      circuit.state = 'open';
      console.log(
        `🔴 Circuit ${name} OPENED after ${circuit.failures} failures`
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
  console.log(`🔄 Circuit ${name} manually reset to CLOSED`);
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
// Pre-configured circuits
// =============================================================================

// Configure LSP circuit with faster recovery (LSP often just needs warm-up)
configureCircuit('lsp', {
  failureThreshold: 3,
  successThreshold: 1,
  resetTimeoutMs: 10000, // 10s
});

// Configure GitHub circuit with longer timeout (rate limits)
configureCircuit('github', {
  failureThreshold: 2,
  successThreshold: 1,
  resetTimeoutMs: 60000, // 60s
});
