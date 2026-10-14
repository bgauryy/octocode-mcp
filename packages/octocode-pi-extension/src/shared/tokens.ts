import { isRecord } from './util.js';

/**
 * Characters per token for every estimate that has no tokenizer: what compaction adds back, and the system prompt and
 * tool definitions a request carries. Prose runs near four, but code, paths and JSON (most of a restored file, a pasted
 * log or a tool schema) tokenize nearer three, so three keeps the add-ons inside their share of the window and the
 * estimate on the safe side.
 */
export const CHARS_PER_TOKEN = 3;

/** Pi's default room kept for a reply (`compaction.reserveTokens`). */
const DEFAULT_RESERVE_TOKENS = 16_384;

/** Pi's compaction reserve for `model`: its `compaction.modelOverrides["provider/id"]` entry, else the global one. */
export function reserveTokensFor(settings: unknown, model: { provider: string; id: string }): number {
  const compaction = isRecord(settings) && isRecord(settings['compaction']) ? settings['compaction'] : {};
  const overrides = isRecord(compaction['modelOverrides']) ? compaction['modelOverrides'] : {};
  const own = overrides[`${model.provider}/${model.id}`];
  const value = isRecord(own) && typeof own['reserveTokens'] === 'number' ? own['reserveTokens'] : compaction['reserveTokens'];
  return typeof value === 'number' && value >= 0 ? value : DEFAULT_RESERVE_TOKENS;
}

/**
 * Where Pi compacts automatically: the window less the model's reserve (a 1M window with an 800k reserve compacts at
 * 200k); the window when compaction is off or the reserve leaves no room.
 */
export function autoCompactAt(settings: unknown, model: { provider: string; id: string; contextWindow: number }): number {
  const compaction = isRecord(settings) && isRecord(settings['compaction']) ? settings['compaction'] : {};
  if (compaction['enabled'] === false) return model.contextWindow;
  const limit = model.contextWindow - reserveTokensFor(settings, model);
  return limit > 0 ? limit : model.contextWindow;
}
