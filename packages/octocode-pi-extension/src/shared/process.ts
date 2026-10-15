import { execFileSync, spawn } from 'node:child_process';
import { validPid } from './util.js';
import { windowsTree } from './winhelper.js';
import { system32Executable } from './winpath.js';

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

/** `ps` in UTC and the C locale: `lstart` is printed in the reader's time zone, so two Pis in different zones would disagree. */
const PS_UTC_ENV = (): NodeJS.ProcessEnv => ({ ...process.env, LC_ALL: 'C', TZ: 'UTC0' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Seconds since the epoch of an `lstart` printed in UTC (`Mon Jan  2 15:04:05 2006`), as a decimal string; undefined when unparsable. */
function utcSeconds(lstart: string): string | undefined {
  const match = /^\w{3} (\w{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(lstart.trim().replace(/\s+/g, ' '));
  const month = MONTHS.indexOf(match?.[1] ?? '');
  if (!match || month < 0) return undefined;
  return String(Date.UTC(Number(match[6]), month, Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])) / 1000);
}

/** `ps -o lstart=` of one process (undefined: no `ps`, a timeout, or no such process). */
function psStart(pid: number, env: NodeJS.ProcessEnv): string | undefined {
  try {
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], env }).trim().replace(/\s+/g, ' ') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * When the process with this pid started, as whole seconds since the epoch in a decimal string (time-zone free, so
 * Pis in different zones agree), or undefined when unknown (Windows, no `ps`, no such process). A pid alone proves
 * nothing once the system reuses it; the pid plus this value names one process. This process's own value is read once.
 */
export function processStartTime(pid: number): string | undefined {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return undefined;
  if (pid === process.pid && startTimes.has(pid)) return startTimes.get(pid);
  const lstart = psStart(pid, PS_UTC_ENV());
  const started = lstart === undefined ? undefined : utcSeconds(lstart);
  if (pid === process.pid) startTimes.set(pid, started);
  return started;
}

/**
 * How `pid` compares with the process that recorded `started`: `same` (alive, same start time), `other` (gone, or a
 * later process that got the pid) or `unknown` (alive, but no start time was recorded or `ps` could not read one).
 * Values recorded before start times were time-zone free (`Mon Jan  2 15:04:05 2006`) are compared in this zone.
 */
export function processMatch(pid: unknown, started: string | null | undefined): 'same' | 'other' | 'unknown' {
  if (!processAlive(pid)) return 'other';
  if (!started) return 'unknown';
  const now = /^\d+$/.test(started) ? processStartTime(pid as number) : psStart(pid as number, { ...process.env, LC_ALL: 'C' });
  return now === undefined ? 'unknown' : now === started ? 'same' : 'other';
}

/**
 * Whether `pid` may still be the process that recorded `started` (its `processStartTime`): alive, and not a later
 * process that got the pid. Lenient, for liveness: without a recorded or readable start time it is just `processAlive`
 * (an owner that cannot be judged keeps what it owns). Before signalling a process use `processMatch`, where unknown
 * is not a match.
 */
export function sameProcess(pid: unknown, started: string | null | undefined): boolean {
  return processMatch(pid, started) !== 'other';
}

/**
 * The live members of process group `pgid` (POSIX, one `ps` call) with `column` (`lstart` or `command`) as trimmed text;
 * a zombie has exited already and is left out. Undefined on Windows (no groups), for an unsignalable pid or when `ps` fails.
 */
function groupRows(pgid: number | undefined, column: 'lstart' | 'command'): Array<{ pid: number; rest: string }> | undefined {
  if (!validPid(pgid) || process.platform === 'win32') return undefined;
  let table: string;
  try {
    table = execFileSync('ps', ['-A', '-o', `pid=,pgid=,stat=,${column}=`], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], env: PS_UTC_ENV() });
  } catch {
    return undefined;
  }
  const rows: Array<{ pid: number; rest: string }> = [];
  for (const line of table.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (match && Number(match[2]) === pgid && !match[3]!.startsWith('Z')) rows.push({ pid: Number(match[1]), rest: match[4]!.trim() });
  }
  return rows;
}

/**
 * Start times (`processStartTime` values) of the live members of the process group `pgid` (POSIX, one `ps` call), or
 * undefined when `ps` fails or a member's start cannot be read: unknown is not the same as no member.
 */
export function groupStartTimes(pgid: number): Array<{ pid: number; started: string }> | undefined {
  const rows = groupRows(pgid, 'lstart');
  if (rows === undefined) return undefined;
  const members: Array<{ pid: number; started: string }> = [];
  for (const row of rows) {
    const started = utcSeconds(row.rest);
    if (started === undefined) return undefined;
    members.push({ pid: row.pid, started });
  }
  return members;
}

/** `taskkill /T /F` on `pid`: walks the tree below a live root, and fails (exit 128) once the root has exited. Never throws. */
function taskkill(pid: number): void {
  try {
    spawn(system32Executable('taskkill.exe'), ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => undefined);
  } catch {
    // taskkill is missing; nothing more to do.
  }
}

/**
 * Ends the Windows tree rooted at `pid`: its job when the helper holds one (every member goes, also the descendants of
 * a root that exited), else, or when the job could not be killed, `taskkill`. Resolves once the job is ended.
 */
async function killWindowsTree(pid: number): Promise<void> {
  if (windowsTree.owns(pid) && (await windowsTree.kill(pid))) return;
  taskkill(pid);
}

/**
 * Starts what tracking a process tree needs, before the process spawns: on Windows, the helper that owns its job (its
 * startup takes a while, and a child started before the assignment is not in the job). A no-op elsewhere.
 */
export async function prepareTree(): Promise<void> {
  if (process.platform === 'win32') await windowsTree.start();
}

/**
 * Right after spawning the root of a tree: on Windows, puts it in a job, so `signalTree`, `stopTree` and `killTree`
 * reach its whole tree and the tree ends with Pi. Asynchronous and best effort; a no-op elsewhere (the process group
 * is the tree there: spawn with `detached: true`).
 */
export function adoptTree(pid: number | undefined): void {
  if (process.platform === 'win32') void windowsTree.assign(pid);
}

/**
 * Sends `signal` to the process tree rooted at `pid`: its process group on POSIX (spawn it with `detached: true` so it
 * leads one; otherwise only the process itself is signalled), and on Windows, which has no signals, its job (see
 * `adoptTree`) or else `taskkill /T /F`. Never throws.
 */
export function signalTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!validPid(pid)) return;
  if (process.platform === 'win32') {
    void killWindowsTree(pid);
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
  if (!validPid(pid)) return false;
  if (process.platform === 'win32') return processAlive(pid);
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The live members of the process group `pgid` (POSIX, one `ps` call), each with its command line. Empty on Windows
 * (no groups) or when `ps` fails.
 */
export function groupMembers(pgid: number | undefined): Array<{ pid: number; command: string }> {
  return (groupRows(pgid, 'command') ?? []).map((row) => ({ pid: row.pid, command: row.rest }));
}

/** How often `stopTree` checks whether the tree is gone. */
const STOP_POLL_MS = 25;

/**
 * Pids of every descendant of `pid` (POSIX, one `ps` call), including ones that left its process group: a detached
 * Chrome or a background bash job leads a group of its own, so a group signal misses it. Empty on Windows (a job or taskkill /T
 * ends the whole tree) or when `ps` fails.
 */
export function descendantPids(pid: number | undefined): number[] {
  if (!validPid(pid) || process.platform === 'win32') return [];
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
  if (!validPid(pid)) return;
  // Taken before the signal: once the root exits, its detached descendants belong to init and no longer show as its.
  const descendants = descendantPids(pid);
  const settle = async (ms: number): Promise<void> => {
    const deadline = Date.now() + ms;
    while (treeAlive(pid, descendants) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
  };
  if (process.platform === 'win32') {
    // No signals: the job (or taskkill) ends the tree at once, also after the root exited.
    await killWindowsTree(pid);
    await settle(graceMs);
    if (treeAlive(pid, descendants)) {
      taskkill(pid);
      await settle(graceMs);
    }
    return;
  }
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
  if (!validPid(pid) || stopping.has(pid)) return;
  stopping.add(pid);
  const descendants = descendantPids(pid);
  signalTree(pid, 'SIGTERM');
  setTimeout(() => {
    stopping.delete(pid);
    killRest(pid, descendants);
  }, graceMs).unref();
}
