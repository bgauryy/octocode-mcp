import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { SettingsManager, getAgentDir, getShellConfig, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { atomicWriteFileSync } from '../shared/atomic.js';
import { claimSuffix, releaseDeadClaims } from '../shared/claims.js';
import { PRIVATE_FILE_MODE, privateDir, sessionOutputDir, sessionsRoot } from '../shared/home.js';
import { formatDuration, shortPath } from '../shared/format.js';
import { adoptTree, groupAlive, groupStartTimes, killTree, prepareTree, processAlive, processMatch, processStartTime, sameProcess, stopTree } from '../shared/process.js';
import { RotatingLog } from '../shared/rotating-log.js';
import { visibleControls, withoutColors } from '../shared/sanitize.js';
import { cutText, errorMessage, firstLine, validPid } from '../shared/util.js';

/**
 * Background shell jobs for the `bash` tool (bash.ts): each runs in its own process group, with the user's Pi shell,
 * command prefix and Pi's environment. Its output comes back through pipes and Pi writes it to a size-capped,
 * rotating log in the session's `bash/` folder. Next to each log an owner record names the job and the Pi that started
 * it, so a later Pi can stop a job whose Pi died without ending it (`reapOrphanJobs`).
 */

/** The longest timer Node keeps (2^31-1 ms), in whole seconds. */
export const MAX_TIMER_SECONDS = 2_147_483;
/** Output tail a finished job reports back; the report counts the lines before it and names the log that holds them. */
const TAIL_BYTES = 4 * 1024;
const TAIL_LINES = 40;
/** A job log past this size moves to `<log>.1` (replacing the one before) and starts over, so a chatty server cannot fill the disk. */
const MAX_JOB_LOG_BYTES = 16 * 1024 * 1024;
/** After the job's process group is gone, how long its pipes may take to deliver the last output, in ms. */
const DRAIN_MS = 1_000;
/** How often a job whose shell exited checks whether children it left in its group are still running, in ms. */
const GROUP_POLL_MS = 250;
export const JOB_TYPE = 'octocode-bash-job';
/** A job's owner record: its log path with this suffix instead of `.log`. */
const RECORD_SUFFIX = '.job.json';
/** A record being reaped is renamed `<record>.reaping-<pid>-<start time>` by the Pi that claimed it (`shared/claims.ts`). */
const CLAIM_MARKER = '.reaping-';
/** The user's Pi shell settings that every command runs with. */
export interface ShellSettings {
  shellPath?: string;
  commandPrefix?: string;
}

/** `shellPath` and `shellCommandPrefix` from Pi's settings for `cwd` (project settings only in a trusted project). */
export function shellSettings(cwd: string, projectTrusted: boolean): ShellSettings {
  try {
    const settings = SettingsManager.create(cwd, getAgentDir(), { projectTrusted });
    const shellPath = settings.getShellPath();
    const commandPrefix = settings.getShellCommandPrefix();
    return { ...(shellPath ? { shellPath } : {}), ...(commandPrefix ? { commandPrefix } : {}) };
  } catch {
    return {};
  }
}

/** The command as Pi's bash runs it: the settings prefix on its own line first. */
export function prefixed(command: string, commandPrefix?: string): string {
  return commandPrefix ? `${commandPrefix}\n${command}` : command;
}

/**
 * The environment Pi's own bash gives a command (core/tools/bash `resolveSpawnContext` over utils/shell `getShellEnv`,
 * neither exported): Pi's bin folder first on PATH, and the PI_* session variables set from this session, never
 * inherited from the parent. The builtin is created without a spawnHook, so there is none to apply here.
 */
export function shellEnv(ctx?: ExtensionContext, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const bin = path.join(getAgentDir(), 'bin');
  const pathKey = Object.keys(base).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const current = base[pathKey] ?? '';
  const env: NodeJS.ProcessEnv = { ...base, [pathKey]: current.split(path.delimiter).filter(Boolean).includes(bin) ? current : [bin, current].filter(Boolean).join(path.delimiter) };
  for (const name of ['PI_SESSION_ID', 'PI_SESSION_FILE', 'PI_PROVIDER', 'PI_MODEL', 'PI_REASONING_LEVEL']) delete env[name];
  if (!ctx) return env;
  env['PI_SESSION_ID'] = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile) env['PI_SESSION_FILE'] = sessionFile;
  if (ctx.model) {
    env['PI_PROVIDER'] = ctx.model.provider;
    env['PI_MODEL'] = ctx.model.id;
  }
  if (ctx.thinkingLevel) env['PI_REASONING_LEVEL'] = ctx.thinkingLevel;
  return env;
}

export interface BashJob {
  id: string;
  command: string;
  /** Where it runs; its log path is shown relative to it. */
  cwd: string;
  pid: number;
  log: string;
  startedAt: number;
  /** Seconds after which the job is stopped; unset: it runs until it exits, is stopped, or the session ends. */
  timeout?: number;
  /** Why the extension stopped it, when it did. */
  stopped?: 'timeout' | 'user' | 'session end' | 'reload' | 'run end';
  /** Its process group is gone; only its last output may still be draining before `done` resolves. */
  exited?: boolean;
  done: Promise<JobExit>;
}

/**
 * What a job's owner record holds: the job (pid plus start time names one process), the Pi process that owns it and
 * the host both run on (pids mean nothing on another host sharing this folder; records from before it have none).
 */
interface JobRecord {
  id: string;
  pid: number;
  started?: string;
  command: string;
  log: string;
  host?: string;
  owner: { pid: number; started?: string };
}

/** A job found running after its Pi died; `stopped` is false when it could not be confirmed as the recorded process. */
export interface OrphanJob {
  id: string;
  pid: number;
  command: string;
  log: string;
  stopped: boolean;
}

export interface JobExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  seconds: number;
  /** Set when the job's log stopped recording: its size then and why. */
  logStopped?: { bytes: number; error: string };
  /** Set when the log rotated: how many times (the second rotation and later drop the oldest output). */
  logRotations?: number;
}

/** Lines in `fd` (a last line without a newline counts too), read in 1 MB chunks. */
function countLines(fd: number, size: number): number {
  const chunk = Buffer.alloc(Math.min(size, 1024 * 1024));
  let lines = 0;
  let last = 0x0a;
  for (let position = 0; position < size; ) {
    const read = fs.readSync(fd, chunk, 0, chunk.length, position);
    if (read <= 0) break;
    for (let at = chunk.indexOf(0x0a); at !== -1 && at < read; at = chunk.indexOf(0x0a, at + 1)) lines++;
    last = chunk[read - 1]!;
    position += read;
  }
  return last === 0x0a ? lines : lines + 1;
}

/**
 * The end of a job's log: its last whole lines, at most `maxLines` within `maxBytes`, and how many lines come before
 * them (they stay in the log; a rotated log names its `.1` file on its first line).
 */
export function logTail(file: string, maxBytes = TAIL_BYTES, maxLines = TAIL_LINES): { text: string; earlier: number } {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, maxBytes);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      let text = buffer.toString('utf8');
      if (size > length) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n');
      if (lines.at(-1) === '') lines.pop();
      const kept = lines.slice(-maxLines);
      return { text: kept.join('\n'), earlier: countLines(fd, size) - kept.length };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { text: '', earlier: 0 };
  }
}

/** The owner record that goes with a job's log. */
const recordFile = (log: string): string => log.replace(/\.log$/, '') + RECORD_SUFFIX;

/** A readable owner record, else undefined. A pid of 1 or less would make a stop signal init, a group or everything. */
function parseRecord(text: string): JobRecord | undefined {
  try {
    const record = JSON.parse(text) as JobRecord;
    return validPid(record.pid) && validPid(record.owner?.pid) && typeof record.log === 'string' ? record : undefined;
  } catch {
    return undefined;
  }
}

const readRecord = (file: string): JobRecord | undefined => {
  try {
    return parseRecord(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Whether a record was written on another host: its processes cannot be judged from here. */
const foreign = (record: JobRecord): boolean => record.host !== undefined && record.host !== os.hostname();

/**
 * Names in a `bash/` folder that belong to jobs whose Pi still runs (or runs on another host, which cannot be judged
 * here): their owner records and logs (with a rotated `.1`), which the session sweep must not age out. The record is
 * written once at the job's start, so its age says nothing about the job. A record that cannot be read is kept, with the
 * log its name points at (`recordFile`): a job that cannot be judged is not one to sweep. A record that reads but does
 * not parse is garbage and ages out. Never rejects.
 */
export async function liveJobFiles(dir: string): Promise<Set<string>> {
  const live = new Set<string>();
  const names = await fs.promises.readdir(dir).catch((): string[] => []);
  for (const name of names.filter((each) => each.endsWith(RECORD_SUFFIX))) {
    const text = await fs.promises.readFile(path.join(dir, name), 'utf8').catch(() => undefined);
    const record = text === undefined ? undefined : parseRecord(text);
    if (text !== undefined && (!record || (!foreign(record) && !sameProcess(record.owner.pid, record.owner.started)))) continue;
    const log = record ? path.basename(record.log) : `${name.slice(0, -RECORD_SUFFIX.length)}.log`;
    for (const each of [name, log, `${log}.1`]) live.add(each);
  }
  return live;
}

/** Every session's `bash/` folder (most do not exist; the reader skips those). */
function sessionBashDirs(root = sessionsRoot()): string[] {
  try {
    return fs.readdirSync(root).map((name) => path.join(root, name, 'bash'));
  } catch {
    return [];
  }
}

/**
 * Stops background jobs whose Pi died without ending them (kill -9, out of memory): owner records in `dirs` whose
 * owner process is gone. Killing an unrelated process is the worst outcome, so a job is stopped (SIGTERM, then
 * SIGKILL) only on proof: its shell is the recorded process (pid plus start time), or its shell is gone, its group
 * outlived it, every member started at or after the job, and no later record names the pid (it was not reused). A
 * record from another host is not ours to judge and stays. Each record is claimed by a rename first, so two Pis
 * starting at once never both act on it, and is removed after; a claim whose Pi died is retried. Anything that cannot
 * be judged (no start time recorded, `ps` failing) is left alone and returned with `stopped: false`; a record that
 * `ps` could not judge is kept for a later start to retry.
 */
export async function reapOrphanJobs(dirs: readonly string[]): Promise<OrphanJob[]> {
  const found: OrphanJob[] = [];
  const stops: Array<Promise<void>> = [];
  const entries: Array<{ file: string; record: JobRecord | undefined }> = [];
  for (const dir of dirs) {
    try {
      releaseDeadClaims(dir, fs.readdirSync(dir), CLAIM_MARKER, (original) => original.endsWith(RECORD_SUFFIX));
      for (const name of fs.readdirSync(dir)) if (name.endsWith(RECORD_SUFFIX)) entries.push({ file: path.join(dir, name), record: readRecord(path.join(dir, name)) });
    } catch {
      continue;
    }
  }
  // The latest recorded start of each job pid on this host: a later job with the same pid means ours ended before it.
  const latest = new Map<number, number>();
  for (const { record } of entries) {
    if (record && !foreign(record) && /^\d+$/.test(record.started ?? '')) latest.set(record.pid, Math.max(latest.get(record.pid) ?? 0, Number(record.started)));
  }
  for (const { file, record } of entries) {
    if (record && (foreign(record) || sameProcess(record.owner.pid, record.owner.started))) continue;
    const claimed = `${file}${claimSuffix(CLAIM_MARKER)}`;
    try {
      fs.renameSync(file, claimed);
    } catch {
      continue;
    }
    let keep = false;
    if (record) {
      const job = { id: record.id, pid: record.pid, command: record.command, log: record.log };
      const verdict = orphanVerdict(record, latest);
      if (verdict === 'stop') stops.push(stopTree(record.pid));
      if (verdict !== 'gone') found.push({ ...job, stopped: verdict === 'stop' });
      keep = verdict === 'retry';
    }
    try {
      if (keep) fs.renameSync(claimed, file);
      else fs.rmSync(claimed, { force: true });
    } catch {
      // A later start finds the claim of a gone Pi and retries it.
    }
  }
  await Promise.all(stops);
  return found;
}

/**
 * What to do with the job of a dead owner: `stop` it, leave it alone (`leave`; `retry` keeps the record because `ps`
 * failed), or nothing (`gone`: it ended, or its pid now names another process).
 */
function orphanVerdict(record: JobRecord, latest: ReadonlyMap<number, number>): 'stop' | 'leave' | 'retry' | 'gone' {
  const match = processMatch(record.pid, record.started);
  if (match === 'same') return 'stop';
  if (match === 'unknown') return record.started ? 'retry' : 'leave';
  if (processAlive(record.pid) || !groupAlive(record.pid)) return 'gone';
  // The shell is gone but its group lives (`server &`). A group id is never reused while a member lives, yet the job's
  // group may have ended long ago and its pid been reused as another group's leader: only a group whose members all
  // started at or after the job, with no later job recorded under that pid, is taken for the job's.
  if (!/^\d+$/.test(record.started ?? '') || (latest.get(record.pid) ?? 0) > Number(record.started)) return 'leave';
  const members = groupStartTimes(record.pid);
  if (members === undefined) return 'retry';
  return members.length > 0 && members.every((member) => Number(member.started) >= Number(record.started)) ? 'stop' : 'leave';
}

/** Background shell jobs of one session: each runs in its own process group with output going to a log file. */
export class BashJobs {
  readonly jobs = new Map<string, BashJob>();
  private next = 0;

  constructor(private readonly dir?: string) {}

  /** Where logs go: the given directory, else the current session's `bash/` folder. */
  logDir(): string {
    return this.dir ?? sessionOutputDir('bash');
  }

  async start(
    command: string,
    cwd: string,
    asked: number | undefined,
    onExit: (job: BashJob, exit: JobExit) => void,
    { env = shellEnv(), shell: settings = {}, maxLogBytes = MAX_JOB_LOG_BYTES }: { env?: NodeJS.ProcessEnv; shell?: ShellSettings; maxLogBytes?: number } = {},
  ): Promise<BashJob> {
    if (!fs.existsSync(cwd)) throw new Error(`Working directory does not exist: ${cwd}`);
    // Node fires a timer longer than 2^31-1 ms at once, which would stop the job as soon as it started.
    const timeout = asked && asked > 0 ? Math.min(asked, MAX_TIMER_SECONDS) : undefined;
    const dir = this.logDir();
    privateDir(dir);
    const id = `bash-${++this.next}`;
    // Job ids restart with each extension instance (a /reload), so the start time keeps an earlier log.
    const log = path.join(dir, `${id}-${Date.now()}.log`);
    const output = new RotatingLog(log, maxLogBytes);
    const shell = getShellConfig(settings.shellPath);
    const viaStdin = shell.commandTransport === 'stdin';
    const script = prefixed(command, settings.commandPrefix);
    // On Windows the job that holds the tree exists before the shell does.
    await prepareTree();
    const child = spawn(shell.shell, viaStdin ? shell.args : [...shell.args, script], {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (child.pid === undefined) {
      // Spawning failed (no shell, EAGAIN, EMFILE): the 'error' event that follows names the cause. Nothing ran, so
      // the empty log goes too.
      const cause = await new Promise<unknown>((resolve) => child.once('error', resolve));
      output.close();
      fs.rmSync(log, { force: true });
      throw new Error(`Could not start a background shell (${shell.shell}): ${errorMessage(cause)}. Nothing is running.`);
    }
    adoptTree(child.pid);
    if (viaStdin) {
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(script);
    }
    const record = recordFile(log);
    try {
      const owned: JobRecord = { id, pid: child.pid, started: processStartTime(child.pid), command, log, host: os.hostname(), owner: { pid: process.pid, started: processStartTime(process.pid) } };
      atomicWriteFileSync(record, JSON.stringify(owned), { mode: PRIVATE_FILE_MODE });
    } catch {
      // Without its record only this Pi can stop the job.
    }
    // The job, and its output pipes, must not keep a print run's process alive; session_shutdown stops it.
    child.unref();
    const pipes = [child.stdout, child.stderr].filter((pipe) => pipe !== null) as Socket[];
    const drained = Promise.all(pipes.map((pipe) => new Promise<void>((resolve) => pipe.once('close', () => resolve()))));
    for (const pipe of pipes) {
      pipe.on('data', (chunk: Buffer) => output.write(chunk));
      pipe.on('error', () => undefined);
      pipe.unref();
    }
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    // The job, for `finish` to mark exited: it exists before any child event can fire.
    const state: { job?: BashJob } = {};
    const done = new Promise<JobExit>((resolve) => {
      let finished = false;
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) return;
        finished = true;
        if (state.job) state.job.exited = true;
        if (timer) clearTimeout(timer);
        // The pipes close once every writer is gone; a process that left the group may hold them open forever.
        void Promise.race([drained, new Promise((settle) => setTimeout(settle, DRAIN_MS).unref())]).then(() => {
          for (const pipe of pipes) pipe.destroy();
          output.close();
          const seconds = Math.round((Date.now() - startedAt) / 1000);
          resolve({ code, signal, seconds, ...(output.failure ? { logStopped: output.failure } : {}), ...(output.rotations > 0 ? { logRotations: output.rotations } : {}) });
        });
      };
      child.once('error', (error) => {
        output.write(`\n${errorMessage(error)}\n`);
        finish(null, null);
      });
      // The shell can exit while children it started (`server &`) still run in its group and write to the log: the
      // job lasts until the group is gone, so they stay capped, stoppable and stopped at session end.
      child.once('exit', (code, signal) => {
        const wait = (): void => {
          if (groupAlive(child.pid)) setTimeout(wait, GROUP_POLL_MS).unref();
          else finish(code, signal);
        };
        wait();
      });
    });
    const job: BashJob = { id, command, cwd, pid: child.pid, log, startedAt, ...(timeout ? { timeout } : {}), done };
    state.job = job;
    if (timeout) {
      timer = setTimeout(() => this.stop(id, 'timeout'), timeout * 1000);
      timer.unref();
    }
    this.jobs.set(id, job);
    void done.then((exit) => {
      this.jobs.delete(id);
      try {
        fs.rmSync(record, { force: true });
      } catch {
        // A later Pi finds the job gone and removes the record.
      }
      onExit(job, exit);
    });
    return job;
  }

  /** Stops a job's whole process tree; false when no such job runs. A job that already exited keeps its own status. */
  stop(id: string, reason: NonNullable<BashJob['stopped']>): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.exited) return true;
    job.stopped ??= reason;
    killTree(job.pid);
    return true;
  }

  /** Jobs whose process group still runs (an exited job only waits for its last output). */
  running(): BashJob[] {
    return [...this.jobs.values()].filter((job) => !job.exited);
  }

  /** Stops every running job; resolves once each tree that outlived SIGTERM got SIGKILL (Pi may exit right after). */
  async stopAll(reason: NonNullable<BashJob['stopped']>): Promise<void> {
    const jobs = this.running();
    for (const job of jobs) job.stopped ??= reason;
    await Promise.all(jobs.map((job) => stopTree(job.pid)));
  }

  /**
   * Before a headless run ends: jobs without a timeout (a server, a watcher) would never finish, so they are stopped;
   * resolves once every job has exited (each exit sends its report).
   */
  settle(): Promise<unknown> {
    for (const job of this.running()) if (!job.timeout) this.stop(job.id, 'run end');
    return Promise.all([...this.jobs.values()].map((job) => job.done));
  }

  /** The owner-record folders to check for jobs left by a dead Pi: the given directory, else every session's. */
  recordDirs(): string[] {
    return this.dir ? [this.dir] : sessionBashDirs();
  }

  /** At a /reload (same process, same session), records the jobs it stops so the next extension instance can name them. */
  noteReload(stopped: readonly BashJob[]): void {
    if (stopped.length === 0) return;
    try {
      atomicWriteFileSync(this.reloadNote(), JSON.stringify(stopped.map(({ id, command, log }) => ({ id, command, log }))), { mode: PRIVATE_FILE_MODE });
    } catch {
      // The reports in the conversation still name them.
    }
  }

  /** The jobs the last /reload of this process stopped (read once). */
  takeReloadNote(): Array<Pick<BashJob, 'id' | 'command' | 'log'>> {
    const file = this.reloadNote();
    try {
      const jobs = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<Pick<BashJob, 'id' | 'command' | 'log'>>;
      return Array.isArray(jobs) ? jobs : [];
    } catch {
      return [];
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  private reloadNote(): string {
    return path.join(this.logDir(), `reload-${process.pid}.json`);
  }

  /** One line per running job, for `/octocode jobs`. */
  describe(now = Date.now()): string {
    if (this.jobs.size === 0) return 'No background bash jobs are running.';
    return [...this.jobs.values()]
      .map((job) => `${job.id} · ${formatDuration(now - job.startedAt)}${job.timeout ? ` of ${formatDuration(job.timeout * 1000)}` : ''} · pid ${job.pid} · ${firstLine(job.command).slice(0, 80)}\n  log: ${shortPath(job.log)}`)
      .join('\n');
  }
}

/** The message a finished job sends: how it ended, how long it ran, and the tail of its output. */
export function jobReport(job: BashJob, exit: JobExit): string {
  const how =
    job.stopped === 'timeout'
      ? `stopped after its ${formatDuration((job.timeout ?? 0) * 1000)} timeout`
      : job.stopped
        ? `stopped (${job.stopped})`
        : exit.code === 0
          ? 'finished'
          : exit.code !== null
            ? `failed with exit code ${exit.code}`
            : `ended by ${exit.signal ?? 'an error'}`;
  const { text, earlier } = logTail(job.log);
  // Logs hold raw terminal output. Colors are dropped (as Pi's bash does; the log keeps them); every other control
  // character shows as a visible escape, so nothing is hidden from the model.
  const tail = visibleControls(withoutColors(text)).trimEnd();
  const before = earlier > 0 ? `[+${earlier} earlier line${earlier === 1 ? '' : 's'} in the log]` : '';
  const stopped = exit.logStopped ? `log stopped at ${exit.logStopped.bytes} bytes: ${exit.logStopped.error}; later output was not recorded` : '';
  // Rotation keeps one older file: the first rotation leaves the earlier output in `.1`, a later one replaces it.
  const rotated = exit.logRotations ? `log rotated at its size cap${exit.logRotations > 1 ? ` ${exit.logRotations} times` : ''}: ${shortPath(`${job.log}.1`, job.cwd)} holds the part before this log${exit.logRotations > 1 ? '; output before that was dropped and cannot be recovered' : ''}` : '';
  return [`Background bash ${job.id} ${how} after ${formatDuration(exit.seconds * 1000)}: ${cutText(firstLine(job.command), 120, { chars: true })}`, `Log: ${shortPath(job.log, job.cwd)}`, rotated, stopped, before, tail || (before ? '' : '(no output)')].filter(Boolean).join('\n');
}

