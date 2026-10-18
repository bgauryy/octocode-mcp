import { isRecord } from '../shared/util.js';
import { applyClearedResults } from './clearing.js';

/**
 * Thinking that a summary made stale (Anthropic's preserved thinking).
 *
 * Newer Claude models bind each thinking block to the exact prefix it was produced after: system prompt, tools and every
 * earlier message. A compaction Octocode or Pi writes on the client puts a summary in front of the turns it keeps, so the
 * thinking in those turns no longer matches its prefix. pi-ai asks the API to drop such a block instead of failing
 * (`prefix_mismatch_behavior: "drop_block"`), so every request until the next compaction carried the same dead blocks and
 * Pi showed "Anthropic dropped N thinking blocks". Anthropic's fix for keep-tail compaction with a summary written on
 * the client: strip the thinking from the kept turns. Removing thinking is valid (earlier thinking is not part of any
 * later block's prefix), and the model sees what it saw before, since the API dropped those blocks anyway.
 * https://platform.claude.com/docs/en/build-with-claude/preserved-thinking
 */

/** Messages Pi builds from a summary: every one sits before the turns it was written after. */
const SUMMARY_ROLES: ReadonlySet<string> = new Set(['compactionSummary', 'branchSummary']);

/** Whether `model` binds thinking to its prefix: the models pi-ai sends `drop_block` for (`compat.supportsMidConvoEffort`). */
export function bindsThinkingToPrefix(model: unknown): boolean {
  return isRecord(model) && isRecord(model['compat']) && model['compat']['supportsMidConvoEffort'] === true;
}

/**
 * `messages` without the thinking of each assistant turn older than a summary placed before it; the rest of each turn,
 * and every other message, unchanged. The same list when there is none. By timestamps only, so every request (and the
 * cache-shared summary replaying it) strips the same blocks, across resume, reload and fork.
 */
export function stripStaleThinking<T>(messages: T[]): T[] {
  let summaryAt = Number.NEGATIVE_INFINITY;
  let changed = false;
  const out = messages.map((message) => {
    if (!isRecord(message)) return message;
    const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
    if (SUMMARY_ROLES.has(String(message['role']))) {
      if (at !== undefined) summaryAt = Math.max(summaryAt, at);
      return message;
    }
    if (message['role'] !== 'assistant' || at === undefined || at >= summaryAt || !Array.isArray(message['content'])) return message;
    const content = message['content'].filter((part) => !(isRecord(part) && part['type'] === 'thinking'));
    if (content.length === message['content'].length) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? (out as T[]) : messages;
}

/**
 * What Octocode's `context` handler changes in every request to `model`: the results in `cleared` (the session branch's,
 * `sessionCleared`) as their placeholders, and no stale thinking. The cache-shared summary replays it, so its prefix is the one the cache holds.
 * The same list when nothing changes.
 */
export function requestMessages<T>(messages: T[], model: unknown, cleared: ReadonlyMap<string, string>): T[] {
  const replaced = applyClearedResults(messages, cleared);
  return bindsThinkingToPrefix(model) ? stripStaleThinking(replaced) : replaced;
}
