import type { DatabaseSync } from 'node:sqlite';
import { sameProcess } from '../shared/process.js';

/**
 * The one liveness test for a Pi session (backlog claims, `/octocode sessions`, the sweep): the pid recorded in its
 * `sessions` row, when that process still runs. The team's `agents` table cannot stand in for it: a session has a row
 * there only after it joins the team, and most never do. `started` is the process start time recorded with the pid
 * (`pid_started`): a crashed session whose pid the system gave to another process is not running. A row without one
 * (older, or recorded where start times are unknown) is judged by the pid alone.
 */
export function runningPid(pid: number | null | undefined, started?: string | null): number | undefined {
  return pid != null && sameProcess(pid, started) ? pid : undefined;
}

/** `runningPid` of the session `id`; undefined when it has no row, has ended, or its process is gone. */
export function sessionRunningPid(db: DatabaseSync, id: string): number | undefined {
  const row = db.prepare('SELECT pid, pid_started FROM sessions WHERE id = ?').get(id) as { pid: number | null; pid_started: string | null } | undefined;
  return runningPid(row?.pid, row?.pid_started);
}
