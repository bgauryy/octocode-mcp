import { execFileSync, spawn } from 'node:child_process';

/** How long a stopped process tree gets after SIGTERM before SIGKILL. */
export const KILL_GRACE_MS = 500;

/** Whether a process with this pid exists (EPERM: it exists but belongs to someone else). Non-positive or non-integer pids are not alive. */
export function processAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const startTimes = new Map<number, string | undefined>();

/**
 * When the process with this pid started, as `ps` prints it (`Mon Jan  2 15:04:05 2006`), or undefined when unknown
 * (Windows, no `ps`, no such process). A pid alone proves nothing once the system reuses it; the pid plus this value
 * names one process. This process's own value is read once.
 */
export function processStartTime(pid: number): string | undefined {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return undefined;
  if (pid === process.pid && startTimes.has(pid)) return startTimes.get(pid);
  let started: string | undefined;
  try {
    started = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C' } }).trim().replace(/\s+/g, ' ') || undefined;
  } catch {
    // No `ps`, or the process is gone.
  }
  if (pid === process.pid) startTimes.set(pid, started);
  return started;
}

/**
 * Whether `pid` is the same process that recorded `started` (its `processStartTime`): alive, and not a later process
 * that got the pid. Without a recorded or readable start time it is just `processAlive`.
 */
export function sameProcess(pid: unknown, started: string | null | undefined): boolean {
  if (!processAlive(pid)) return false;
  if (!started) return true;
  const now = processStartTime(pid as number);
  return now === undefined || now === started;
}

/**
 * Sends `signal` to the process tree rooted at `pid`: its process group on POSIX (spawn it with `detached: true` so it
 * leads one; otherwise only the process itself is signalled) and `taskkill /T /F` on Windows. Never throws.
 */
export function signalTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => undefined);
    } catch {
      // taskkill is missing; nothing more to do.
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

/**
 * Whether any process of the group led by `pid` is alive (POSIX; spawn it with `detached: true`). A shell that exits
 * can leave children (`server &`, `nohup`) in its group. Windows has no groups: the process itself.
 */
export function groupAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  if (process.platform === 'win32') return processAlive(pid);
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** How often `stopTree` checks whether the tree is gone. */
const STOP_POLL_MS = 25;

/**
 * SIGTERM to the tree, then SIGKILL to whatever is left after `graceMs`; resolves once the group is gone (a killed
 * leader stays a zombie until Node reaps it) or another `graceMs` passed. For shutdown, where the unref'd timer of
 * `killTree` would never fire because the process exits first.
 */
export async function stopTree(pid: number | undefined, graceMs = KILL_GRACE_MS): Promise<void> {
  if (!pid) return;
  const settle = async (ms: number): Promise<void> => {
    const deadline = Date.now() + ms;
    while (groupAlive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
  };
  signalTree(pid, 'SIGTERM');
  await settle(graceMs);
  if (!groupAlive(pid)) return;
  signalTree(pid, 'SIGKILL');
  await settle(graceMs);
}

/** Ends this process the way an outside SIGTERM would, so its own handlers (Pi's graceful shutdown) run first. */
export function terminateSelf(): void {
  process.kill(process.pid, 'SIGTERM');
}

/** Trees `killTree` is stopping, so a repeated stop (abort plus timeout) sends one SIGTERM and schedules one SIGKILL. */
const stopping = new Set<number>();

/**
 * SIGTERM to the tree now and SIGKILL after `graceMs` (an unref'd timer, so it never holds the process open). The
 * SIGKILL goes only when the group still exists then: a tree that closed in time is left alone, and a group id is
 * never reused while any member is alive, so the late signal cannot reach an unrelated process.
 */
export function killTree(pid: number | undefined, graceMs = KILL_GRACE_MS): void {
  if (!pid || stopping.has(pid)) return;
  stopping.add(pid);
  signalTree(pid, 'SIGTERM');
  setTimeout(() => {
    stopping.delete(pid);
    if (groupAlive(pid)) signalTree(pid, 'SIGKILL');
  }, graceMs).unref();
}
