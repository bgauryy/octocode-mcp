import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Usage } from '@earendil-works/pi-ai';
import { BROWSER_VISIBLE_ENV, CACHE_RETENTION_ENV, childCacheRetention, HOOKS_ENV, MCP_ENV, PARENT_SESSION_ENV, PERMISSION_ENV, PERMISSION_GRANTS_ENV, PERMISSION_RELAY_ENV, SUBAGENT_ENV, TRUST_ROOT_ENV } from '../shared/env.js';
import type { ActionClass, PermissionMode } from '../permission/mode.js';
import { NEEDS_APPROVAL } from '../permission/ask.js';
import { atomicWriteFileSync, sha256 } from '../shared/atomic.js';
import { formatDuration } from '../shared/format.js';
import { privateDir, sessionOutputDir } from '../shared/home.js';
import { adoptTree, groupAlive, groupStartTimes, prepareTree, processStartTime, sameProcess, stopTree } from '../shared/process.js';
import { redactSecrets, sanitizeTerminalText } from '../shared/sanitize.js';
import { addUsage, capChars, contentText, cutText, emptyUsage, isRecord, settleWithin, toolHint } from '../shared/util.js';
import { AGENT_COLLABORATE_ENV, AGENT_ID_ENV, AGENT_GOAL_ENV, AGENT_ROLE_ENV, AGENT_SCRATCH_ENV, PARENT_ID_ENV, PARENT_PID_ENV, TEAM_WORKSPACE_ENV } from '../team/store.js';
import { profileExcludes, type AgentProfile } from './profiles.js';
import { imagesOf } from './screenshots.js';
import { Thought, thoughtGist } from '../shared/thought.js';
import { ReportTracker } from './report.js';
import { ChildRelay, type RelayHost } from './relay.js';

/** The child's place in the team: its name (id), its role (profile), its goal, and the agent that started it. */
export interface Identity {
  id: string;
  role?: string;
  parentId?: string;
  goal?: string;
  /** Works with its sibling subagents (messages them directly), not only for its parent. */
  collaborate?: boolean;
  /** The parent's team workspace, for a child whose cwd is an isolated worktree (a different git root). */
  workspace?: string;
  /** Set only when the parent's project config is trusted: the repository whose stored decision an isolated child follows. */
  trustRoot?: string;
  /** Its handoff folder: files it writes there are read by the parent on demand instead of riding in its report. */
  scratch?: string;
  /** The parent's Pi session id: the backlog claims the child may update. */
  parentSession?: string;
  /** The parent's permission mode now, and what its spawn ask granted: the child is never looser than its parent. */
  permission?: { mode: PermissionMode; grants: readonly ActionClass[] };
  /** The parent can ask a person: the child sends its approval dialogs to the parent (`OCTOCODE_PERMISSION_RELAY`) instead of denying them. */
  relay?: boolean;
}

/**
 * Child environment. A `visibleBrowser` profile (webLive) gets a visible Chrome on the persistent profile. The user's
 * command hooks stay off in children unless the profile sets `hooks: true`: a hook meant for the main session (a
 * Stop hook that runs the tests, a notifier) would otherwise fire once per subagent.
 */
export function subagentProcessEnv(profile: AgentProfile | undefined, base: NodeJS.ProcessEnv = process.env, identity?: Identity): NodeJS.ProcessEnv {
  const hooks = base[HOOKS_ENV];
  const inherited = { ...base };
  // User settings survive; run identity, trust delegation, permissions and browser mode belong to this child.
  const owned = [
    ...[HOOKS_ENV, TRUST_ROOT_ENV, BROWSER_VISIBLE_ENV, PERMISSION_ENV, PERMISSION_GRANTS_ENV, PERMISSION_RELAY_ENV, CACHE_RETENTION_ENV],
    ...[AGENT_ID_ENV, AGENT_ROLE_ENV, PARENT_ID_ENV, AGENT_GOAL_ENV, AGENT_COLLABORATE_ENV, AGENT_SCRATCH_ENV, PARENT_SESSION_ENV, PARENT_PID_ENV],
  ];
  for (const key of owned) delete inherited[key];
  return {
    ...inherited,
    ...(profile?.hooks && hooks !== undefined ? { [HOOKS_ENV]: hooks } : {}),
    [SUBAGENT_ENV]: '1',
    // Short-lived and back to back: a 5-minute cache entry, unless the user exported a retention.
    [CACHE_RETENTION_ENV]: childCacheRetention(base),
    ...(profile?.visibleBrowser ? { [BROWSER_VISIBLE_ENV]: '1' } : {}),
    ...(profile?.mcp === false ? { [MCP_ENV]: '0' } : {}),
    ...(identity ? { [AGENT_ID_ENV]: identity.id } : {}),
    ...(identity?.parentId ? { [PARENT_ID_ENV]: identity.parentId } : {}),
    ...(identity?.role ? { [AGENT_ROLE_ENV]: identity.role } : {}),
    ...(identity?.goal ? { [AGENT_GOAL_ENV]: identity.goal } : {}),
    ...(identity?.collaborate ? { [AGENT_COLLABORATE_ENV]: '1' } : {}),
    ...(identity?.workspace ? { [TEAM_WORKSPACE_ENV]: identity.workspace } : {}),
    ...(identity?.trustRoot ? { [TRUST_ROOT_ENV]: identity.trustRoot } : {}),
    ...(identity?.scratch ? { [AGENT_SCRATCH_ENV]: identity.scratch } : {}),
    ...(identity?.parentSession ? { [PARENT_SESSION_ENV]: identity.parentSession } : {}),
    // The pid and its start time name this process, so a child never mistakes a later process with the pid for its parent.
    ...(identity ? { [PARENT_PID_ENV]: [process.pid, processStartTime(process.pid)].filter(Boolean).join(' ') } : {}),
    ...(identity?.relay ? { [PERMISSION_RELAY_ENV]: '1' } : {}),
    ...(identity?.permission ? { [PERMISSION_ENV]: identity.permission.mode } : {}),
    ...(identity?.permission?.grants.length ? { [PERMISSION_GRANTS_ENV]: identity.permission.grants.join(',') } : {}),
  };
}

/** The Pi CLI that runs this process, else the installed Pi package's CLI, else `pi` on PATH. */
function piInvocation(argv = process.argv): { command: string; prefix: string[] } {
  const script = argv[1];
  if (script && /(^|[\\/])(pi|cli\.js)$/.test(script) && fs.existsSync(script)) return { command: process.execPath, prefix: [script] };
  try {
    const main = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
    const cli = path.join(path.dirname(main), 'bundle', 'cli.js');
    if (fs.existsSync(cli)) return { command: process.execPath, prefix: [cli] };
  } catch {
    // Fall through to PATH lookup.
  }
  return { command: 'pi', prefix: [] };
}

/** This extension's entry file, so children load the same Octocode tools the parent has. */
function selfExtensionPath(): string | undefined {
  // The entry (`index.js` in dist, `index.ts` in src) sits in the folder above this module's own.
  const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return ['index.js', 'index.ts'].map((file) => path.join(dir, file)).find((file) => fs.existsSync(file));
}

/**
 * Writes a profile prompt to an owner-only file in `dir`, named by its content hash, and returns the path. Pi's
 * `--append-system-prompt` takes text or a path and reads an existing path as a file, so a prompt passed as text that
 * happens to name a file would be replaced by that file: a path it always reads is unambiguous.
 */
function promptFile(prompt: string, dir: string): string {
  const file = path.join(dir, `system-prompt-${sha256(prompt).slice(0, 16)}.md`);
  atomicWriteFileSync(file, prompt, { mode: 0o600 });
  return file;
}

/**
 * The Pi arguments of a child. It runs in RPC mode: the task is not an argument (RPC ignores a positional task and
 * rejects `@file`) but a `prompt` command that `runSubagent` writes to its stdin, so a task of any length goes whole.
 */
export function buildAgentArgs(
  profile: AgentProfile | undefined, model: string | undefined, extension = selfExtensionPath(), promptDir?: string,
  session?: { dir: string; id: string },
): string[] {
  // Ephemeral, unless it lingers: then its conversation is saved under its own name, and a follow-up resumes it.
  const args = ['--mode', 'rpc', ...(session ? ['--session-dir', session.dir, '--session-id', session.id] : ['--no-session'])];
  // `--no-extensions` also turns off Pi's built-in MCP and tool-search extensions, which serve Octocode's research tools
  // and the user's own deferred MCP servers: load them back unless the profile opts out of MCP.
  if (extension) args.push('--no-extensions', '-e', extension, ...(profile?.mcp === false ? [] : ['-e', 'builtin:mcp', '-e', 'builtin:tool-search']));
  // `model` is already resolved (`provider/id`, optionally `:thinking`); none means the parent's model. The profile's own
  // preference is routed by `routeModel` before this, so an unavailable one never reaches Pi.
  if (model) args.push('--model', model);
  if (profile?.tools) args.push('--tools', profile.tools);
  if (profile?.excludeTools) args.push('--exclude-tools', profileExcludes(profile.excludeTools).join(','));
  if (profile?.prompt) args.push('--append-system-prompt', promptFile(profile.prompt, promptDir ?? sessionOutputDir('output')));
  return args;
}

/** How long a stopped subagent gets to exit after SIGTERM before it is killed (a session shutdown, a permission change, a stall). */
export const SUBAGENT_STOP_GRACE_MS = 5_000;
/** The same for a stop the user asked for (Esc, `/agents kill`): the row frees at once instead of after the full grace. */
const USER_STOP_GRACE_MS = 1_000;
/** How long an aborted child gets to report `agent_settled` before the stop falls back to signals. */
export const ABORT_SETTLE_MS = 1_000;
/** Abort reason of a stop the user asked for; any other reason gets the full grace. */
export const USER_STOP = 'user stop';
/** JSON events can contain images; a malformed child must not grow an unterminated frame forever. */
export const MAX_EVENT_BYTES = 16 * 1024 * 1024;

/** After the child exits, how long its stdio gets to drain before the run settles without waiting for `close` (a grandchild may hold the pipes open). */
const EXIT_GRACE_MS = 1_000;

export interface WatchdogLimits {
  /**
   * Quiet time before a child counts as hung: no running tool, not settling after its answer, and no event at all. A
   * running tool (or the hold on background jobs after the answer) is busy, however long it stays silent: it ends on
   * its own deadline, and the user can stop it.
   */
  idleMs: number;
  /**
   * How long a busy child may stay busy past a call (or its answer) when that call declares no `timeout`; a call that
   * declares one gets that. Past it plus `idleMs`, a tool that never ends (or a hold that never settles) is hung.
   */
  busyMs: number;
}

/** A model stream silent this long has stalled; busy time is bounded by each call's own deadline, else 15 minutes (bash's default). */
export const WATCHDOG: WatchdogLimits = { idleMs: 10 * 60_000, busyMs: 15 * 60_000 };

/** A call's own deadline in ms: its `timeout` argument (seconds), when it declares one. */
function declaredTimeout(args: unknown): number | undefined {
  const seconds = isRecord(args) ? args['timeout'] : undefined;
  return typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : undefined;
}

/** Why a child ended without a usable answer: its exit code, or the signal that killed it. */
export function exitReason(code: number | null, signal: NodeJS.Signals | null): string {
  return code === null && signal ? `was killed by ${signal}` : `exited with code ${code ?? 'unknown'}`;
}

/** One step of a running child, for the parent's live row. */
export interface ChildProgress {
  /** A tool call it started (`→ bash ls`). */
  activity?: string | undefined;
  /** A step of its reasoning that is not a tool call: a thought's gist (`✻ …`) or its narration (`› …`) once a reply ends. */
  step?: string | undefined;
  /** The gist of the thinking it streams now; empty once that thinking ends. */
  thinking?: string | undefined;
  /** Its usage so far. */
  usage: Usage;
  /** The assistant reply that just ended (with its `provider`, `model` and `usage`): its model may have no pricing. */
  reply?: Record<string, unknown>;
  /** The latest screenshot a tool returned. */
  image?: { data: string; mimeType: string };
  /** A tool call the child could not run without the user's approval (it has no one to ask). */
  denied?: boolean;
  /** The child waits for the user's answer to a dialog (`true`), or that answer arrived (`false`). */
  waiting?: boolean;
}

interface SubagentOutcome {
  text: string;
  usage: Usage;
  /** Set when the child's model call failed (stopReason error/aborted). */
  error?: string;
}

/**
 * Whether the exited child's process group (POSIX; the child leads one) still has live members. Each is checked against
 * the start time `ps` just reported, so a pid the system handed to another process is never signalled; when `ps`
 * cannot be read, a live group counts. Windows has no process group: the child's Job Object (`adoptTree`) ends its
 * tree through `stopTree`, which the caller runs after any exit.
 */
function leftBehind(pgid: number | undefined): boolean {
  if (pgid === undefined || process.platform === 'win32') return false;
  const members = groupStartTimes(pgid);
  return members ? members.some((member) => sameProcess(member.pid, member.started)) : groupAlive(pgid);
}

/**
 * Runs one child in Pi's RPC mode and resolves with its report. The task is sent as a `prompt` command on stdin. The
 * child's dialogs (`extension_ui_request`) go to `host.ui` when the parent can ask a person (see `ChildRelay`) and are
 * answered `cancelled` otherwise, which is what a child with no UI got before; its audit entries go to `host.permission`.
 * stdin is closed once the run settles (RPC children do not exit by themselves), and a stop is `abort`, then
 * `agent_settled`, then closed stdin, with signals only for a child that does not follow.
 */
export async function runSubagent(
  task: string,
  args: string[],
  cwd: string,
  profile: AgentProfile | undefined,
  identity: Identity,
  signal: AbortSignal | undefined,
  onProgress: (progress: ChildProgress) => void,
  onSpawn?: (pid: number) => void,
  limits: WatchdogLimits = WATCHDOG,
  host?: RelayHost,
): Promise<SubagentOutcome> {
  if (signal?.aborted) throw new Error('Subagent cancelled');
  const { command, prefix } = piInvocation();
  // Windows: the helper that owns the child's job runs before the child, so no grandchild escapes the job.
  await prepareTree();
  if (signal?.aborted) throw new Error('Subagent cancelled');
  return new Promise((resolve, reject) => {
    // Detached on POSIX so the child leads a process group: cancelling kills its whole tree (MCP servers, Chrome, bash).
    const child = spawn(command, [...prefix, ...args], { cwd, env: subagentProcessEnv(profile, process.env, identity), stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    adoptTree(child.pid);
    const usage = emptyUsage();
    const report = new ReportTracker(identity.scratch ?? reportDir(identity.id));
    let buffer = '';
    let stderr = '';
    let frameBytes = 0;
    let streamFailure: Error | undefined;
    // A write to a child that already exited fails with EPIPE; its exit settles the run.
    child.stdin.on('error', () => undefined);
    const send = (command: Record<string, unknown>): boolean => {
      if (child.stdin.destroyed || child.stdin.writableEnded) return false;
      child.stdin.write(`${JSON.stringify(command)}\n`);
      return true;
    };
    /** Closing stdin is how an RPC child is told to shut down in order. */
    const closeInput = () => {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
    };
    /** Between `agent_start` and `agent_settled`: only a running child has anything to abort. */
    let running = false;
    let settledSeen = false;
    let onSettled: (() => void) | undefined;
    const settledEvent = new Promise<void>((resolve) => void (onSettled = resolve));
    let onExit: (() => void) | undefined;
    const exitEvent = new Promise<void>((resolve) => void (onExit = resolve));
    const stop = async (graceMs: number): Promise<void> => {
      if (running && send({ type: 'abort' })) await settleWithin(settledEvent, ABORT_SETTLE_MS);
      closeInput();
      // A child that settled leaves on its own once its input is closed; one that did not gets the signals at once.
      if (settledSeen) await settleWithin(exitEvent, graceMs);
      await stopTree(child.pid, graceMs);
    };
    // One stop per run. The run settles only after it: the SIGKILL of a tree that ignored SIGTERM (and of detached
    // helpers like a Chrome the child launched) then happens before the parent can exit, not on a timer lost with it.
    let stopped: Promise<void> | undefined;
    const abort = () => {
      relay.cancelAll();
      stopped ??= stop(signal?.reason === USER_STOP ? USER_STOP_GRACE_MS : SUBAGENT_STOP_GRACE_MS);
    };
    signal?.addEventListener('abort', abort, { once: true });
    // Watchdog: a child stuck on a stalled model stream emits nothing; stop it instead of spinning forever.
    let activeAt = Date.now();
    let lastActivity = 'started';
    let toolsRunning = 0;
    let settling = false;
    /** While busy (tools running, or settling after the answer), the child is hung only past this moment. */
    let busyUntil = 0;
    /** The longest deadline of a background job it started: settling waits for timed jobs. */
    let jobsMs = 0;
    let stalled: Error | undefined;
    let cancelled = false;
    const thought = new Thought();
    // While the child waits for the user's answer it is not hung, however long the user takes.
    let waitingSince = 0;
    const relay = new ChildRelay(identity, host, {
      send: (response) => void send({ type: 'extension_ui_response', ...response }),
      onWaiting: (waiting) => {
        const now = Date.now();
        if (waiting) waitingSince = now;
        else {
          // The wait does not count against the child's deadlines.
          busyUntil += now - waitingSince;
          activeAt = now;
        }
        progress({ usage, waiting });
      },
    });
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (streamFailure || stalled || relay.open > 0) return;
      const busy = toolsRunning > 0 || settling;
      if (busy ? now < busyUntil : now - activeAt < limits.idleMs) return;
      stalled = busy
        ? new Error(`Subagent stopped: ${lastActivity} ran past its own deadline; last output ${formatDuration(now - activeAt)} ago. Its process tree was killed.`)
        : new Error(`Subagent stopped: no output for ${formatDuration(now - activeAt)}; last activity: ${lastActivity}, ${formatDuration(now - activeAt)} ago. Its process tree was killed.`);
      abort();
    }, Math.max(250, Math.min(30_000, limits.idleMs / 4)));
    watchdog.unref();
    // Progress is display only: a failure there (a screenshot write, a stale render) must not throw out of the stream handler.
    const progress: typeof onProgress = (update) => {
      try {
        onProgress(update);
      } catch {
        // Keep the run going; the final answer does not depend on it.
      }
    };
    /** The prompt command's own answer; every other `response` is for a command this parent never sends. */
    const promptResponse = (event: Record<string, unknown>) => {
      if (event['command'] !== 'prompt') return;
      if (event['success'] === false) {
        streamFailure = new Error(`Subagent rejected its task: ${typeof event['error'] === 'string' ? event['error'] : 'no reason given'}`);
        abort();
        return;
      }
      // An extension command consumed the prompt: no run starts, so no `agent_settled` will come.
      if (isRecord(event['data']) && event['data']['disposition'] === 'handled') closeInput();
    };
    const handleLine = (line: string) => {
      const event = parseEvent(line);
      if (!event) return;
      if (event['type'] === 'response') return promptResponse(event);
      if (event['type'] === 'extension_ui_request') return relay.handle(event);
      // Calls a tool makes itself (a codemode script) are part of that call, not activity of their own.
      if (event['parentToolCallId']) return;
      if (event['type'] === 'agent_start') running = true;
      if (event['type'] === 'agent_settled') {
        // Pi can abort after a normal reply or between tools without an aborted assistant message.
        // A watchdog stopping shutdown after an answer still preserves that completed report.
        cancelled = event['aborted'] === true && !stalled;
        running = false;
        settledSeen = true;
        onSettled?.();
        // The run is over and the report is in: the child has nothing left to do, so it is told to leave.
        closeInput();
        return;
      }
      // A new turn or a streaming reply means the previous turn's tools are over, even one that never reported its end.
      if (event['type'] === 'turn_start' || event['type'] === 'message_update') toolsRunning = 0;
      // A turn after the answer (a background job's report woke it) is a model turn again, not settling.
      if (event['type'] === 'turn_start') settling = false;
      if (event['type'] === 'message_update' && isRecord(event['assistantMessageEvent'])) {
        const update = event['assistantMessageEvent'];
        if (update['type'] === 'thinking_start') thought.reset();
        if (update['type'] === 'thinking_delta' && typeof update['delta'] === 'string' && thought.add(update['delta'])) progress({ usage, thinking: thought.gist ?? '' });
        return;
      }
      if (event['type'] === 'tool_execution_start') {
        toolsRunning++;
        settling = false;
        const own = declaredTimeout(event['args']);
        if (own !== undefined && isRecord(event['args']) && event['args']['background'] === true) jobsMs = Math.max(jobsMs, own);
        busyUntil = Math.max(busyUntil, Date.now() + (own ?? limits.busyMs) + limits.idleMs);
        lastActivity = describeToolCall(event['toolName'], event['args']);
        progress({ activity: lastActivity, usage });
      }
      if (event['type'] === 'tool_execution_end') {
        toolsRunning = Math.max(0, toolsRunning - 1);
        const image = imagesOf(event['result']).at(-1);
        if (image) progress({ usage, image });
        const result = event['result'];
        if (event['isError'] === true && isRecord(result) && contentText(result['content']).startsWith(NEEDS_APPROVAL)) progress({ usage, denied: true });
      }
      if (event['type'] !== 'message_end' || !isRecord(event['message'])) return;
      const message = event['message'];
      if (message['role'] !== 'assistant') {
        report.incoming(message['role']);
        return;
      }
      addUsage(usage, message['usage']);
      thought.reset();
      for (const step of replySteps(message)) progress({ usage, step });
      progress({ usage, reply: message, thinking: '' });
      settling = message['stopReason'] !== 'toolUse';
      if (settling) busyUntil = Date.now() + Math.max(jobsMs, limits.busyMs) + limits.idleMs;
      lastActivity = settling ? 'answered; settling' : 'model turn';
      report.answer(assistantText(message), message['stopReason'], message['errorMessage']);
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (streamFailure) return;
      activeAt = Date.now();
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf('\n', start);
        const part = chunk.slice(start, newline < 0 ? undefined : newline);
        frameBytes += Buffer.byteLength(part);
        if (frameBytes > MAX_EVENT_BYTES) {
          streamFailure = new Error(`Subagent JSON event exceeds ${MAX_EVENT_BYTES} bytes`);
          buffer = '';
          abort();
          return;
        }
        buffer += part;
        if (newline < 0) break;
        handleLine(buffer);
        buffer = '';
        frameBytes = 0;
        start = newline + 1;
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = cutText(stderr + chunk, 4000, { chars: true, tail: true });
    });
    // The run settles once, from `close` (stdio drained) or, when a grandchild that left the process group keeps the
    // pipes open, from `exit` plus a short grace: the tool call must return and its slot be freed either way.
    let finished = false;
    let exitGrace: NodeJS.Timeout | undefined;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      relay.cancelAll();
      clearInterval(watchdog);
      clearTimeout(exitGrace);
      signal?.removeEventListener('abort', abort);
      return true;
    };
    child.on('error', (error) => {
      if (finish()) reject(error);
    });
    child.on('exit', (code, exitSignal) => {
      onExit?.();
      // A dialog of a child that is gone has nobody to answer: close it in the parent's UI.
      relay.cancelAll();
      if (finished) return;
      clearInterval(watchdog);
      // What the child left in its own process group (an MCP server, a dev server, a Chrome) dies with the run, and
      // before the run settles: the caller removes the child's worktree next, and a holder must not outlive that.
      if (leftBehind(child.pid)) stopped ??= stopTree(child.pid, SUBAGENT_STOP_GRACE_MS);
      exitGrace = setTimeout(() => settle(code, exitSignal), EXIT_GRACE_MS);
    });
    child.on('close', (code, exitSignal) => settle(code, exitSignal));
    const settle = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      if (!finish()) return;
      if (stopped) void stopped.then(() => conclude(code, exitSignal));
      else conclude(code, exitSignal);
    };
    const conclude = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      for (const stream of [child.stdout, child.stderr]) stream.destroy();
      if (buffer.trim()) handleLine(buffer);
      const { text: finalText, body: progress, pointer, error, answered } = report.result();
      if (streamFailure) reject(streamFailure);
      // A child stopped while settling after its answer still delivers that answer.
      else if (stalled && !answered) reject(stalled);
      else if (signal?.aborted && !answered) reject(new Error('Subagent cancelled'));
      // The child's report and stderr are untrusted text headed for the model and the terminal. A crash before any
      // final answer is a failure even when the child narrated progress first: narration is not a report.
      else if (code !== 0 && !answered) {
        // The progress text is cut to 500 characters (the cut is stated); the pointer to the saved report is always kept.
        const last = finalText ? `\nLast progress: ${capChars(sanitizeTerminalText(progress).trim(), 500)}${pointer ? `\n${sanitizeTerminalText(pointer)}` : ''}` : '';
        reject(new Error(`Subagent ${exitReason(code, exitSignal)}: ${sanitizeTerminalText(stderr).trim() || 'no output'}${last}`));
      }
      else {
        const failure = cancelled ? 'Subagent cancelled before its run settled' : error;
        resolve({ text: sanitizeTerminalText(finalText), usage, ...(failure ? { error: sanitizeTerminalText(failure) } : {}) });
      }
    };
    // Install cleanup before invoking a callback that can fail (for example, recording worktree ownership).
    try {
      if (child.pid !== undefined) onSpawn?.(child.pid);
    } catch (error) {
      streamFailure = error instanceof Error ? error : new Error(String(error));
      abort();
    }
    if (!streamFailure) send({ type: 'prompt', message: task });
  });
}

/** Where a child without a scratch folder (an unwritable workspace) spills a long report, so a cut report always has its whole copy. */
function reportDir(id: string): string | undefined {
  try {
    return privateDir(path.join(sessionOutputDir('output'), `agent-${id.replace(/[^\w.-]/g, '_')}`));
  } catch {
    return undefined;
  }
}

function parseEvent(line: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(line) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function assistantText(message: unknown): string | undefined {
  if (!isRecord(message) || message['role'] !== 'assistant' || !Array.isArray(message['content'])) return undefined;
  const text = message['content']
    .filter((part): part is { type: 'text'; text: string } => isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
  return text || undefined;
}

/** A reply's reasoning as trail lines: each thinking block's gist, then its narration when tool calls follow (a final answer is the report). */
export function replySteps(message: Record<string, unknown>): string[] {
  if (!Array.isArray(message['content'])) return [];
  const steps: string[] = [];
  for (const part of message['content']) {
    if (!isRecord(part)) continue;
    const gist = part['type'] === 'thinking' && typeof part['thinking'] === 'string' ? thoughtGist(part['thinking'], true) : undefined;
    if (gist) steps.push(`✻ ${gist}`);
  }
  const narration = message['stopReason'] === 'toolUse' ? assistantText(message) : undefined;
  if (narration) steps.push(`› ${redactSecrets(narration.replace(/\s+/g, ' '))}`);
  return steps;
}

function describeToolCall(name: unknown, args: unknown): string {
  const hint = toolHint(args);
  return `→ ${String(name)}${hint ? ` ${hint}` : ''}`;
}
