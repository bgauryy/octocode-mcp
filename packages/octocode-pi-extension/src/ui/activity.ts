import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { formatDuration } from '../shared/format.js';
import { dialogsWaiting, onDialogsChange, promptTitle } from '../shared/locks.js';
import { clip, queryTarget } from '../shared/render.js';
import { redactSecrets } from '../shared/sanitize.js';
import { Thought } from '../shared/thought.js';
import { firstLine, isRecord, toolHint } from '../shared/util.js';

/** What the model is doing between tool runs. */
type Phase = 'idle' | 'model' | 'thinking' | 'writing' | 'calling';

interface RunningTool {
  name: string;
  hint: string;
  /** Queries of the call beyond the one `hint` names. */
  more: number;
  startedAt: number;
  /** Its `tool_call` checks (reservations, the bash guard, PreToolUse hooks) run now; set while they do. */
  checkingSince?: number;
}

const TICK_MS = 1_000;
/** A consequential call's line is replaced at most this often; calls inside the window count into it (`+3`). */
const ACTION_LINE_MS = 1_000;
/** Elapsed time shows once a step has taken this long. */
const SHOW_ELAPSED_MS = 2_000;
/** Pi's working line wraps, and a wrap moves the editor: every line stays within this many columns. */
const LINE_MAX = 70;
/** Room kept for a ` · 12m34s` tail, so the clipped detail does not shift as the time grows. */
const TAIL_ROOM = 9;
/** A parallel batch names this many tools, then counts the rest. */
const BATCH_NAMES = 2;

/** `mcp__octocode__localSearch` → `localSearch`: the server prefix only costs width. */
export function shortToolName(name: string): string {
  return name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
}

/** Text for the working line and the shared team database: one line, URL credentials dropped, secrets redacted. */
function safeText(text: string): string {
  return redactSecrets(firstLine(text).replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1'));
}

/**
 * What a call works on: the goal of an `agent` call, the first query's target of a batched call (`file` and the
 * Octocode tools take `{queries: [...]}`) with the count of the others, else the top-level argument `toolHint` picks.
 */
export function callTarget(name: string, args: unknown): { hint: string; more: number } {
  const input = isRecord(args) ? args : {};
  if (shortToolName(name) === 'agent' && typeof input['goal'] === 'string') return { hint: safeText(input['goal']), more: 0 };
  const queries = Array.isArray(input['queries']) ? input['queries'].filter(isRecord) : [];
  if (queries.length > 0) return { hint: safeText(queryTarget(queries[0]!)), more: queries.length - 1 };
  return { hint: toolHint(args), more: 0 };
}

/** `head` then `detail` clipped to the room LINE_MAX leaves, then `tail`; `sep` joins head and a non-empty detail. */
function fit(head: string, sep: string, detail: string, tail: string): string {
  if (!detail) return `${head}${tail}`;
  const room = LINE_MAX - head.length - sep.length - Math.max(tail.length, TAIL_ROOM);
  return `${head}${sep}${clip(detail, Math.max(room, 12))}${tail}`;
}

/**
 * The agent's state for a run, from Pi's events: model phase, the top-level tool calls running now (parallel calls all
 * count; nested calls a tool makes are part of it), and a blocking user prompt. Pure state: `describe` renders it.
 */
export class Activity {
  phase: Phase = 'idle';
  private phaseAt = 0;
  private readonly tools = new Map<string, RunningTool>();
  private prompt: { title: string; at: number } | undefined;
  /** The latest consequential call the permission check let through, while its tool runs. */
  private action: { head: string; text: string; warn: boolean; at: number; more: number } | undefined;
  private readonly thought = new Thought();

  start(now: number): void {
    this.tools.clear();
    this.action = undefined;
    this.prompt = undefined;
    this.thought.reset();
    this.setPhase('model', now);
  }

  end(): void {
    this.tools.clear();
    this.action = undefined;
    this.prompt = undefined;
    this.thought.reset();
    this.phase = 'idle';
  }

  /** An assistant streaming event (`thinking_delta` with its `delta`, `text_start`, `toolcall_delta`, …); true when the line changed. */
  stream(type: string, now: number, delta?: string): boolean {
    const phase: Phase | undefined = type.startsWith('thinking') ? 'thinking' : type.startsWith('text') ? 'writing' : type.startsWith('toolcall') ? 'calling' : undefined;
    if (type === 'thinking_start') this.thought.reset();
    const thought = type === 'thinking_delta' && typeof delta === 'string' && this.thought.add(delta);
    if (phase && phase !== this.phase) {
      this.setPhase(phase, now);
      return true;
    }
    return thought && this.phase === 'thinking';
  }

  /** The assistant message is complete: its tools run next, or the run ends. */
  messageDone(now: number): void {
    if (this.phase !== 'idle') this.setPhase('model', now);
  }

  toolStart(id: string, name: string, args: unknown, now: number): void {
    this.tools.set(id, { name: shortToolName(name), ...callTarget(name, args), startedAt: now });
  }

  toolEnd(id: string, now: number): void {
    if (this.tools.delete(id) && this.tools.size === 0) {
      this.action = undefined;
      if (this.phase !== 'idle') this.setPhase('model', now);
    }
  }

  /**
   * A call the permission check let through (`what` is its first target). The line changes at most once per
   * `ACTION_LINE_MS`: a burst inside the window only raises the `+n` count, except a ⚠ call, which always shows itself.
   * True when the line changed.
   */
  consequential(action: string, what: string, warn: boolean, now: number): boolean {
    const held = this.action;
    if (held && now - held.at < ACTION_LINE_MS && !(warn && !held.warn)) {
      held.more += 1;
      return true;
    }
    this.action = { head: action, text: what, warn, at: now, more: 0 };
    return true;
  }

  /** A call's `tool_call` checks started (`active`) or ended. Pi checks the calls of a batch one at a time. */
  checking(id: string, active: boolean, now: number): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    if (active) tool.checkingSince = now;
    else delete tool.checkingSince;
  }

  promptStart(title: string | undefined, now: number): void {
    this.prompt = { title: title ? safeText(title) : '', at: now };
  }

  promptEnd(): void {
    this.prompt = undefined;
  }

  /**
   * One line for the state, or undefined when there is nothing beyond Pi's own "Working". `now` adds the elapsed time
   * of a long step; without it the line only changes when the state does (the team panel stores it).
   */
  describe(now?: number, queuedDialogs = 0): string | undefined {
    if (this.phase === 'idle') return undefined;
    const since = (at: number) => (now !== undefined && now - at >= SHOW_ELAPSED_MS ? ` · ${formatDuration(now - at)}` : '');
    if (this.prompt) {
      const queued = queuedDialogs > 0 ? ` (+${queuedDialogs} queued)` : '';
      return fit('Waiting for you', ': ', this.prompt.title, `${queued}${since(this.prompt.at)}`);
    }
    if (this.action && this.tools.size > 0) return fit(`${this.action.warn ? '⚠ ' : ''}${this.action.head}`, ': ', this.action.text, this.action.more > 0 ? ` +${this.action.more}` : '');
    const running = [...this.tools.values()];
    const call = (verb: string, tool: RunningTool, at: number) => fit(`${verb} ${tool.name}`, ' ', tool.hint, `${tool.more > 0 ? ` +${tool.more}` : ''}${since(at)}`);
    const checking = running.find((tool) => tool.checkingSince !== undefined);
    if (checking) return call('Checking', checking, checking.checkingSince!);
    if (running.length === 1) return call('Running', running[0]!, running[0]!.startedAt);
    if (running.length > 1) {
      const counts = new Map<string, number>();
      for (const tool of running) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
      const shown = [...counts].slice(0, BATCH_NAMES);
      const names = shown.map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(' · ');
      const rest = running.length - shown.reduce((sum, [, count]) => sum + count, 0);
      return fit(`Running ${running.length} tools`, ': ', names, `${rest > 0 ? ` +${rest}` : ''}${since(Math.min(...running.map((tool) => tool.startedAt)))}`);
    }
    if (this.phase === 'thinking') return fit('Thinking', ': ', this.thought.gist ?? '', since(this.phaseAt));
    if (this.phase === 'writing') return `Writing${since(this.phaseAt)}`;
    if (this.phase === 'calling') return `Preparing tool calls${since(this.phaseAt)}`;
    // Before the first token (after a prompt or tool results): Pi's bare "Working" until the wait is long enough to time.
    return since(this.phaseAt) ? `Waiting for model${since(this.phaseAt)}` : undefined;
  }

  /** Whether a step is under way whose elapsed time grows (worth a repaint every second). */
  ticking(): boolean {
    return this.phase !== 'idle';
  }

  private setPhase(phase: Phase, now: number): void {
    this.phase = phase;
    this.phaseAt = now;
  }
}

/**
 * Feed `Activity` from Pi's events. `onChange` hears the line without elapsed time whenever it changes (the team panel
 * shows it to the parent and teammates). With a UI, Pi's working line shows the line with elapsed time, repainted each
 * second while a step runs; Pi's default comes back when the run ends.
 */
interface ActivityControl {
  activity: Activity;
  /** The gate pipeline (src/index.ts) reports a call's `tool_call` checks starting and ending. */
  checking(id: string, active: boolean): void;
  /** A call the permission check let through (`onAction` of the permission state). */
  consequential(action: string, what: string, warn: boolean): void;
}

export function registerActivity(pi: ExtensionAPI, options: { onChange?: (line: string | undefined) => void; workingLine: boolean }): ActivityControl {
  const activity = new Activity();
  let ctx: ExtensionContext | undefined;
  let shown: string | undefined;
  let reported: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  /** Repaints when interactions queue behind an open dialog; held per session. */
  let unsubscribe: (() => void) | undefined;

  const paint = () => {
    const line = activity.describe(undefined, dialogsWaiting());
    if (line !== reported) {
      reported = line;
      options.onChange?.(line);
    }
    // Only the TUI draws a working line: RPC's setWorkingMessage is a no-op, so nothing there needs a repaint timer.
    if (!options.workingLine || !ctx?.hasUI || ctx.mode !== 'tui') return;
    const working = activity.describe(Date.now(), dialogsWaiting());
    if (working !== shown) {
      shown = working;
      try {
        ctx.ui.setWorkingMessage(working);
      } catch {
        // The session was replaced.
      }
    }
    if (activity.ticking() && !timer) {
      timer = setInterval(paint, TICK_MS);
      timer.unref?.();
    } else if (!activity.ticking() && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const stop = () => {
    activity.end();
    paint();
  };

  pi.on('session_start', async (_event, next) => {
    ctx = next;
    shown = undefined;
    unsubscribe?.();
    unsubscribe = onDialogsChange(paint);
    stop();
  });
  pi.on('session_shutdown', async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    stop();
    ctx = undefined;
  });
  pi.on('agent_start', async (_event, next) => {
    ctx = next;
    activity.start(Date.now());
    paint();
  });
  pi.on('message_update', async (event) => {
    if (event.message.role !== 'assistant') return;
    const update = event.assistantMessageEvent;
    if (activity.stream(update.type, Date.now(), update.type === 'thinking_delta' ? update.delta : undefined)) paint();
  });
  pi.on('message_end', async (event) => {
    if (event.message.role !== 'assistant') return;
    activity.messageDone(Date.now());
    paint();
  });
  pi.on('tool_execution_start', async (event) => {
    if (event.parentToolCallId) return;
    activity.toolStart(event.toolCallId, event.toolName, event.args, Date.now());
    paint();
  });
  pi.on('tool_execution_end', async (event) => {
    if (event.parentToolCallId) return;
    activity.toolEnd(event.toolCallId, Date.now());
    paint();
  });
  pi.on('ui_prompt_start', async (event) => {
    activity.promptStart(promptTitle(event), Date.now());
    paint();
  });
  pi.on('ui_prompt_end', async () => {
    activity.promptEnd();
    paint();
  });
  pi.on('agent_settled', async () => stop());
  return {
    activity,
    consequential: (action, what, warn) => {
      if (activity.consequential(action, what, warn, Date.now())) paint();
    },
    checking: (id, active) => {
      activity.checking(id, active, Date.now());
      paint();
    },
  };
}
