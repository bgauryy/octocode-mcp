import { keyText, type ExtensionContext, type Theme, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from '@earendil-works/pi-tui';
import { formatDuration, shortPath } from './format.js';
import { sanitizeTerminalText } from './sanitize.js';
import { exclusive, takeTiming } from './locks.js';
import { clipText, contentText, firstLine, isRecord } from './util.js';

/**
 * Shared tool presentation, in the shape Claude Code and Codex use:
 *
 *   ● Name(summary) · 1.2s
 *     ⎿  one-line summary
 *        up to 3 preview lines
 *        … +K lines (ctrl+o to expand)
 *
 * The glyph is ○ before execution (`waiting` once Pi started the call but its checks or approval still run), ● accent
 * while running (the newest row with a live 1s clock), ● green when done and ✗ red on error. Expanded shows every line. Every string drawn here is sanitized: tool arguments and output are untrusted.
 */

/** Result lines shown while collapsed. */
export const COLLAPSED_LINES = 3;
/** Header summary budget in characters, before the width clip. */
const SUMMARY_CHARS = 120;
const SUMMARY_CHARS_EXPANDED = 200;
const GUTTER = '  ⎿  ';
const INDENT = '     ';

/**
 * The expand key. Pi loads extensions with their own copy of pi-tui, whose keybinding registry has no `app.*`
 * entries, so `keyText` comes back empty there; fall back to Pi's default binding.
 */
export function expandKey(): string {
  return appKey('app.tools.expand', 'ctrl+o');
}

/** The key bound to a Pi app action, or Pi's default binding when the registry has none (see `expandKey`). */
export function appKey(action: string, fallback: string): string {
  try {
    return keyText(action as never) || fallback;
  } catch {
    return fallback;
  }
}

/** `1 line`, `2 lines`; pass `many` for irregular plurals. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One sanitized line of at most `max` characters, ending in `…` when cut. */
export function clip(text: string, max: number): string {
  return clipText(firstLine(sanitizeTerminalText(text).replace(/\t/g, ' ')).trim(), max);
}

/** Renderer state kept per tool row (`context.state`). */
export interface ToolRow {
  /** When a row without a call id first drew as running (see `runStart`). */
  startedAt?: number;
  /** The row holds the clock now: it is the newest running row (see `track`). */
  ticking?: boolean;
  /** The row took the clock once; a row that lost it to a newer one never takes it back. */
  clocked?: boolean;
  /** `checks 1.2s · queued 3s`: the time the call waited before it ran (see `timingOf`). */
  waits?: string;
  /** The call was interrupted (Esc, a kill, a requested stop), not failed: drawn `◼` in the warning colour. */
  stopped?: boolean;
}

/** The part of Pi's ToolRenderContext these helpers read. */
export interface RenderContext {
  lastComponent?: Component | undefined;
  state?: unknown;
  invalidate?: () => void;
  executionStarted?: boolean;
  isPartial?: boolean;
  isError?: boolean;
  expanded?: boolean;
  /** Pi's recorded execution time, including when a completed row is restored. */
  durationMs?: number | undefined;
  /** The call's arguments (Pi passes them to both renderers). */
  args?: unknown;
  /** The tool call the row draws; its run start is what `timed` recorded under it. */
  toolCallId?: string;
}

type Phase = 'pending' | 'running' | 'done' | 'error' | 'stopped';

function phaseOf(context: RenderContext): Phase {
  if (context.isPartial === false) return context.isError ? 'error' : 'done';
  return context.executionStarted ? 'running' : 'pending';
}

function rowState(context: RenderContext): ToolRow {
  return isRecord(context.state) ? (context.state as ToolRow) : {};
}

function glyph(theme: Theme, phase: Phase): string {
  switch (phase) {
    case 'pending':
      return theme.fg('dim', '○');
    case 'running':
      return theme.fg('accent', '●');
    case 'done':
      return theme.fg('success', '●');
    case 'error':
      return theme.fg('error', '✗');
    case 'stopped':
      return theme.fg('warning', '◼');
  }
}

/**
 * When each call's run began, recorded by `timed`. Pi marks a batch's calls started before their `tool_call` checks
 * and approval dialogs ran, and its final duration counts only the run: the live clock starts here to match it.
 */
const runStarts = new Map<string, number>();
/** Bounded: nested calls (`file` running Pi's tools) record starts no row ever reads; dropped oldest first. */
const RUN_STARTS_MAX = 512;
/** Rows drawn as waiting, each redrawn once when its run begins. */
const waitingRows = new Map<string, () => void>();

function markRun(toolCallId: string): void {
  if (runStarts.has(toolCallId)) return;
  runStarts.set(toolCallId, Date.now());
  if (runStarts.size > RUN_STARTS_MAX) runStarts.delete(runStarts.keys().next().value!);
  const redraw = waitingRows.get(toolCallId);
  waitingRows.delete(toolCallId);
  redraw?.();
}

/** When the row's run began, or undefined while it still waits for its checks, approval or a lock. */
function runStart(context: RenderContext, state: ToolRow): number | undefined {
  return typeof context.toolCallId === 'string' ? runStarts.get(context.toolCallId) : (state.startedAt ??= Date.now());
}

/**
 * The one ticking row. A changed line above the viewport makes pi-tui clear and redraw the whole scrollback, so a
 * clock ticking on a row that scrolled off would flicker and yank the user out of scrollback every second. Only the
 * newest running row ticks (it is the last row, nearest the viewport); the working line shows how long the run took.
 */
let clock: { state: ToolRow; invalidate: () => void; timer: ReturnType<typeof setInterval> } | undefined;

function stopClock(): void {
  if (!clock) return;
  clearInterval(clock.timer);
  clock.state.ticking = false;
  clock = undefined;
}

/** Stop the clock and forget run starts (on `agent_end` and `session_shutdown`: no row is still running). */
export function stopRowTimers(): void {
  stopClock();
  waitingRows.clear();
  runStarts.clear();
}

/**
 * The newest running row takes the clock; the row that held it drops its time (redrawn once, while it still sits just
 * above the new row) and never ticks again. The clock stops on the final result.
 */
function track(context: RenderContext, phase: Phase): ToolRow {
  const state = rowState(context);
  const id = context.toolCallId;
  if (phase === 'running') {
    if (id !== undefined && context.invalidate && runStart(context, state) === undefined) waitingRows.set(id, context.invalidate);
    if (!state.clocked && context.invalidate) {
      state.clocked = true;
      const previous = clock?.invalidate;
      stopClock();
      // Redrawn after this pass: invalidating another row from inside this row's render would re-enter Pi's display.
      if (previous) queueMicrotask(previous);
      const invalidate = context.invalidate;
      const timer = setInterval(() => {
        if (runStart(context, state) !== undefined) invalidate();
      }, 1_000);
      timer.unref?.();
      clock = { state, invalidate, timer };
      state.ticking = true;
    }
  } else if (phase !== 'pending') {
    if (clock?.state === state) stopClock();
    if (id !== undefined) {
      runStarts.delete(id);
      waitingRows.delete(id);
    }
  }
  return state;
}

/** Summaries of an interrupted call: Esc (`aborted`), a kill or a requested stop. */
const STOPPED = /^(?:error:\s*)?(?:(?:the )?(?:operation|request|run) (?:was )?aborted|aborted|interrupted|cancell?ed|stopped\b)/i;

/**
 * A list of lines clipped to the render width (`wrap` lines wrap instead). The output is cached per width until the
 * next `set`: pi-tui draws up to 60 frames a second while streaming, and its Box compares a child's lines by identity.
 */
class Lines implements Component {
  private rows: Array<{ text: string; wrap?: boolean; indent?: string }> = [];
  private header: { left: string; summary: string; right: string } | undefined;
  private cache: { width: number; lines: string[] } | undefined;

  set(header: Lines['header'], rows: Lines['rows']): this {
    this.header = header;
    this.rows = rows;
    this.cache = undefined;
    return this;
  }

  render(width: number): string[] {
    if (this.cache?.width === width) return this.cache.lines;
    const out: string[] = [];
    if (this.header) {
      const { left, summary, right } = this.header;
      const room = width - visibleWidth(left) - visibleWidth(right);
      out.push(room >= 4 || !summary ? truncateToWidth(`${left}${summary ? truncateToWidth(summary, Math.max(0, room), '…') : ''}${right}`, width, '…') : truncateToWidth(`${left}${right}`, width, '…'));
    }
    for (const row of this.rows) {
      if (!row.wrap) {
        out.push(truncateToWidth(row.text, width, '…'));
        continue;
      }
      const indent = row.indent ?? '';
      const wrapped = wrapTextWithAnsi(row.text, Math.max(1, width - visibleWidth(indent)));
      // A width narrower than the indent still gets lines that fit: the indent and text are clipped together.
      for (const line of wrapped.length > 0 ? wrapped : ['']) out.push(truncateToWidth(`${indent}${line}`, width, '…'));
    }
    this.cache = { width, lines: out };
    return out;
  }

  invalidate(): void {
    this.cache = undefined;
  }
}

function lines(context: RenderContext): Lines {
  return context.lastComponent instanceof Lines ? context.lastComponent : new Lines();
}

/** Header sub-lines shown while collapsed, when more than one would be folded. */
const COLLAPSED_SUB_LINES = 3;

/**
 * `<glyph> Name(summary) · 1.2s`, clipped to the width with the time kept. `lines` are extra sub-lines (one per
 * query of a batched call), clipped to the width; collapsed, the first 3 show and `… +N more` counts the rest. Callers
 * sanitize them (they may be styled). Pi owns completed execution timing; while running, the newest row shows the time
 * since its run began (`timed` records it, so the tool must be wrapped by `timed`), and a row still waiting for its
 * checks, approval or lock says `waiting`. Custom messages can supply a duration.
 */
export function toolHeader(theme: Theme, context: RenderContext, name: string, summary: string, options: { durationMs?: number; meta?: string; lines?: string[] } = {}): Component {
  const base = phaseOf(context);
  const state = track(context, base);
  const start = base === 'running' ? runStart(context, state) : undefined;
  const waiting = base === 'running' && start === undefined;
  const phase: Phase = base === 'error' && state.stopped ? 'stopped' : waiting ? 'pending' : base;
  const measured = state.ticking && start !== undefined ? Date.now() - start : undefined;
  const duration = context.durationMs ?? options.durationMs ?? measured;
  const finished = phase === 'done' || phase === 'error' || phase === 'stopped';
  const time = waiting ? 'waiting' : duration !== undefined && phase !== 'pending' ? formatDuration(duration, true) : '';
  const meta = [options.meta ? clip(options.meta, 60) : '', time, finished ? (state.waits ?? '') : ''].filter(Boolean);
  const text = clip(summary, context.expanded ? SUMMARY_CHARS_EXPANDED : SUMMARY_CHARS);
  const left = `${glyph(theme, phase)} ${theme.fg('toolTitle', theme.bold(clip(name, 60)))}${text ? theme.fg('muted', '(') : ''}`;
  const right = `${text ? theme.fg('muted', ')') : ''}${meta.length > 0 ? theme.fg('dim', ` · ${meta.join(' · ')}`) : ''}`;
  const sub = options.lines ?? [];
  // Folding one line would cost the line it saves.
  const folded = !context.expanded && sub.length > COLLAPSED_SUB_LINES + 1;
  const rows = (folded ? sub.slice(0, COLLAPSED_SUB_LINES) : sub).map((line) => ({ text: `  ${line}` }));
  if (folded) rows.push({ text: `  ${theme.fg('dim', `… +${sub.length - COLLAPSED_SUB_LINES} more (${expandKey()} to expand)`)}` });
  return lines(context).set({ left, summary: text ? theme.fg('muted', text) : '', right }, rows);
}

/** `text` as display rows: terminal controls stripped, tabs widened, blank rows at both ends dropped. */
export function bodyLines(text: string): string[] {
  const rows = sanitizeTerminalText(text).replace(/\t/g, '   ').split('\n');
  while (rows.length > 0 && rows.at(-1)!.trim() === '') rows.pop();
  while (rows.length > 0 && rows[0]!.trim() === '') rows.shift();
  return rows;
}

interface ResultBlockOptions {
  /** The `⎿` line. Sanitized; only its first line is shown. */
  summary: string;
  /** Raw output: sanitized and coloured here. */
  body?: string;
  /** How many lines the whole body has when `body` holds only its tail (a collapsed command output), for `+K lines`. */
  totalLines?: number;
  /** Pre-styled body lines (for diffs); the caller sanitized their text. Used instead of `body`. */
  lines?: string[];
  /** Pre-styled lines shown before the body only when expanded (a subagent's prompt); the caller sanitized them. */
  preface?: string[];
  /** What the collapsed hint calls the preface (`… +2 lines · prompt`); default `more`. */
  prefaceLabel?: string;
  /** Preview lines while collapsed (default 3). */
  max?: number;
  /** Preview the last lines instead of the first (command output). */
  tail?: boolean;
  /** Colour as an error; defaults to `context.isError`. */
  error?: boolean;
  /** Draw as interrupted rather than failed; defaults to an error whose summary says it was aborted or stopped. */
  stopped?: boolean;
  /** Where the full output was saved; shown short, and only when expanded. */
  spill?: string;
  /** The label before `spill` (default `saved`; `log` for a job's log). */
  spillLabel?: string;
  /** The pre-run waits `timingOf` read from the details; shown in the header. */
  waits?: string;
  /** Expanded view; defaults to `context.expanded` (pass renderResult's `options.expanded`). */
  expanded?: boolean;
}

/** `  ⎿  summary`, then a preview of the body and `… +K lines (ctrl+o to expand)`; the whole body when expanded. */
export function resultBlock(theme: Theme, context: RenderContext, options: ResultBlockOptions): Component {
  const state = rowState(context);
  const waitsChanged = options.waits !== undefined && state.waits !== options.waits;
  if (waitsChanged) {
    state.waits = options.waits;
    // The header already drew without these waits: redraw once, after this pass.
    if (context.invalidate) {
      const invalidate = context.invalidate;
      queueMicrotask(() => invalidate());
    }
  }
  const summary = clip(options.summary, 400);
  const failed = options.error ?? context.isError === true;
  const stopped = options.stopped ?? (failed && STOPPED.test(summary));
  if (stopped && !state.stopped) {
    state.stopped = true;
    // The header may have drawn a failure glyph already: redraw it once as interrupted.
    if (context.invalidate) {
      const invalidate = context.invalidate;
      queueMicrotask(() => invalidate());
    }
  }
  const error = failed && !stopped;
  const color = stopped ? 'warning' : error ? 'error' : 'toolOutput';
  const rows: Array<{ text: string; wrap?: boolean; indent?: string }> = [];
  if (summary) rows.push({ text: `${theme.fg('dim', GUTTER)}${theme.fg(color, error && !/^(error|failed)\b|\bfailed\b/i.test(summary) ? `Error: ${summary}` : stopped ? summary.replace(/^error:\s*/i, '') : summary)}` });
  // Raw body lines are coloured only where shown: a collapsed preview colours its few lines, not the whole output.
  const raw = options.lines ? undefined : options.body ? bodyLines(options.body) : [];
  const paint = (line: string) => (raw ? theme.fg(color, line) : line);
  const body = options.lines ?? raw!;
  const max = Math.max(0, options.max ?? COLLAPSED_LINES);
  const first = (index: number) => (!summary && index === 0 ? theme.fg('dim', GUTTER) : INDENT);
  const preface = options.preface ?? [];
  if (options.expanded ?? context.expanded) {
    preface.forEach((line, index) => rows.push({ text: line, wrap: true, indent: first(index) }));
    body.forEach((line, index) => rows.push({ text: paint(line), wrap: true, indent: first(index + preface.length) }));
    if (options.spill) rows.push({ text: `${INDENT}${theme.fg('dim', `${options.spillLabel ?? 'saved'}: ${clip(shortPath(options.spill), 300)}`)}` });
  } else {
    // Blank lines waste preview rows; they still count as hidden and show when expanded.
    const filled = body.filter((line) => (raw ? line : line.replace(/\u001b\[[0-9;]*m/g, '')).trim() !== '');
    const shown = (options.tail ? filled.slice(Math.max(0, filled.length - max)) : filled.slice(0, max)).map(paint);
    const hidden = Math.max(options.totalLines ?? 0, body.length) - shown.length;
    // The preface is named, not counted: `+2 lines` must mean two more lines of the body.
    const more = preface.length > 0 ? ` · ${options.prefaceLabel ?? 'more'}` : '';
    const folded = hidden > 0 || more !== '';
    // Summary-only tools (`⎿  Read 51 lines (ctrl+o to expand)`), or a saved path that only the expanded view shows.
    if (summary && (max === 0 ? folded || options.spill : !folded && options.spill)) rows[0] = { text: `${rows[0]!.text}${theme.fg('dim', `${max === 0 ? more : ''} (${expandKey()} to expand)`)}` };
    if (max === 0 && summary) return lines(context).set(undefined, rows);
    const hint = { text: `${INDENT}${theme.fg('dim', `${hidden > 0 ? `… +${plural(hidden, 'line')}${more}` : `… ${options.prefaceLabel ?? 'more'}`} (${expandKey()} to expand)`)}` };
    if (folded && options.tail) rows.push(hint);
    shown.forEach((line, index) => rows.push({ text: `${first(options.tail && folded ? 1 : index)}${line}` }));
    if (folded && !options.tail) rows.push(hint);
  }
  return lines(context).set(undefined, rows);
}

/** The file `capOutputToFile` (shared/spill.ts) saved the full output to, read back from its note. */
export function spillPath(text: string): string | undefined {
  return /Full output: (.+?); search it or read it by line range\.\]\s*$/.exec(text)?.[1];
}

/** Waits shorter than this are not shown: they are routine. */
const WAIT_SHOW_MS = 250;

/**
 * The pre-run waits `timed` recorded (`checks 1.2s` in `tool_call` checks such as PreToolUse
 * hooks, `queued 3s` waiting for the rest of the batch's checks or the tool's lock), for `resultBlock`'s options.
 */
export function timingOf(details: unknown): { waits?: string } {
  const wait = (key: string, label: string): string => {
    const value = isRecord(details) ? details[key] : undefined;
    return typeof value === 'number' && value >= WAIT_SHOW_MS ? `${label} ${formatDuration(value, true)}` : '';
  };
  const waits = [wait('checkMs', 'checks'), wait('queuedMs', 'queued')].filter(Boolean).join(' · ');
  return waits ? { waits } : {};
}

/**
 * Keep `checkMs` / `queuedMs` in the result when a call waited before it ran (see `takeTiming`), and start the row's
 * live clock. Pi owns execution duration; this wrapper records only the approval and queue waits. Existing details
 * are merged, never replaced. Pi passes the tool call id first; that is how the wait is found.
 */
export function timed<A extends unknown[], R>(execute: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (async (...args: A) => {
    if (typeof args[0] === 'string') markRun(args[0]);
    const waits = typeof args[0] === 'string' ? takeTiming(args[0]) : {};
    const result = await execute(...args);
    if (!isRecord(result) || Object.keys(waits).length === 0) return result;
    const details = result['details'];
    if (details === undefined || details === null) return { ...result, details: waits };
    if (isRecord(details) && !Array.isArray(details)) return { ...result, details: { ...waits, ...details } };
    return result;
  }) as (...args: A) => Promise<R>;
}

/**
 * `pi.registerTool(timedTool({ ... }))`: the tool with its `execute` wrapped by `timed`. Prefer this to
 * `execute: timed(...)`, which loses the parameter types Pi's generic `registerTool` would infer. `exclusive` adds the
 * one-call-at-a-time lock of `exclusive()`; its wait is included in `queuedMs`.
 */
export function timedTool<TParams extends TSchema, TDetails, TState>(
  tool: ToolDefinition<TParams, TDetails, TState>,
  options: { exclusive?: boolean } = {},
): ToolDefinition<TParams, TDetails, TState> {
  const execute = timed(tool.execute.bind(tool));
  if (!options.exclusive) return { ...tool, execute };
  const queued = exclusive(execute);
  // Pi's duration counts the lock wait (it times `execute`), so the live clock starts before the lock too.
  return {
    ...tool,
    execute: (...args: Parameters<typeof execute>) => {
      if (typeof args[0] === 'string') markRun(args[0]);
      return queued(...args);
    },
  };
}

export function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return sanitizeTerminalText(contentText(result.content, { image: '[image]' }));
}

type ColorToken = Parameters<Theme['fg']>[0];

/** What `statusColor` painted, by its output, so the footer can repaint it in the live theme (`livePaint`). */
const painted = new Map<string, { color: ColorToken; text: string }>();
/** Bounded: counts in statuses change; a status evicted while still shown keeps its colours until the next theme switch. */
const PAINTED_MAX = 64;

/**
 * A coloured footer status in the TUI; plain text for RPC clients, which would otherwise receive raw escape codes.
 * The footer repaints it with the theme of each frame, so a theme switch reaches statuses set before it.
 */
export function statusColor(ctx: Pick<ExtensionContext, 'mode' | 'ui'>, color: ColorToken, text: string): string {
  if (ctx.mode !== 'tui') return text;
  const out = ctx.ui.theme.fg(color, text);
  painted.delete(out);
  painted.set(out, { color, text });
  if (painted.size > PAINTED_MAX) painted.delete(painted.keys().next().value!);
  return out;
}

/** A status `statusColor` made, painted again with `theme` (the live one); any other text as it is. */
export function livePaint(text: string, theme: Pick<Theme, 'fg'>): string {
  const entry = painted.get(text);
  return entry ? theme.fg(entry.color, entry.text) : text;
}

/** Search terms first (what the call looks for), then where it looks. */
const TERM_KEYS = ['searchText', 'pattern', 'keywords', 'keywordsToSearch', 'symbolName', 'packageName', 'query', 'url', 'name'] as const;
const PATH_KEYS = ['path', 'filePath', 'uri'] as const;

function stringValue(value: unknown): string {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').join(' ') : typeof value === 'string' ? value : '';
}

/**
 * The most telling value of one query: `term in path`, `owner/repo term`, `owner/repo/path` or the term alone.
 * Unsanitized: callers clip it.
 */
export function queryTarget(query: Record<string, unknown>): string {
  const repo = typeof query['owner'] === 'string' && typeof query['repo'] === 'string' ? `${query['owner']}/${query['repo']}` : undefined;
  const term = TERM_KEYS.map((key) => stringValue(query[key])).find(Boolean) ?? '';
  const path = PATH_KEYS.map((key) => stringValue(query[key])).find(Boolean) ?? '';
  const where = repo && path ? `${repo}/${path}` : (path || repo) ?? '';
  if (term && path) return `${term} in ${where}`;
  if (term) return repo ? `${repo} ${term}` : term;
  return where;
}
