/**
 * Progress-aware agent wait: liveness probe, silence watchdog, absolute cap, abort signal.
 *
 * Depends on: types, registry, ledger, process (for sendRpc).
 * No imports from kill or agent-tools.
 *
 * Invariant: silenceTimer, absoluteTimer, armSilence closure, and probeController
 * all live inside one Promise constructor — they must stay co-located here.
 */
import type { AgentRecord, WaitOptions, WaitOutcome } from './types.js';
import { isTerminal, isProcessAlive } from './registry.js';
import { sendRpc } from './process.js';

const DEFAULT_WAIT_MAX_SILENCE_MS = 120_000;
const DEFAULT_PROBE_GRACE_MS = 4_000;

/**
 * Actively confirm a quiet worker is alive by sending a `get_state` RPC and
 * awaiting its correlated `response` (pi RPC echoes the request id). Resolves
 * true if the child answers within graceMs, false if it stays silent or the
 * pipe is dead — distinguishing "alive but mid-generation" from "hung/crashed".
 *
 * Invariant: sets `record.pendingProbes.set(id, resolve)`; processRpcLine in
 * process.ts resolves it via the record field — cross-module via record field, no cycle.
 */
function probeWorkerAlive(record: AgentRecord, graceMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || !isProcessAlive(record)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const probeId = `${record.id}-probe-${record.nextRequestId++}`;
    let settled = false;
    const finish = (alive: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      record.pendingProbes.delete(probeId);
      resolve(alive);
    };
    const onAbort = () => finish(false);
    record.pendingProbes.set(probeId, () => finish(true));
    const timer = setTimeout(() => finish(false), graceMs);
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });
    // get_state is a cheap read-only query; the child answers with a `response`
    // carrying probeId, which processRpcLine routes back to finish(true).
    if (!sendRpc(record, { type: 'get_state' }, probeId)) finish(false);
  });
}

/**
 * Progress-aware wait. Instead of a rigid wall-clock deadline that errors while
 * the worker is healthily churning, this resolves (never rejects) when the turn
 * ends, OR when the worker has been silent past maxSilenceMs AND a liveness probe
 * can't confirm it is still alive-and-quiet. Every inbound event resets the
 * silence watchdog, so long-but-active turns run to completion.
 *
 * Invariant: silenceTimer, absoluteTimer, armSilence closure, and probeController
 * all in one Promise constructor — must stay co-located.
 */
export function waitForAgent(record: AgentRecord, options: WaitOptions = {}): Promise<WaitOutcome> {
  const maxSilenceMs = options.maxSilenceMs ?? DEFAULT_WAIT_MAX_SILENCE_MS;
  const probeGraceMs = options.probeGraceMs ?? DEFAULT_PROBE_GRACE_MS;
  const probeEnabled = options.probe ?? true;
  const abortError = () => new DOMException('Agent wait aborted', 'AbortError');

  if (options.signal?.aborted) return Promise.reject(abortError());

  if (isTerminal(record)) {
    return Promise.resolve({ reason: 'terminal', stillRunning: false, probedAlive: false });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let silenceTimer: ReturnType<typeof setTimeout>;
    let absoluteTimer: ReturnType<typeof setTimeout> | undefined;
    const probeController = new AbortController();

    const cleanup = () => {
      clearTimeout(silenceTimer);
      if (absoluteTimer) clearTimeout(absoluteTimer);
      record.waiters.delete(onTerminal);
      record.activityListeners.delete(onActivity);
      options.signal?.removeEventListener('abort', onAbort);
      probeController.abort();
    };
    const settle = (outcome: WaitOutcome) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(outcome);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };

    const armSilence = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(onSilence, maxSilenceMs);
      silenceTimer.unref?.();
    };

    const onTerminal = () => settle({ reason: 'terminal', stillRunning: false, probedAlive: false });

    const onActivity = () => {
      if (settled) return;
      // Terminal transitions also touch(); if this event flipped us terminal,
      // resolve as done rather than re-arming.
      if (isTerminal(record)) onTerminal();
      else armSilence();
    };

    const onSilence = () => {
      if (settled) return;
      if (isTerminal(record)) { onTerminal(); return; }
      if (!probeEnabled) {
        settle({ reason: 'idle', stillRunning: true, probedAlive: false });
        return;
      }
      void probeWorkerAlive(record, probeGraceMs, probeController.signal).then((alive) => {
        if (settled) return;
        if (isTerminal(record)) { onTerminal(); return; }
        // Alive-but-quiet or hung/dead: either way hand a truthful snapshot back
        // to the caller (no error). Callers that need the final result loop until
        // reason:'terminal'; probedAlive tells them whether it's worth waiting more.
        settle({ reason: 'idle', stillRunning: !isTerminal(record), probedAlive: alive });
      });
    };

    record.waiters.add(onTerminal);
    record.activityListeners.add(onActivity);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    armSilence();

    if (options.absoluteCapMs && options.absoluteCapMs > 0) {
      absoluteTimer = setTimeout(() => {
        settle({ reason: 'cap', stillRunning: !isTerminal(record), probedAlive: isProcessAlive(record) });
      }, options.absoluteCapMs);
      absoluteTimer.unref?.();
    }
  });
}

/**
 * Block until the worker's turn genuinely finishes, transparently riding out
 * quiet-but-alive gaps. Loops the progress-aware waitForAgent, continuing while
 * the worker is idle-but-probe-alive, and stops on terminal, on a confirmed hang
 * (probe failed / process gone), or when the absolute cap is hit. Used by the
 * internal single-shot callers that need the final output, not a live snapshot.
 */
export async function waitForAgentTurn(
  record: AgentRecord,
  opts: { maxSilenceMs?: number; absoluteCapMs?: number; signal?: AbortSignal } = {},
): Promise<WaitOutcome> {
  const startedAt = record.updatedAt;
  const absoluteCapMs = opts.absoluteCapMs;
  let outcome: WaitOutcome;
  do {
    const remaining = absoluteCapMs ? Math.max(1, absoluteCapMs - (Date.now() - startedAt)) : undefined;
    outcome = await waitForAgent(record, {
      maxSilenceMs: opts.maxSilenceMs,
      absoluteCapMs: remaining,
      signal: opts.signal,
    });
    if (outcome.reason === 'terminal' || outcome.reason === 'cap') break;
    // reason:'idle' — keep waiting only if the worker is still alive-and-quiet.
    if (!outcome.probedAlive || !isProcessAlive(record)) break;
  } while (!isTerminal(record));
  return outcome;
}
