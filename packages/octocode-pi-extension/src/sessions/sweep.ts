import fs from 'node:fs';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { runningPid } from '../agentdb/liveness.js';
import { CLEANUP_DAYS_ENV, envInt } from '../shared/env.js';
import { PID_SESSION_PREFIX, sessionDirName, sessionsRoot, sweepStaleOutputs } from '../shared/home.js';
import { processAlive } from '../shared/process.js';
import { shotsDir } from '../subagents/screenshots.js';
import type { SessionIndex } from './store.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The sweep runs at most this often across all sessions (meta `last_sweep`). */
const SWEEP_EVERY_MS = 6 * HOUR;
/** A folder whose session Pi no longer lists (deleted, ephemeral, a subagent's) is removed this long after its last write. */
const ORPHAN_MS = 7 * DAY;
/** A pid folder (a session-less process) is removed this long after its process died. */
const EPHEMERAL_MS = DAY;
/** Spilled output, bash logs, idle checkpoints of a kept session and subagent screenshots are removed this many days after they were last written (`OCTOCODE_CLEANUP_DAYS`). */
const OUTPUT_DAYS = 30;

/** Ids of every session Pi has a file for. */
const piSessionIds = async (): Promise<Set<string>> => new Set((await SessionManager.listAll()).map((info) => info.id));

/** Newest write in a session folder: the folder, its kind folders and the checkpoint journal. 0 when it is missing. */
function lastWrite(dir: string): number {
  let newest = 0;
  for (const file of [dir, path.join(dir, 'output'), path.join(dir, 'bash'), path.join(dir, 'checkpoints'), path.join(dir, 'checkpoints', 'journal.jsonl')]) {
    try {
      newest = Math.max(newest, fs.statSync(file).mtimeMs);
    } catch {
      // Not there.
    }
  }
  return newest;
}

/** Whether a session's checkpoints (journal, blobs) were last written more than `maxAgeMs` ago; false when there are none. */
function checkpointsIdle(dir: string, maxAgeMs: number, now: number): boolean {
  let newest = 0;
  for (const file of [dir, path.join(dir, 'journal.jsonl'), path.join(dir, 'blobs')]) {
    try {
      newest = Math.max(newest, fs.statSync(file).mtimeMs);
    } catch {
      // Not there.
    }
  }
  return newest > 0 && now - newest > maxAgeMs;
}

const remove = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

/**
 * Removes Octocode data of sessions that are gone, at most once per `SWEEP_EVERY_MS` (unless `force`): the folder and
 * extras of a session Pi no longer lists, a week after its last write, unless its process is still running; a pid
 * folder a day after its process died; and output and bash logs of the sessions kept, checkpoints of a kept session nothing wrote to,
 * and subagent screenshots older than `OCTOCODE_CLEANUP_DAYS` (default 30; `0` turns the sweep off). The current session and Pi's own session files are never touched. When Pi's
 * listing fails nothing is removed. Returns the folder names removed. Never rejects.
 */
export async function sweepSessions(
  index: SessionIndex,
  current: string | undefined,
  options: { now?: number; force?: boolean; env?: NodeJS.ProcessEnv; listed?: () => Promise<Set<string>> } = {},
): Promise<string[]> {
  const now = options.now ?? Date.now();
  const env = options.env ?? process.env;
  const removed: string[] = [];
  const days = envInt(env, CLEANUP_DAYS_ENV, OUTPUT_DAYS, { min: 0 });
  if (days === 0) return removed;
  const outputMs = days * DAY;
  try {
    const last = Number(index.meta('last_sweep') ?? 0);
    if (!options.force && now - last < SWEEP_EVERY_MS) return removed;
    // Claimed before the work, so concurrent session starts do not sweep twice; a failed listing gives the claim back.
    index.setMeta('last_sweep', String(now));
    let ids: Set<string>;
    try {
      ids = await (options.listed ?? piSessionIds)();
    } catch {
      index.setMeta('last_sweep', String(last));
      return removed;
    }
    const listed = new Set([...ids].map(sessionDirName));
    const extras = new Map(index.all().map((row) => [sessionDirName(row.id), row]));
    const currentName = current ? sessionDirName(current) : undefined;
    const keep = new Set<string>(currentName ? [currentName] : []);
    const root = sessionsRoot(env);
    let names: string[] = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      // No session folders yet.
    }
    for (const name of names) {
      if (keep.has(name)) continue;
      const dir = path.join(root, name);
      const extra = extras.get(name);
      const pid = name.startsWith(PID_SESSION_PREFIX) ? Number(name.slice(PID_SESSION_PREFIX.length)) : undefined;
      const stale =
        pid !== undefined
          // A `_pid-<n>` folder names its process; no session row (or team row) exists for a session-less process.
          ? pid !== process.pid && !processAlive(pid) && now - lastWrite(dir) > EPHEMERAL_MS
          : !listed.has(name) && runningPid(extra?.pid, extra?.pid_started) === undefined && now - lastWrite(dir) > ORPHAN_MS;
      if (stale) {
        remove(dir);
        if (extra) index.forget(extra.id);
        removed.push(name);
      } else keep.add(name);
    }
    // Extras of a session with neither a Pi file nor a folder left are dead weight.
    for (const [name, extra] of extras) {
      if (!keep.has(name) && !listed.has(name) && !fs.existsSync(path.join(root, name)) && runningPid(extra.pid, extra.pid_started) === undefined) index.forget(extra.id);
    }
    for (const name of keep) {
      for (const kind of ['output', 'bash']) sweepStaleOutputs(path.join(root, name, kind), outputMs, undefined, now);
      // A session's checkpoints go whole (a journal pointing at removed blobs only makes a rewind skip files), and only
      // when nothing wrote to them for the period: resuming a session protects it, since it is then the current one.
      const checkpoints = path.join(root, name, 'checkpoints');
      if (name !== currentName && runningPid(extras.get(name)?.pid, extras.get(name)?.pid_started) === undefined && checkpointsIdle(checkpoints, outputMs, now)) remove(checkpoints);
    }
    sweepStaleOutputs(shotsDir(env), outputMs, undefined, now);
  } catch {
    // A sweep is housekeeping: whatever it could not remove, the next one tries again.
  }
  return removed;
}
