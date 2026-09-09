import { setTimeout as delay } from 'node:timers/promises';
import type { DatabaseSync } from 'node:sqlite';
import { waitForLock } from './maintenance-session.js';
import { DEFAULT_RETRY_MS, DEFAULT_WAIT_MS } from './maintenance-stale.js';
import { cmdPreFlightIntent } from './commands/work.js';
import { emit, type EmitOptions } from './command-output.js';
import { parseBoundedSeconds, resolveAgentId, valuesFor, MAX_CLI_RETRY_INTERVAL_SECONDS, MAX_CLI_WAIT_SECONDS, type ParsedArgs } from './commands/args.js';

/** Wait outside transactions without blocking the host's event loop. */
export async function runLockCommand(db: DatabaseSync, command: string, args: ParsedArgs, dbPath: string, opts: EmitOptions, signal?: AbortSignal): Promise<number> {
  const waitMs = (parseBoundedSeconds(args, 'wait_seconds', 0, MAX_CLI_WAIT_SECONDS) ?? DEFAULT_WAIT_MS / 1000) * 1000;
  const retryMs = (parseBoundedSeconds(args, 'retry_interval', 1, MAX_CLI_RETRY_INTERVAL_SECONDS) ?? DEFAULT_RETRY_MS / 1000) * 1000;
  const started = performance.now();
  const check = () => waitForLock(db, {
    agent_id: resolveAgentId(args), target_files: valuesFor(args, 'target_file'),
    workspace_path: args['workspace'], artifact: args['artifact'], wait_ms: 0,
  });
  signal?.throwIfAborted();
  if (command === 'lock acquire') {
    // The existing handler owns validation and the atomic claim. A retry cannot
    // treat an earlier clear observation as ownership.
    const claim = () => cmdPreFlightIntent(db, args, dbPath, opts);
    const first = claim();
    if (first !== 2 || args['wait_seconds'] === undefined || waitMs === 0) return first;
    while (performance.now() - started < waitMs) {
      await delay(Math.min(retryMs, waitMs - (performance.now() - started)), undefined, { signal });
      signal?.throwIfAborted();
      if (check().lock_free) return claim();
    }
    return first;
  }
  let result = check();
  while (!result.lock_free && performance.now() - started < waitMs) {
    await delay(Math.min(retryMs, waitMs - (performance.now() - started)), undefined, { signal });
    signal?.throwIfAborted();
    result = check();
  }
  return emit({ db_path: dbPath, ...result, waited_ms: Math.floor(performance.now() - started) }, result.lock_free ? 0 : 2, opts);
}
