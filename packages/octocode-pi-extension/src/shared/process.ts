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

/** This process's parent when the module loaded. */
const loadedPpid = process.ppid;

/**
 * Whether the process that started this one (`parentPid`) is gone: dead, or, when it spawned this process directly,
 * this process was reparented since it loaded (so a later process that got the parent's pid does not count as it). A
 * launcher in between can exit while the parent lives: then only the pid is checked. Windows never reparents.
 */
export function parentGone(parentPid: number): boolean {
  return (loadedPpid === parentPid && process.ppid !== loadedPpid) || !processAlive(parentPid);
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
 * Pids of every descendant of `pid` (POSIX, one `ps` call), including ones that left its process group: a detached
 * Chrome or a background bash job leads a group of its own, so a group signal misses it. Empty on Windows (taskkill /T
 * already walks the tree) or when `ps` fails.
 */
export function descendantPids(pid: number | undefined): number[] {
  if (!pid || process.platform === 'win32') return [];
  let table: string;
  try {
    table = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const children = new Map<number, number[]>();
  for (const line of table.split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (!child || !parent) continue;
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  const found: number[] = [];
  for (let queue = [pid]; queue.length > 0; ) {
    const next = queue.flatMap((each) => children.get(each) ?? []).filter((each) => !found.includes(each) && each !== pid);
    found.push(...next);
    queue = next;
  }
  return found;
}

/** The tree rooted at `pid`, as taken when the stop began: its group plus every descendant seen then. */
function treeAlive(pid: number, descendants: readonly number[]): boolean {
  return groupAlive(pid) || descendants.some((each) => processAlive(each));
}

/** SIGKILL to the group and to each listed descendant still alive (with its own group, when it leads one). */
function killRest(pid: number, descendants: readonly number[]): void {
  if (groupAlive(pid)) signalTree(pid, 'SIGKILL');
  for (const each of descendants) if (processAlive(each)) signalTree(each, 'SIGKILL');
}

/**
 * SIGTERM to the tree, then SIGKILL to whatever is left after `graceMs`; resolves once the group is gone (a killed
 * leader stays a zombie until Node reaps it) or another `graceMs` passed. For shutdown, where the unref'd timer of
 * `killTree` would never fire because the process exits first.
 */
export async function stopTree(pid: number | undefined, graceMs = KILL_GRACE_MS): Promise<void> {
  if (!pid) return;
  // Taken before the signal: once the root exits, its detached descendants belong to init and no longer show as its.
  const descendants = descendantPids(pid);
  const settle = async (ms: number): Promise<void> => {
    const deadline = Date.now() + ms;
    while (treeAlive(pid, descendants) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
  };
  signalTree(pid, 'SIGTERM');
  await settle(graceMs);
  if (!treeAlive(pid, descendants)) return;
  killRest(pid, descendants);
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
 * SIGKILL goes only to what still exists then: a tree that closed in time is left alone, and a group id is never
 * reused while any member is alive, so the late signal cannot reach an unrelated process. Descendants that left the
 * group (a detached Chrome, a background bash job) are listed before the SIGTERM, so the root gets the grace to close
 * them itself and they are killed with the rest when it does not.
 */
export function killTree(pid: number | undefined, graceMs = KILL_GRACE_MS): void {
  if (!pid || stopping.has(pid)) return;
  stopping.add(pid);
  const descendants = descendantPids(pid);
  signalTree(pid, 'SIGTERM');
  setTimeout(() => {
    stopping.delete(pid);
    killRest(pid, descendants);
  }, graceMs).unref();
}
