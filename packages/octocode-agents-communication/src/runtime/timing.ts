/** Monotonic heartbeat cadence shared by long-running presence loops. Durations are milliseconds. */
import { ValidationError } from './errors.js';

export const HEARTBEAT_ENV = 'OCTOCODE_COMMUNICATION_HEARTBEAT_MS';
const DEFAULT_HEARTBEAT_MS = 15000;
const MIN_HEARTBEAT_MS = 50;
const MAX_HEARTBEAT_MS = 60000;

export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;
/** How long a session lives past a write that renews it (join, resume, heartbeat default). */
export const SESSION_TTL_MS = 60000;
/** The default lease duration. */
export const LEASE_TTL_DEFAULT_MS = 60000;
/** The longest lease or heartbeat duration a caller may ask for. */
export const LEASE_TTL_MAX_MS = 600000;
/** A delivery loop renews a session that expires within this window. */
export const PRESENCE_RENEWAL_MS = 45000;

/** Wall-clock Unix time in whole milliseconds; every stored timestamp and expiry uses it. */
export function now(): number {
  return Date.now();
}

/** Monotonic milliseconds from an arbitrary origin. */
export function monotonic(): number {
  return performance.now();
}

/** Blocks the thread: the synchronous SQLite layer has no event loop to yield to. */
export function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Heartbeat period; the environment override exists so tests need not wait real periods. */
export function heartbeatMs(env: Record<string, string | undefined> = process.env): number {
  const raw = (env[HEARTBEAT_ENV] ?? '').trim();
  if (!raw) return DEFAULT_HEARTBEAT_MS;
  if (!/^[0-9]+$/.test(raw) || Number(raw) < MIN_HEARTBEAT_MS || Number(raw) > MAX_HEARTBEAT_MS)
    throw new ValidationError(`${HEARTBEAT_ENV} must be an integer from ${MIN_HEARTBEAT_MS} to ${MAX_HEARTBEAT_MS}`);
  return Number(raw);
}

/** Monotonic deadline for an optional duration, or null when unbounded. */
export function deadlineAfter(durationMs: number | null | undefined): number | null {
  return durationMs == null ? null : monotonic() + durationMs;
}

/** What a stop event exposes; an AbortSignal satisfies it. */
export interface Stop {
  readonly aborted: boolean;
}

/** True until the stop event fires or the optional monotonic deadline passes. */
export function running(stop: Stop, deadline: number | null): boolean {
  return !stop.aborted && (deadline === null || monotonic() < deadline);
}

/**
 * Runs a beat once per heartbeat period, measured from the end of the previous beat. The period counts on both clocks:
 * the monotonic clock may stand still across a suspend (Linux) while the wall-clock TTL of the session keeps running,
 * so a beat is due when either clock has advanced a full period; a wake is thus noticed at once.
 */
export class Heartbeat {
  readonly interval = heartbeatMs();
  private last = 0;
  private lastWall = 0;

  constructor(private readonly beat: () => void, dueNow = false) {
    this.reset();
    if (dueNow) this.last = this.lastWall = -Infinity;
  }

  reset(): void {
    this.last = monotonic();
    this.lastWall = now();
  }

  tick(force = false): boolean {
    if (force || monotonic() - this.last >= this.interval || now() - this.lastWall >= this.interval) {
      this.beat();
      this.reset();
      return true;
    }
    return false;
  }
}
