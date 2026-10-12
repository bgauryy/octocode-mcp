import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { Socket } from 'node:net';
import path from 'node:path';
import { SettingsManager, getAgentDir, getShellConfig, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { PRIVATE_FILE_MODE, privateDir, sessionOutputDir } from '../shared/home.js';
import { formatDuration, shortPath } from '../shared/format.js';
import { groupAlive, killTree, stopTree } from '../shared/process.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { capOutput, errorMessage, firstLine } from '../shared/util.js';

/**
 * Background shell jobs for the `bash` tool (bash.ts): each runs in its own process group, with the user's Pi shell,
 * command prefix and Pi's environment. Its output comes back through pipes and Pi writes it to a size-capped,
 * rotating log in the session's `bash/` folder.
 */

/** Background jobs running at once; more are refused. */
const MAX_BASH_JOBS = 8;
/** The longest timer Node keeps (2^31-1 ms), in whole seconds. */
export const MAX_TIMER_SECONDS = 2_147_483;
/** Output tail a finished job reports back. */
const TAIL_BYTES = 4 * 1024;
const TAIL_LINES = 40;
/** A job log past this size moves to `<log>.1` (replacing the one before) and starts over, so a chatty server cannot fill the disk. */
const MAX_JOB_LOG_BYTES = 16 * 1024 * 1024;
/** After the job's process group is gone, how long its pipes may take to deliver the last output, in ms. */
const DRAIN_MS = 1_000;
/** How often a job whose shell exited checks whether children it left in its group are still running, in ms. */
const GROUP_POLL_MS = 250;
export const JOB_TYPE = 'octocode-bash-job';
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
 * A job's log. Only Pi writes it (the job's output arrives through pipes), so rotation can neither lose nor reorder
 * output: once the log would pass `max` bytes it moves to `<log>.1`, replacing the previous one, and a new log starts
 * with a note naming it. Writes never throw: a log that cannot be written stops recording.
 */
class JobLog {
  private fd: number | undefined;
  private size = 0;
  private rotations = 0;
  /** Bytes of the rotation note at the head of the current log: a log holding only the note has no output to move. */
  private header = 0;

  constructor(
    readonly file: string,
    private readonly max: number,
  ) {
    this.fd = fs.openSync(file, 'a', PRIVATE_FILE_MODE);
  }

  write(data: string | Buffer): void {
    if (this.fd === undefined) return;
    const chunk = typeof data === 'string' ? Buffer.from(data) : data;
    try {
      let rest = chunk;
      while (rest.length > 0) {
        const room = this.max - this.size;
        if (rest.length <= room) {
          this.append(rest);
          break;
        }
        // Fill the log up to its last whole line that fits; a line longer than an empty log is cut at the cap.
        const fits = room > 0 ? rest.subarray(0, room).lastIndexOf(0x0a) + 1 : 0;
        const take = fits > 0 ? fits : this.size > this.header ? 0 : Math.max(room, 1);
        if (take > 0) this.append(rest.subarray(0, take));
        rest = rest.subarray(take);
        if (rest.length > 0) this.rotate();
      }
    } catch {
      this.close();
    }
  }

  close(): void {
    if (this.fd === undefined) return;
    try {
      fs.closeSync(this.fd);
    } catch {
      // Already closed.
    }
    this.fd = undefined;
  }

  private append(chunk: Buffer): void {
    for (let offset = 0; offset < chunk.length; ) offset += fs.writeSync(this.fd!, chunk, offset);
    this.size += chunk.length;
  }

  private rotate(): void {
    fs.closeSync(this.fd!);
    this.fd = undefined;
    fs.renameSync(this.file, `${this.file}.1`);
    this.fd = fs.openSync(this.file, 'a', PRIVATE_FILE_MODE);
    this.size = 0;
    this.rotations++;
    const older = this.rotations > 1 ? '; older output was dropped' : '';
    const note = Buffer.from(`[earlier output is in ${path.basename(this.file)}.1${older}]\n`);
    this.append(note);
    this.header = note.length;
  }
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
  stopped?: 'timeout' | 'user' | 'session end' | 'run end';
  done: Promise<JobExit>;
}

export interface JobExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  seconds: number;
}

/** The last few KB of a job's log, cut to whole lines. */
export function logTail(file: string, maxBytes = TAIL_BYTES): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, maxBytes);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      const text = buffer.toString('utf8');
      return size > length ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
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
    if (this.jobs.size >= MAX_BASH_JOBS) throw new Error(`${this.jobs.size} background jobs are already running (${[...this.jobs.keys()].join(', ')}); the limit is ${MAX_BASH_JOBS}. Stop one first.`);
    if (!fs.existsSync(cwd)) throw new Error(`Working directory does not exist: ${cwd}`);
    // Node fires a timer longer than 2^31-1 ms at once, which would stop the job as soon as it started.
    const timeout = asked && asked > 0 ? Math.min(asked, MAX_TIMER_SECONDS) : undefined;
    const dir = this.logDir();
    privateDir(dir);
    const id = `bash-${++this.next}`;
    // Job ids restart with each extension instance (a /reload), so the start time keeps an earlier log.
    const log = path.join(dir, `${id}-${Date.now()}.log`);
    const output = new JobLog(log, maxLogBytes);
    const shell = getShellConfig(settings.shellPath);
    const viaStdin = shell.commandTransport === 'stdin';
    const script = prefixed(command, settings.commandPrefix);
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
    if (viaStdin) {
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(script);
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
    const done = new Promise<JobExit>((resolve) => {
      let finished = false;
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        // The pipes close once every writer is gone; a process that left the group may hold them open forever.
        void Promise.race([drained, new Promise((settle) => setTimeout(settle, DRAIN_MS).unref())]).then(() => {
          for (const pipe of pipes) pipe.destroy();
          output.close();
          resolve({ code, signal, seconds: Math.round((Date.now() - startedAt) / 1000) });
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
    if (timeout) {
      timer = setTimeout(() => this.stop(id, 'timeout'), timeout * 1000);
      timer.unref();
    }
    this.jobs.set(id, job);
    void done.then((exit) => {
      this.jobs.delete(id);
      onExit(job, exit);
    });
    return job;
  }

  /** Stops a job's whole process tree; false when no such job runs. */
  stop(id: string, reason: NonNullable<BashJob['stopped']>): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.stopped ??= reason;
    killTree(job.pid);
    return true;
  }

  /** Stops every job; resolves once each tree that outlived SIGTERM got SIGKILL (Pi may exit right after). */
  async stopAll(reason: NonNullable<BashJob['stopped']>): Promise<void> {
    const jobs = [...this.jobs.values()];
    for (const job of jobs) job.stopped ??= reason;
    await Promise.all(jobs.map((job) => stopTree(job.pid)));
  }

  /**
   * Before a headless run ends: jobs without a timeout (a server, a watcher) would never finish, so they are stopped;
   * resolves once every job has exited (each exit sends its report).
   */
  settle(): Promise<unknown> {
    for (const job of [...this.jobs.values()]) if (!job.timeout) this.stop(job.id, 'run end');
    return Promise.all([...this.jobs.values()].map((job) => job.done));
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
  // Logs hold raw terminal output: colors and cursor moves would only cost tokens (and could hide text).
  const tail = sanitizeTerminalText(logTail(job.log)).trimEnd();
  return [`Background bash ${job.id} ${how} after ${formatDuration(exit.seconds * 1000)}: ${firstLine(job.command).slice(0, 120)}`, `Log: ${shortPath(job.log, job.cwd)}`, tail ? capOutput(tail, TAIL_BYTES, TAIL_LINES) : '(no output)'].join('\n');
}

