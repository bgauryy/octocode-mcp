import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { clearedResults, CLEARED_RESULTS_TYPE, contextMessages, plainText, toolCallArguments, type MessageRef } from '../files/reads.js';
import type { FileGuard } from '../files/tool.js';
import { readPaths } from '../shared/home.js';
import { isOctocodeTool } from '../shared/octocode-tools.js';
import { saveContentCopy } from '../shared/spill.js';
import { CHARS_PER_TOKEN } from '../shared/tokens.js';
import { isRecord } from '../shared/util.js';
import { lastCacheUseAt } from './cache.js';

/**
 * Clearing old tool results after the prompt cache went cold (the practice of Claude Code's time-based clearing).
 *
 * Clearing a result while the cache is warm makes the next request rewrite the whole cache entry. After an idle gap
 * longer than the entry's lifetime the next request rewrites it anyway, so clearing then costs nothing and shrinks every
 * later request. So at the start of a run, when the cache was last used (the last reply, or a refresh by Pi's warmer)
 * longer ago than its lifetime, the old results of tools whose output can be fetched again are replaced by a
 * placeholder, keeping the newest `KEEP_RECENT_RESULTS`, and only when that frees at least `CLEAR_AT_LEAST_TOKENS`. A repeated-read note (`files/dedupe`) that points at a cleared
 * result gets the same placeholder, so it never points "above" at text that is gone.
 *
 * Nothing is lost: each result's whole text is saved first and the placeholder names the file; a result that cannot
 * be saved stays. The decision is a session entry (`CLEARED_RESULTS_TYPE`) that every request applies the same way
 * (`applyClearedResults`), so the prompt stays byte-stable between requests and survives a resume, reload or fork.
 */

/** The newest clearable results always kept: the next step usually builds on the last few calls, and older ones come back by repeating the call or reading the saved file. */
export const KEEP_RECENT_RESULTS = 5;
/** The text the older results must total (in tokens, by `CHARS_PER_TOKEN`) for any clearing to happen: below it the saving is too small to be worth a changed prefix and the saved copies. */
export const CLEAR_AT_LEAST_TOKENS = 20_000;

/** Pi's read-only tools and `web` (and every Octocode MCP tool, `isOctocodeTool`): a result is fetched again by repeating the call. Never `bash`, `file` or `agent`. */
const CLEARABLE_TOOLS: ReadonlySet<string> = new Set(['read', 'grep', 'find', 'ls', 'web']);

const PLACEHOLDER_START = '[Old tool result cleared';

/** What stands for a cleared result; `saved` is where `saveContentCopy` put its whole text. */
function clearedPlaceholder(saved: string): string {
  return `${PLACEHOLDER_START} after the prompt cache expired. Full output: ${saved}. Read that file, or run the call again.]`;
}

interface Candidate {
  id: string;
  tool: string;
  text: string;
}

/** The repeated-read note behind a result (`details.unchangedOf`: the call it points at), if it is one. */
function noteOf(message: Record<string, unknown>): string | undefined {
  const unchangedOf = isRecord(message['details']) ? message['details']['unchangedOf'] : undefined;
  return typeof unchangedOf === 'string' ? unchangedOf : undefined;
}

/** Successful results of clearable tools that show only text and are not placeholders or repeated-read notes, oldest first. */
function clearableResults(messages: readonly MessageRef[]): Candidate[] {
  return messages.flatMap(({ message }) => {
    if (!isRecord(message) || message['role'] !== 'toolResult' || message['isError'] === true || typeof message['toolCallId'] !== 'string' || noteOf(message) !== undefined) return [];
    const tool = String(message['toolName']);
    const text = CLEARABLE_TOOLS.has(tool) || isOctocodeTool(tool) ? plainText(message['content']) : undefined;
    return text !== undefined && !text.startsWith(PLACEHOLDER_START) ? [{ id: message['toolCallId'], tool, text }] : [];
  });
}

/** The results to clear: all but the newest `KEEP_RECENT_RESULTS` not yet cleared, if they total `CLEAR_AT_LEAST_TOKENS`. */
function olderResults(candidates: readonly Candidate[], cleared: ReadonlyMap<string, string>): Candidate[] {
  const open = candidates.filter((candidate) => !cleared.has(candidate.id));
  const older = open.slice(0, Math.max(open.length - KEEP_RECENT_RESULTS, 0));
  return older.reduce((chars, candidate) => chars + candidate.text.length, 0) / CHARS_PER_TOKEN >= CLEAR_AT_LEAST_TOKENS ? older : [];
}

/**
 * Clears the old results when the cache lifetime `ttlMs` has passed since the cache was last used (`now`): saves each,
 * records the decision with `pi.appendEntry`, and makes the file guard forget the files whose read was cleared. Does
 * nothing when the lifetime is unknown, the session has no reply yet, or less than `CLEAR_AT_LEAST_TOKENS` would be freed.
 */
export function clearColdResults(pi: Pick<ExtensionAPI, 'appendEntry'>, ctx: ExtensionContext, guard: Pick<FileGuard, 'forget'>, ttlMs: number | undefined, now = Date.now()): void {
  if (ttlMs === undefined) return;
  const branch = ctx.sessionManager.getBranch();
  const lastUse = lastCacheUseAt(branch);
  if (lastUse === undefined || now - lastUse <= ttlMs) return;
  const messages = contextMessages(ctx);
  const older = olderResults(clearableResults(messages), clearedResults(branch));
  if (older.length === 0) return;
  const saved = older.flatMap((candidate) => {
    const file = saveContentCopy(candidate.text, `cleared-${candidate.tool}`);
    return file ? [{ candidate, file }] : [];
  });
  // Results that could not be saved stay; too few left to matter leaves the saved copies unused.
  if (saved.reduce((chars, { candidate }) => chars + candidate.text.length, 0) / CHARS_PER_TOKEN < CLEAR_AT_LEAST_TOKENS) return;
  const results = saved.map(({ candidate, file }) => ({ id: candidate.id, saved: file }));
  // Notes pointing at a result cleared now or earlier take that result's placeholder.
  const savedOf = new Map([...clearedResults(branch), ...results.map(({ id, saved: file }) => [id, file] as const)]);
  for (const { message } of messages) {
    if (!isRecord(message) || message['role'] !== 'toolResult') continue;
    const target = noteOf(message);
    const file = target === undefined ? undefined : savedOf.get(target);
    const id = String(message['toolCallId']);
    if (file !== undefined && !savedOf.has(id)) results.push({ id, saved: file });
  }
  pi.appendEntry(CLEARED_RESULTS_TYPE, { results });
  const calls = toolCallArguments(messages);
  for (const { candidate } of saved) {
    const args = calls.get(candidate.id);
    for (const file of args ? readPaths(candidate.tool, args, ctx.cwd) : []) guard.forget(file);
  }
}

/** `messages` with every result in `cleared` replaced by its placeholder; the same list when none is. */
export function applyClearedResults<T>(messages: T[], cleared: ReadonlyMap<string, string>): T[] {
  if (cleared.size === 0) return messages;
  return messages.map((message) => {
    if (!isRecord(message) || message['role'] !== 'toolResult') return message;
    const saved = cleared.get(String(message['toolCallId']));
    return saved === undefined ? message : { ...message, content: [{ type: 'text', text: clearedPlaceholder(saved) }] };
  }) as T[];
}
