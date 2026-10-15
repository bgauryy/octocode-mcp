import { spawn } from 'node:child_process';
import { formatSize } from '@earendil-works/pi-coding-agent';
import { KILL_GRACE_MS, killTree } from '../shared/process.js';
import { visibleControls } from '../shared/sanitize.js';
import { capOutputToFile } from '../shared/spill.js';
import { firstLine, isRecord, parseJson } from '../shared/util.js';
import type { HookCommand, HookEvent } from './config.js';

/** Context a hook may add to the conversation, as in the native host. */
export const HOOK_CONTEXT_MAX_BYTES = 16 * 1024;
const OUTPUT_MAX_BYTES = 64 * 1024;

interface HookRun {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Bytes of stdout and stderr past `OUTPUT_MAX_BYTES` that were not kept (memory stays bounded for a runaway hook). */
  dropped?: { stdout: number; stderr: number };
}

/** Runs `hook.command` through the shell with `input` as JSON on stdin. Never rejects. */
export function runHook(hook: HookCommand, input: Record<string, unknown>, cwd: string, env: NodeJS.ProcessEnv = {}, signal?: AbortSignal): Promise<HookRun> {
  if (signal?.aborted) return Promise.resolve({ code: null, stdout: '', stderr: '', timedOut: false });
  return new Promise((resolve) => {
    // Detached on POSIX makes the shell a process-group leader, so a timeout can kill everything it started.
    const child = spawn(hook.command, { cwd, shell: true, detached: process.platform !== 'win32', env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    const collect = (chunks: Buffer[], size: number, chunk: Buffer): number => {
      if (size < OUTPUT_MAX_BYTES) chunks.push(chunk.subarray(0, OUTPUT_MAX_BYTES - size));
      return size + chunk.length;
    };
    child.stdout.on('data', (chunk: Buffer) => (outBytes = collect(out, outBytes, chunk)));
    child.stderr.on('data', (chunk: Buffer) => (errBytes = collect(err, errBytes, chunk)));
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    const stop = () => {
      if (deadline) return;
      // The whole tree: the shell's children and grandchildren too, not only the shell.
      killTree(child.pid, KILL_GRACE_MS);
      // A grandchild that survives or holds stdio open must not hold the run: resolve anyway after the grace.
      deadline = setTimeout(() => finish(null), 2 * KILL_GRACE_MS);
      deadline.unref();
      child.unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, hook.timeoutMs);
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
    const finish = (code: number | null, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
      signal?.removeEventListener('abort', stop);
      const dropped = { stdout: Math.max(0, outBytes - OUTPUT_MAX_BYTES), stderr: Math.max(0, errBytes - OUTPUT_MAX_BYTES) };
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: `${Buffer.concat(err).toString('utf8')}${extra}`, timedOut, ...(dropped.stdout + dropped.stderr > 0 ? { dropped } : {}) });
    };
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => finish(code));
    // A hook that ignores stdin closes the pipe early; that is not an error.
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(input));
  });
}

export interface HookVerdict {
  /** Set when the hook blocks: the reason shown to the model. */
  block?: string;
  /** Text the hook adds to the conversation. */
  context?: string;
  /** Set when a PreToolUse hook answers `permissionDecision: "ask"`: the reason the user is asked with, in every mode. */
  ask?: string;
}

/**
 * Claude Code semantics: exit 2 blocks with stderr as the reason; exit 0 may print JSON with `decision: "block"`,
 * `continue: false`, `hookSpecificOutput.permissionDecision: "deny"` or `additionalContext`; plain SessionStart stdout
 * is context. A PreToolUse `permissionDecision: "ask"` asks the user; `"allow"` skips no ask. Any other exit is a
 * non-blocking error.
 */
export function interpret(event: HookEvent, run: HookRun): HookVerdict {
  // Hook output is untrusted text: it reaches the model and Pi's tool errors without escape sequences.
  const { block, context, ask } = verdictOf(event, run);
  return { ...(block ? { block: visibleControls(block) } : {}), ...(context ? { context: visibleControls(context) } : {}), ...(ask ? { ask: visibleControls(ask) } : {}) };
}

function verdictOf(event: HookEvent, run: HookRun): HookVerdict {
  // Notification hooks are side effects only: they cannot block or add context.
  if (run.timedOut || event === 'Notification' || event === 'PostMessageReceive') return {};
  // Output past the kept bytes is counted, never dropped silently.
  const notKept = (bytes = 0) => (bytes > 0 ? `\n[… ${formatSize(bytes)} more output not kept: a hook's output is read up to ${formatSize(OUTPUT_MAX_BYTES)}]` : '');
  if (run.code === 2) return { block: run.stderr.trim() ? `${run.stderr.trim()}${notKept(run.dropped?.stderr)}` : 'Blocked by a hook.' };
  if (run.code !== 0) return {};
  const value = parseJson(run.stdout);
  const json = isRecord(value) ? value : undefined;
  if (!json) return event === 'SessionStart' && run.stdout.trim() ? { context: `${run.stdout.trim()}${notKept(run.dropped?.stdout)}` } : {};
  const specific = isRecord(json.hookSpecificOutput) ? json.hookSpecificOutput : {};
  const reason = [json.reason, json.stopReason, specific.permissionDecisionReason].find((value): value is string => typeof value === 'string' && value.trim() !== '');
  const context = typeof specific.additionalContext === 'string' && specific.additionalContext.trim() ? specific.additionalContext.trim() : undefined;
  // For Stop, `continue: false` means "stop for good", the opposite of blocking (which keeps the agent going).
  const blocked = json.decision === 'block' || (event !== 'Stop' && (json.continue === false || specific.permissionDecision === 'deny'));
  const asks = !blocked && (event === 'PreToolUse' || event === 'PreMessageSend') && specific.permissionDecision === 'ask';
  return { ...(blocked ? { block: reason ?? 'Blocked by a hook.' } : {}), ...(asks ? { ask: reason ?? `A ${event} hook asks you to confirm this call.` } : {}), ...(context && event !== 'PreMessageSend' ? { context } : {}) };
}

/**
 * Why a `PreToolUse` hook did not give an answer: it timed out, crashed (could not start, was killed, or exited with a
 * code other than 0 and 2), or printed JSON that does not parse to an object (plain text is a normal answer). Hooks fail open, as in Claude Code, so a
 * broken security hook would allow every call: the caller shows this and audits it, and denies when the hook is
 * `failClosed`. Undefined when the hook answered, or the run was cancelled.
 */
export function failureOf(hook: Pick<HookCommand, 'timeoutMs'>, run: HookRun, cancelled: boolean): string | undefined {
  if (cancelled) return undefined;
  if (run.timedOut) return `timed out after ${hook.timeoutMs / 1000}s`;
  if (run.code === null) return `crashed${run.stderr.trim() ? `: ${firstLine(run.stderr.trim())}` : ' (could not run or was killed)'}`;
  if (run.code !== 0 && run.code !== 2) return `crashed (exit ${run.code})`;
  const out = run.stdout.trim();
  if (run.code === 0 && /^[[{]/.test(out) && !isRecord(parseJson(out))) return 'printed invalid JSON';
  return undefined;
}

/** Keeps hook text within 16 KB: longer text is saved whole to a file and shown as its head and tail with the path. */
export function capContext(text: string, maxBytes = HOOK_CONTEXT_MAX_BYTES): string {
  return capOutputToFile(text, { label: 'hook', maxBytes });
}
