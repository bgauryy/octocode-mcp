import type { ContextEditEntryDraft, ExtensionAPI, SessionBeforeCompactEvent, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import type { FileGuard } from '../files/tool.js';
import { chooseSessionCacheRetention } from '../shared/env.js';
import { readPaths } from '../shared/home.js';
import { saveContentCopy } from '../shared/spill.js';
import { cutText, elisionMarkers, isRecord } from '../shared/util.js';
import { contextChars, contextTokenChars, hasImage, imageChars, imageNote, imageTokenChars, isRequestTooLarge, keptImageResults, parts, saveImages, texts, withoutImages, type ContextEntry } from './images.js';
import { PromptCacheLifetimes, promptCacheTtlMs, warmingDecision } from './cache.js';
import { CacheWarmObservation } from './cache-warm.js';
import { recentWindowChars, trimValue, trimsDue, type TrimBatch } from './policy.js';
import { TooLargeRecovery } from './recovery.js';

/** At most this many recent tool results stay verbatim... */
export const KEEP_RECENT_RESULTS = 12;
/** ...and at least this many, whatever their size. */
export const KEEP_RECENT_MIN = 4;
/**
 * Beyond the minimum, recent results stay verbatim only while their text fits the recent window: the tail Pi keeps
 * verbatim when it compacts (`recentWindowChars`). Older results are trimmed in batches, so the trimmed prefix changes
 * rarely; whether a batch runs is the policy's cost decision (`batchPays`), and below that a floor keeps edits from
 * being trivial: a batch of TRIM_STEP saving TRIM_STEP_MIN_SAVED_CHARS, or any batch saving TRIM_MIN_SAVED_CHARS.
 */
export const TRIM_STEP = 10;
const TRIM_STEP_MIN_SAVED_CHARS = 20_000;
const TRIM_MIN_SAVED_CHARS = 60_000;
const TRIM_ABOVE_CHARS = 3_000;
/** A trimmed result keeps its head and its tail (where spill pointers, exit codes and summaries usually are)... */
const TRIM_HEAD_CHARS = 800;
const TRIM_TAIL_CHARS = 300;
/** What a trimmed result still costs, for the savings estimate: its head, tail and the trim note. */
const TRIM_KEEP_CHARS = 1_200;
/** ...and every line pointing at the full text on disk (`Full output: <path>`, a report or log path), clipped to this. */
const POINTER_LINE = /(?:Full output|Full report|Log): /;
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

/** Successful reply's request time (Pi stamps it at request start); failed attempts do not prove a cache refresh. */
function requestTime(message: unknown): number | undefined {
  if (isRecord(message) && (message['stopReason'] === 'error' || message['stopReason'] === 'aborted')) return undefined;
  return isRecord(message) && message['role'] === 'assistant' && typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
}

/** User decisions cannot be regenerated; subagent reports already summarize their work. Pi owns their later compaction. */
const KEEP_VERBATIM_TOOLS = new Set(['agent', 'askUser']);

/**
 * Argument-shrink verdicts remembered across turns, by tool-call id: `false` when the call never needs shrinking
 * (its arguments are too small, or its edit was already proposed), else its shrunk arguments and the gain. A
 * call's arguments do not change, so each settled call is measured once per session.
 */
export type TrimMemo = Map<string, false | { saved: number }>;

/**
 * Append-only edits shrink old tool results and successful calls' large arguments; Pi retains the raw entries.
 * The recent window is bounded by count and size. Batches must clear the floor; with `net`, the highest-value batch
 * wins. An edit rewrites the cache from its position onward, so a newer suffix may pay where the whole batch cannot.
 * Failed calls keep their arguments so the model can see what it sent.
 */
export function planContextTrims(
  entries: ContextEntry[],
  memo: TrimMemo = new Map(),
  unseen: ReadonlySet<string> = new Set(),
  options: { keepRecentChars?: number; net?: (batch: TrimBatch) => number } = {},
): ContextEditEntryDraft[] {
  const keepRecentChars = options.keepRecentChars ?? recentWindowChars({});
  const results = entries.filter((entry) => isRecord(entry.message) && entry.message['role'] === 'toolResult');
  let kept = 0;
  let used = 0;
  for (let index = results.length - 1; index >= 0 && kept < KEEP_RECENT_RESULTS; index--) {
    const size = resultChars(results[index]!.message);
    if (kept >= KEEP_RECENT_MIN && used + size > keepRecentChars) break;
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
  const position = new Map(entries.map((entry, index) => [entry.id, index]));
  const items = [
    ...candidates.map((entry) => ({ entry, saved: resultChars(entry.message) - TRIM_KEEP_CHARS, tokenChars: contextTokenChars([entry]) - TRIM_KEEP_CHARS })),
    ...oldImages.map((entry) => ({ entry, saved: imageChars(entry.message, IMAGE_CHARS), tokenChars: imageTokenChars(entry.message) })),
    ...calls.map((call) => ({ entry: call.entry, saved: call.saved, tokenChars: call.saved })),
  ].sort((a, b) => position.get(b.entry.id)! - position.get(a.entry.id)!);
  const start = chooseBatchStart(entries, items, position, options.net);
  if (start === undefined) return [];
  const chosen = (entry: ContextEntry) => position.get(entry.id)! >= start;
  return [
    ...calls.filter((call) => chosen(call.entry)).flatMap(({ entry, content, ids }) => {
      const shrunk = savedAndShrunk(content, new Set(ids), memo);
      return shrunk ? [{ type: 'context_edit' as const, targetId: entry.id, replacement: { content: shrunk } as never }] : [];
    }),
    ...candidates.filter(chosen).flatMap((entry) => {
      const content = trimmedContent(entry.message);
      return content ? [{ type: 'context_edit' as const, targetId: entry.id, replacement: { content } }] : [];
    }),
    ...oldImages.filter(chosen).flatMap((entry) => {
      const content = withoutImages(entry.message);
      return content ? [{ type: 'context_edit' as const, targetId: entry.id, replacement: { content } }] : [];
    }),
  ];
}

/**
 * The entry position the batch starts at: every item at or after it is trimmed. Each start is a suffix of the items
 * (newest first in `items`); one clears the floor when it saves TRIM_MIN_SAVED_CHARS, or TRIM_STEP_MIN_SAVED_CHARS
 * over at least TRIM_STEP items. Without `net` the whole set is taken; with it, the start of greatest positive value.
 */
function chooseBatchStart(
  entries: ContextEntry[], items: Array<{ entry: ContextEntry; saved: number; tokenChars: number }>,
  position: Map<string, number>, net?: (batch: TrimBatch) => number,
): number | undefined {
  const tail: number[] = new Array<number>(entries.length + 1).fill(0);
  for (let index = entries.length - 1; index >= 0; index--) tail[index] = tail[index + 1]! + contextTokenChars([entries[index]!]);
  let best: { start: number; value: number } | undefined;
  let saved = 0;
  let tokenChars = 0;
  items.forEach((item, count) => {
    saved += item.saved;
    tokenChars += item.tokenChars;
    const start = position.get(item.entry.id)!;
    const next = items[count + 1];
    if (next && position.get(next.entry.id) === start) return;
    if (saved < TRIM_MIN_SAVED_CHARS && (count + 1 < TRIM_STEP || saved < TRIM_STEP_MIN_SAVED_CHARS)) return;
    const value = net ? net({ savedChars: tokenChars, rewriteChars: tail[start]! }) : saved;
    if (value > 0 && (!best || value >= best.value)) best = { start, value };
  });
  return best?.start;
}

/** The settled calls in an assistant message worth shrinking (by tool-call id) and what that saves; undefined when none is. */
function shrunkCalls(content: unknown[], settled: Set<string>, memo: TrimMemo): { content: unknown[]; saved: number; ids: string[] } | undefined {
  let saved = 0;
  const ids: string[] = [];
  for (const part of content) {
    if (!isRecord(part) || part['type'] !== 'toolCall' || typeof part['id'] !== 'string' || !settled.has(part['id']) || !isRecord(part['arguments'])) continue;
    if (KEEP_ARGS_VERBATIM_TOOLS.has(String(part['name']))) continue;
    let verdict = memo.get(part['id']);
    if (verdict === undefined) {
      verdict = shrinkVerdict(part['arguments']);
      memo.set(part['id'], verdict);
    }
    if (!verdict) continue;
    saved += verdict.saved;
    ids.push(part['id']);
  }
  return saved > 0 ? { content, saved, ids } : undefined;
}

/**
 * The assistant content with the given calls' arguments saved whole to the session output folder, then shrunk with notes
 * naming that file. A call whose arguments cannot be saved keeps them (and is planned again later); undefined when none
 * changed. A shrunk call is never proposed again.
 */
function savedAndShrunk(content: unknown[], ids: ReadonlySet<string>, memo: TrimMemo): unknown[] | undefined {
  let changed = false;
  const next = content.map((part) => {
    if (!isRecord(part) || typeof part['id'] !== 'string' || !ids.has(part['id'])) return part;
    const copy = saveContentCopy(JSON.stringify(part['arguments'], null, 2), `trimmed-args-${String(part['name'])}`, 'json');
    if (!copy) return part;
    memo.set(part['id'], false);
    changed = true;
    return { ...part, arguments: shrinkArgument(part['arguments'], copy) };
  });
  return changed ? next : undefined;
}

function shrinkVerdict(args: Record<string, unknown>): false | { saved: number } {
  const before = JSON.stringify(args).length;
  if (before <= ARGS_TRIM_ABOVE_CHARS) return false;
  const gain = before - JSON.stringify(shrinkArgument(args)).length;
  return gain < ARGS_MIN_SAVED_CHARS ? false : { saved: gain };
}

/**
 * Cut long strings anywhere in a call's arguments; structure, keys and short values stay. Each cut names `saved`, the
 * file that holds the call's full arguments (as JSON), when given.
 */
export function shrinkArgument(value: unknown, saved?: string): unknown {
  if (typeof value === 'string') {
    if (value.length <= ARG_KEEP_CHARS * 2) return value;
    const kept = cutText(value, ARG_KEEP_CHARS, { chars: true });
    const where = saved ? `; its full arguments are saved at ${saved}` : '';
    return `${kept}… [${value.length - kept.length} more characters of this earlier, successful call omitted${where}]`;
  }
  if (Array.isArray(value)) return value.map((item) => shrinkArgument(item, saved));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shrinkArgument(item, saved)]));
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
 * is saved to the session output folder first; output text is not proof of a saved copy. When saving fails it is not trimmed (undefined), since
 * the model cannot reach session history and the evidence would be gone.
 */
function trimmedContent(message: unknown): Array<{ type: 'text'; text: string }> | undefined {
  const text = texts(message).join('\n');
  const images = hasImage(message) ? saveImages(message) : [];
  if (!images) return undefined;
  const note = hasImage(message) ? [{ type: 'text' as const, text: imageNote(images) }] : [];
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
  const saved = saveContentCopy(text, `trimmed-${isRecord(message) ? String(message['toolName']) : 'tool'}`);
  if (!saved) return undefined;
  const omitted = text.length - head.length - tail.length;
  const gap = `\n[… ${omitted} more characters from this earlier tool result were trimmed. The full text is saved at ${saved}; read that file rather than rerunning the call.]\n`;
  return [{ type: 'text' as const, text: `${head}${gap}${inMiddle.length > 0 ? `${inMiddle.join('\n')}\n…\n` : ''}${tail}` }, ...note];
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
  const warms = new CacheWarmObservation();
  const tooLarge = new TooLargeRecovery();
  const lifetimes = new PromptCacheLifetimes();
  pi.on('cache_warming_decision', async (event, ctx) => {
    // A later extension may change this decision. Only Pi's successful usage entry confirms it ran.
    warms.begin(ctx);
    return warmingDecision(event, ctx, promptCacheTtlMs(lifetimes.of(ctx.model)));
  });
  pi.on('turn_end', async (event, ctx) => {
    lifetimes.observe(pi, ctx, event.message);
    const session = ctx.sessionManager.getSessionId();
    if (session !== memoSession) {
      forget();
      memoSession = session;
      tooLarge.reset();
    }
    warms.observe(ctx);
    const entries = event.context.contextEntries.flatMap((entry) =>
      entry.sourceEntry.type === 'message' && entry.messages.length === 1 ? [{ id: entry.sourceEntry.id, message: entry.messages[0] }] : [],
    );
    const recovery = tooLarge.onTurnEnd(event.message, event.messageEntryId, entries, ctx);
    if (recovery) {
      for (const file of trimmedReadPaths(entries, new Set(recovery.map((edit) => edit.targetId)), ctx.cwd)) guard.forget(file);
      return { entries: [...event.entries, ...recovery] };
    }
    if (isRequestTooLarge(event.message)) return undefined;
    warms.record(requestTime(event.message));
    const usage = ctx.getContextUsage();
    const due = trimsDue({ written: warms.written, ttlMs: promptCacheTtlMs(lifetimes.of(ctx.model)) }, usage?.percent, Date.now(), contextChars(entries));
    // A cold cache or real pressure makes any batch free; on a warm cache only a batch that pays for its rewrite runs.
    const settings = pi.getSettings();
    const net = trimValue({ due, model: ctx.model, entries, usage, settings });
    const trims = planContextTrims(entries, memo, new Set(event.toolResultEntryIds), { keepRecentChars: recentWindowChars(settings), net });
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
  // The retention is chosen before the session's first request, so pi-ai, Pi's warmer and the trims share one lifetime,
  // and again before every run, so a process that lost it (an earlier build, a reload mid-rebuild) heals at once.
  pi.on('session_start', async (_event, ctx) => {
    chooseSessionCacheRetention(ctx.hasUI);
    forget();
    tooLarge.reset();
    warms.reset();
  });
  pi.on('model_select', async () => warms.reset());
  pi.on('before_agent_start', async (_event, ctx) => void chooseSessionCacheRetention(ctx.hasUI));
  pi.on('session_compact', async () => {
    forget();
    warms.reset();
    guard.reset();
  });
  pi.on('session_tree', async () => {
    forget();
    tooLarge.reset();
    warms.reset();
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
