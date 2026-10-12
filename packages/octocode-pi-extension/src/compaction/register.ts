import type { Api, Model } from '@earendil-works/pi-ai';
import type { ContextEditEntryDraft, ExtensionAPI, SessionBeforeCompactEvent, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { readPaths } from '../files/reads.js';
import type { FileGuard } from '../files/tool.js';
import { shortPath } from '../shared/format.js';
import { saveFullOutput } from '../shared/spill.js';
import { cutText, elisionMarkers, isRecord } from '../shared/util.js';
import { IMAGE_NOTE, REQUEST_PRESSURE_CHARS, contextChars, hasImage, imageChars, isRequestTooLarge, keptImageResults, parts, texts, withoutImages, type ContextEntry } from './images.js';
import { TooLargeRecovery } from './recovery.js';

/** At most this many recent tool results stay verbatim... */
export const KEEP_RECENT_RESULTS = 12;
/** ...and at least this many, whatever their size. */
export const KEEP_RECENT_MIN = 4;
/** Beyond the minimum, recent results stay verbatim only while their text fits this budget (~20k tokens). */
const KEEP_RECENT_CHARS = 80_000;
/** Older results are trimmed in batches so the trimmed prefix (and the prompt cache) changes rarely: */
export const TRIM_STEP = 10;
/** a batch of TRIM_STEP runs only if it saves this much (a smaller one costs more in cache rewrites than it saves), */
const TRIM_STEP_MIN_SAVED_CHARS = 20_000;
/** and any batch runs once it saves this much (a few huge results must not wait for ten). */
const TRIM_MIN_SAVED_CHARS = 60_000;
const TRIM_ABOVE_CHARS = 3_000;
/** A trimmed result keeps its head and its tail (where spill pointers, exit codes and summaries usually are)... */
const TRIM_HEAD_CHARS = 800;
const TRIM_TAIL_CHARS = 300;
/** What a trimmed result still costs, for the savings estimate: its head, tail and the trim note. */
const TRIM_KEEP_CHARS = 1_200;
/** ...and every line pointing at the full text on disk (`Full output: <path>`, a report or log path), clipped to this. */
const POINTER_LINE = /(?:Full output|Full report|Log): /;
const POINTER_PATH = /(?:Full output|Full report|Log): ([^\s\];]+)/;
const POINTER_MAX_CHARS = 400;
const MAX_POINTERS = 3;
/** Results of these tools show file content; trimming one takes that content out of view (see FileGuard.forget). */
const READ_TOOLS = new Set(['read']);
/** Least size an image counts as when budgeting (a tiny image still costs tokens); larger ones count their base64 length. */
const IMAGE_CHARS = 4_000;
/** Tools whose successful call arguments are on disk afterwards, so they can be shortened even in the recent window. */
const ARGS_ON_DISK_TOOLS = new Set(['file']);
/**
 * Tools whose call arguments are never shortened: a delegated task, a message or a question exists nowhere but in the
 * context, and a shortened one becomes the template the model copies into its next delegation (a subagent then gets the
 * head of its task plus a placeholder instead of the task).
 */
const KEEP_ARGS_VERBATIM_TOOLS = new Set(['agent', 'sendMessage', 'askUser']);
/** An old successful call's arguments are shrunk when their JSON exceeds this... */
const ARGS_TRIM_ABOVE_CHARS = 2_000;
/** ...by cutting each string argument longer than this to its head and a note. */
const ARG_KEEP_CHARS = 160;
/** A call counts as a candidate only when shrinking it saves at least this much. */
const ARGS_MIN_SAVED_CHARS = 1_000;

/**
 * The cache lifetime assumed, per retention, for a model that declares no `promptCache` (custom-provider models) but
 * whose responses show caching: the shortest common provider lifetimes (5 minutes short, 1 hour long), in seconds.
 */
const INFERRED_CACHE_TTL_SECONDS = { short: 300, long: 3600 } as const;

/**
 * The prompt-cache lifetime of a request to `model`, in ms, for the retention Pi uses (`PI_CACHE_RETENTION=long`, else
 * short): the model's `promptCache` tier. A model that declares none caches when `latest` (the turn's assistant
 * message) reports cache reads or writes in its usage; it gets `INFERRED_CACHE_TTL_SECONDS`. Undefined otherwise.
 */
export function promptCacheTtlMs(model: Pick<Model<Api>, 'promptCache'> | undefined, latest?: unknown, env: NodeJS.ProcessEnv = process.env): number | undefined {
  const tier = env['PI_CACHE_RETENTION'] === 'long' ? 'long' : 'short';
  if (model?.promptCache) {
    const seconds = model.promptCache[tier];
    return seconds === undefined ? undefined : seconds * 1000;
  }
  const usage = isRecord(latest) && isRecord(latest['usage']) ? latest['usage'] : undefined;
  const cached = usage !== undefined && (Number(usage['cacheRead']) > 0 || Number(usage['cacheWrite']) > 0);
  return cached ? INFERRED_CACHE_TTL_SECONDS[tier] * 1000 : undefined;
}

/** When the cached prompt was last written or refreshed, and how long such an entry lives. */
interface CacheState {
  written: number | undefined;
  ttlMs: number | undefined;
}

/** Context use (percent of the window) from which trims run even on a warm cache: the room matters more than one rewrite. */
export const TRIM_PRESSURE_PERCENT = 50;

/**
 * Whether trims may change the context now. A trim rewrites the cached prompt from the first trimmed result on, so
 * pending trims wait until the next request would miss the cache anyway (a cache lifetime passed since the prompt was
 * last written or kept warm, or the model has no prompt cache) or the context is filling up. Until then nothing
 * changes: they are planned again, from scratch, at a later turn.
 *
 * Trims run only at a turn boundary, so the cold start of a run after the user idled is not one: its first request
 * rewrites the cache before any boundary, and trimming right after would rewrite it again.
 */
export function trimsDue(cache: CacheState, usagePercent: number | null | undefined, now = Date.now(), sizeChars = 0): boolean {
  if (usagePercent != null && usagePercent >= TRIM_PRESSURE_PERCENT) return true;
  if (sizeChars >= REQUEST_PRESSURE_CHARS) return true;
  if (cache.ttlMs === undefined) return true;
  return cache.written !== undefined && now - cache.written >= cache.ttlMs;
}

/** The request time of a turn's assistant message (Pi stamps it when the request starts). */
function requestTime(message: unknown): number | undefined {
  return isRecord(message) && message['role'] === 'assistant' && typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
}

/** User decisions cannot be regenerated; subagent reports already summarize their work. Pi owns their later compaction. */
const KEEP_VERBATIM_TOOLS = new Set(['agent', 'askUser']);

/**
 * Argument-shrink verdicts remembered across turns, by tool-call id: `false` when the call never needs shrinking
 * (its arguments are too small, or its edit was already proposed), else its shrunk arguments and the gain. A
 * call's arguments do not change, so each settled call is measured once per session.
 */
export type TrimMemo = Map<string, false | { arguments: unknown; saved: number }>;

/**
 * Plan append-only context edits that shrink old, large tool results and the
 * large arguments of old successful tool calls (a written file's content, edit
 * texts: the result is on disk). Pi keeps the raw entries in the session; only
 * future model context changes. The recent window is bounded by count and size;
 * edits are proposed only when a batch saves enough to be worth rewriting the
 * cached prompt prefix. Calls whose result failed keep their arguments, so the
 * model can still see what it sent.
 */
export function planContextTrims(entries: ContextEntry[], memo: TrimMemo = new Map(), unseen: ReadonlySet<string> = new Set()): ContextEditEntryDraft[] {
  const results = entries.filter((entry) => isRecord(entry.message) && entry.message['role'] === 'toolResult');
  let kept = 0;
  let used = 0;
  for (let index = results.length - 1; index >= 0 && kept < KEEP_RECENT_RESULTS; index--) {
    const size = resultChars(results[index]!.message);
    if (kept >= KEEP_RECENT_MIN && used + size > KEEP_RECENT_CHARS) break;
    kept++;
    used += size;
  }
  // Images the model has not seen yet (this turn's) stay: a trimmed image cannot be recovered from a saved copy the way
  // text can, so a batch of screenshots would vanish unseen. Unseen text is still bounded by the recent window.
  const trimmable = (entry: ContextEntry) =>
    !(unseen.has(entry.id) && hasImage(entry.message)) && !KEEP_VERBATIM_TOOLS.has(String((entry.message as Record<string, unknown>)['toolName']));
  const candidates = results.slice(0, results.length - kept).filter((entry) => trimmable(entry) && needsTrim(entry.message));
  // Inside the recent window, results with images beyond the kept ones lose only their images.
  const keptImages = keptImageResults(results, unseen);
  const oldImages = results.slice(results.length - kept).filter((entry) => trimmable(entry) && hasImage(entry.message) && !keptImages.has(entry));
  // Calls whose result failed or is not in yet keep their arguments; so do recent calls, except successful file
  // changes, whose written text is on disk and readable (their result already reports the outcome).
  const settled = new Set<string>();
  results.forEach((entry, index) => {
    const message = entry.message as Record<string, unknown>;
    if (message['isError'] === true || typeof message['toolCallId'] !== 'string') return;
    if (index < results.length - kept || ARGS_ON_DISK_TOOLS.has(String(message['toolName']))) settled.add(message['toolCallId']);
  });
  const present = new Set<string>();
  const calls = entries.flatMap((entry) => {
    if (!isRecord(entry.message) || entry.message['role'] !== 'assistant') return [];
    const current = parts(entry.message);
    for (const part of current) if (isRecord(part) && part['type'] === 'toolCall' && typeof part['id'] === 'string') present.add(part['id']);
    const content = shrunkCalls(current, settled, memo);
    return content ? [{ entry, ...content }] : [];
  });
  for (const id of memo.keys()) if (!present.has(id)) memo.delete(id);
  const saved =
    candidates.reduce((sum, entry) => sum + resultChars(entry.message) - TRIM_KEEP_CHARS, 0) +
    oldImages.reduce((sum, entry) => sum + imageChars(entry.message, IMAGE_CHARS), 0) +
    calls.reduce((sum, call) => sum + call.saved, 0);
  const count = candidates.length + oldImages.length + calls.length;
  if (saved < TRIM_MIN_SAVED_CHARS && (count < TRIM_STEP || saved < TRIM_STEP_MIN_SAVED_CHARS)) return [];
  for (const call of calls) for (const id of call.ids) memo.set(id, false);
  return [
    ...calls.map(({ entry, content }) => ({ type: 'context_edit' as const, targetId: entry.id, replacement: { content } as never })),
    ...candidates.flatMap((entry) => {
      const content = trimmedContent(entry.message);
      return content ? [{ type: 'context_edit' as const, targetId: entry.id, replacement: { content } }] : [];
    }),
    ...oldImages.map((entry) => ({ type: 'context_edit' as const, targetId: entry.id, replacement: { content: withoutImages(entry.message) } })),
  ];
}

/** The assistant content with settled calls' long string arguments cut, or undefined when that saves too little. */
function shrunkCalls(content: unknown[], settled: Set<string>, memo: TrimMemo): { content: unknown[]; saved: number; ids: string[] } | undefined {
  let saved = 0;
  const ids: string[] = [];
  const next = content.map((part) => {
    if (!isRecord(part) || part['type'] !== 'toolCall' || typeof part['id'] !== 'string' || !settled.has(part['id']) || !isRecord(part['arguments'])) return part;
    if (KEEP_ARGS_VERBATIM_TOOLS.has(String(part['name']))) return part;
    let verdict = memo.get(part['id']);
    if (verdict === undefined) {
      verdict = shrinkVerdict(part['arguments']);
      memo.set(part['id'], verdict);
    }
    if (!verdict) return part;
    saved += verdict.saved;
    ids.push(part['id']);
    return { ...part, arguments: verdict.arguments };
  });
  return saved > 0 ? { content: next, saved, ids } : undefined;
}

function shrinkVerdict(args: Record<string, unknown>): false | { arguments: unknown; saved: number } {
  const before = JSON.stringify(args).length;
  if (before <= ARGS_TRIM_ABOVE_CHARS) return false;
  const shrunk = shrinkArgument(args);
  const gain = before - JSON.stringify(shrunk).length;
  return gain < ARGS_MIN_SAVED_CHARS ? false : { arguments: shrunk, saved: gain };
}

/** Cut long strings anywhere in a call's arguments; structure, keys and short values stay. */
export function shrinkArgument(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length <= ARG_KEEP_CHARS * 2) return value;
    const kept = cutText(value, ARG_KEEP_CHARS, { chars: true });
    return `${kept}… [${value.length - kept.length} more characters of this earlier, successful call omitted]`;
  }
  if (Array.isArray(value)) return value.map(shrinkArgument);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shrinkArgument(item)]));
  return value;
}

/** Every string anywhere in a call's arguments. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  return isRecord(value) ? Object.values(value).flatMap(stringsIn) : [];
}

/**
 * Refuses a call whose arguments carry a placeholder Octocode left where it shortened earlier text in the context: the
 * model copied the shortened form, so the call would act on a hole (a subagent gets half a task, a message loses its
 * body). `file` is exempt here: its own check also allows markers the file already contains or an edit replaces.
 */
export async function elisionGate(event: Pick<ToolCallEvent, 'toolName' | 'input'>): Promise<ToolCallEventResult | undefined> {
  if (event.toolName === 'file') return undefined;
  const copied = stringsIn(event.input).flatMap(elisionMarkers)[0];
  if (!copied) return undefined;
  return {
    block: true,
    reason: `Refused: the arguments contain "${copied}", a placeholder Octocode puts where it shortened an earlier call or result in your context, not text to send. Write the full text of every argument again.`,
  };
}

/** A result's size is all its text parts together (many medium parts are as large as one big one), plus its images. */
function resultChars(message: unknown): number {
  return texts(message).reduce((sum, text) => sum + text.length, 0) + imageChars(message, IMAGE_CHARS);
}

function needsTrim(message: unknown): boolean {
  return hasImage(message) || texts(message).reduce((sum, text) => sum + text.length, 0) > TRIM_ABOVE_CHARS;
}

/**
 * A trimmed result: its first `TRIM_HEAD_CHARS` and last `TRIM_TAIL_CHARS` characters, plus any line in between that
 * points at the full text on disk (spill notes sit at the end of a result, but a middle one must survive too), and a
 * note naming the file that holds the full text, so the model reads it instead of rerunning the call. A result that
 * names no saved copy is saved to the session output folder first; when that fails it is not trimmed (undefined), since
 * the model cannot reach session history and the evidence would be gone.
 */
function trimmedContent(message: unknown): Array<{ type: 'text'; text: string }> | undefined {
  const text = texts(message).join('\n');
  const note = hasImage(message) ? [{ type: 'text' as const, text: IMAGE_NOTE }] : [];
  if (text.length <= TRIM_ABOVE_CHARS) return [...(text ? [{ type: 'text' as const, text }] : []), ...note];
  const head = cutText(text, TRIM_HEAD_CHARS, { chars: true });
  const tail = cutText(text, TRIM_TAIL_CHARS, { chars: true, tail: true });
  const middle = text.slice(head.length, text.length - tail.length);
  const pointers = text
    .split('\n')
    .filter((line) => POINTER_LINE.test(line))
    .slice(-MAX_POINTERS)
    .map((line) => (line.length > POINTER_MAX_CHARS ? `${cutText(line, POINTER_MAX_CHARS, { chars: true })}…` : line));
  const inMiddle = pointers.filter((line) => !head.includes(line) && !tail.includes(line) && middle.includes(line.replace(/…$/, '')));
  const saved =
    pointers.map((line) => POINTER_PATH.exec(line)?.[1]).filter((found): found is string => Boolean(found)).at(-1) ??
    savedCopy(text, isRecord(message) ? String(message['toolName']) : 'tool');
  if (!saved) return undefined;
  const omitted = text.length - head.length - tail.length;
  const gap = `\n[… ${omitted} more characters from this earlier tool result were trimmed. The full text is saved at ${saved}; read that file rather than rerunning the call.]\n`;
  return [{ type: 'text' as const, text: `${head}${gap}${inMiddle.length > 0 ? `${inMiddle.join('\n')}\n…\n` : ''}${tail}` }, ...note];
}

/** `text` saved whole to the session output folder, as a short path; undefined when it could not be written. */
function savedCopy(text: string, toolName: string): string | undefined {
  const file = saveFullOutput(text, `trimmed-${toolName}`);
  return file && shortPath(file);
}

/**
 * Files whose latest successful read is among the `trimmed` results: their content leaves the model's view, so the
 * file guard must ask for a fresh read before they are changed. A later read of the same file keeps it in view.
 */
function trimmedReadPaths(entries: ContextEntry[], trimmed: ReadonlySet<string>, cwd: string): string[] {
  const calls = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!isRecord(entry.message) || entry.message['role'] !== 'assistant') continue;
    for (const part of parts(entry.message)) {
      if (isRecord(part) && part['type'] === 'toolCall' && typeof part['id'] === 'string' && isRecord(part['arguments'])) calls.set(part['id'], part['arguments']);
    }
  }
  const latest = new Map<string, string>();
  for (const entry of entries) {
    const message = entry.message;
    if (!isRecord(message) || message['role'] !== 'toolResult' || message['isError'] === true) continue;
    const tool = String(message['toolName']);
    const args = READ_TOOLS.has(tool) ? calls.get(String(message['toolCallId'])) : undefined;
    if (args) for (const file of readPaths(tool, args, cwd)) latest.set(file, entry.id);
  }
  return [...latest].filter(([, id]) => trimmed.has(id)).map(([file]) => file);
}

export function registerCompaction(pi: ExtensionAPI, guard: FileGuard): void {
  // Verdicts hold for one session's context: a switch, compaction or tree move starts over.
  const memo: TrimMemo = new Map();
  let memoSession: string | undefined;
  const forget = () => memo.clear();
  // When the cached prompt was last written: each request, and each refresh Pi sends to keep it warm (by default
  // while a run is active, at 90% of the lifetime).
  let refreshed: number | undefined;
  pi.on('cache_warming_decision', async (event) => {
    if (event.action === 'warm') refreshed = Date.now();
    return undefined;
  });
  const tooLarge = new TooLargeRecovery();
  pi.on('turn_end', async (event, ctx) => {
    const session = ctx.sessionManager.getSessionId();
    if (session !== memoSession) {
      forget();
      memoSession = session;
      tooLarge.reset();
    }
    const entries = event.context.contextEntries.flatMap((entry) =>
      entry.sourceEntry.type === 'message' && entry.messages.length === 1 ? [{ id: entry.sourceEntry.id, message: entry.messages[0] }] : [],
    );
    const recovery = tooLarge.onTurnEnd(event.message, event.messageEntryId, entries, ctx);
    if (recovery) {
      for (const file of trimmedReadPaths(entries, new Set(recovery.map((edit) => edit.targetId)), ctx.cwd)) guard.forget(file);
      return { entries: [...event.entries, ...recovery] };
    }
    if (isRequestTooLarge(event.message)) return undefined;
    const at = requestTime(event.message);
    // A refresh Pi sent during this turn's tool calls is newer than the request that started it.
    if (at !== undefined && (refreshed === undefined || at > refreshed)) refreshed = at;
    const due = trimsDue({ written: refreshed, ttlMs: promptCacheTtlMs(ctx.model, event.message) }, ctx.getContextUsage()?.percent, Date.now(), contextChars(entries));
    if (!due) return undefined;
    const trims = planContextTrims(entries, memo, new Set(event.toolResultEntryIds));
    if (trims.length === 0) return undefined;
    for (const file of trimmedReadPaths(entries, new Set(trims.map((trim) => trim.targetId)), ctx.cwd)) guard.forget(file);
    return { entries: [...event.entries, ...trims] };
  });
  pi.on('agent_before_settle', async (event) => (tooLarge.shouldRetry(event.outcome) ? { continue: true } : undefined));

  // Pi writes the summary (the user's model, prompt, auth and retry policy); Octocode only adds the paths its `file`
  // tool changed to the file lists Pi appends and carries forward, which know only Pi's read/write/edit.
  pi.on('session_before_compact', async (event) => {
    addFileToolOps(event.preparation);
    return undefined;
  });

  // File contents read before compaction, or on another branch, are no longer in context: require fresh reads.
  pi.on('session_start', async () => {
    forget();
    tooLarge.reset();
  });
  pi.on('session_compact', async () => {
    forget();
    guard.reset();
  });
  pi.on('session_tree', async () => {
    forget();
    tooLarge.reset();
    guard.reset();
  });
}

type Preparation = SessionBeforeCompactEvent['preparation'];

/** Adds every path the `file` tool changed in the summarized messages to Pi's modified-file list (in place). */
export function addFileToolOps(preparation: Pick<Preparation, 'fileOps' | 'messagesToSummarize' | 'turnPrefixMessages'>): void {
  for (const message of [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages]) {
    for (const part of parts(message)) {
      if (!isRecord(part) || part['type'] !== 'toolCall' || part['name'] !== 'file' || !isRecord(part['arguments'])) continue;
      const queries = part['arguments']['queries'];
      for (const query of Array.isArray(queries) ? queries : []) {
        if (isRecord(query) && typeof query['path'] === 'string') preparation.fileOps.edited.add(query['path']);
      }
    }
  }
}
