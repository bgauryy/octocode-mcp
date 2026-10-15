import type { Api, Model } from '@earendil-works/pi-ai';
import { estimateTokens, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { CHARS_PER_TOKEN } from '../shared/tokens.js';

/**
 * When compaction runs, beyond Pi's threshold: a breaker for compactions that keep refilling the context, and a
 * compaction before a switch to a model whose window the context does not fit.
 */

/** A compaction this few turns after the previous one counts as a refill (a summary that freed room lasts longer than this)... */
export const THRASH_TURNS = 3;
/** ...and this many refills in a row stop automatic compaction (Claude Code's thrash breaker): a single refill can be one big read, a streak is a loop. */
export const THRASH_STREAK = 3;

/** Counts compactions that came right after the previous one. */
export class ThrashBreaker {
  #turnsSince: number | undefined;
  #streak = 0;

  reset(): void {
    this.#turnsSince = undefined;
    this.#streak = 0;
  }

  turnEnded(): void {
    if (this.#turnsSince !== undefined) this.#turnsSince += 1;
  }

  /** Records a finished compaction; a manual one starts the count over. */
  compacted(manual: boolean): void {
    this.#streak = !manual && this.#turnsSince !== undefined && this.#turnsSince <= THRASH_TURNS ? this.#streak + 1 : 0;
    this.#turnsSince = 0;
  }

  /** Whether an automatic compaction now should be refused: the context refilled right away too many times. */
  tripped(): boolean {
    return this.#streak >= THRASH_STREAK && this.#turnsSince !== undefined && this.#turnsSince <= THRASH_TURNS;
  }
}

export const THRASH_MESSAGE =
  `Automatic compaction stopped: the context refilled to the limit within ${THRASH_TURNS} turns of the previous compaction, ` +
  `${THRASH_STREAK} times in a row, so another summary would not make room. Something keeps adding more than the summary ` +
  'frees (a large file read, tool output or attachment). Start a new session, or run /compact with a focus that drops it.';

/**
 * Whether switching from `previous` to `next` needs a compaction first: the context (`tokens`) does not fit the new
 * window less the room Pi keeps for a reply (`reserveTokens`), and the previous model could still read all of it.
 */
export function needsDownshiftCompaction(previous: Pick<Model<Api>, 'contextWindow'> | undefined, next: Pick<Model<Api>, 'contextWindow'>, tokens: number | null | undefined, reserveTokens: number): boolean {
  if (!previous || tokens === null || tokens === undefined || next.contextWindow <= 0) return false;
  return next.contextWindow < previous.contextWindow && tokens > next.contextWindow - reserveTokens;
}

/** The characters of the tool definitions declared to the model (name, description, parameters, guidelines of the active tools). */
export function toolDefinitionChars(pi: Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>): number {
  try {
    const active = new Set(pi.getActiveTools());
    return pi.getAllTools().reduce((sum, tool) => {
      if (!active.has(tool.name)) return sum;
      const { name, description, parameters, promptGuidelines } = tool;
      return sum + JSON.stringify({ name, description, parameters, promptGuidelines }).length;
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * The context's size in tokens: Pi's count, else (Pi has none after a compaction until the next reply) an estimate of
 * what the next request carries: the system prompt, the active tool definitions (`toolChars`) and every message in the
 * context, by Pi's own per-message estimate.
 */
export function contextTokens(ctx: Pick<ExtensionContext, 'getContextUsage' | 'getSystemPrompt' | 'sessionManager'>, toolChars = 0): number | undefined {
  const tokens = ctx.getContextUsage()?.tokens;
  if (typeof tokens === 'number') return tokens;
  try {
    const messages = ctx.sessionManager.buildSessionProjection().entries.flatMap((entry) => entry.messages);
    const fixed = Math.ceil((ctx.getSystemPrompt().length + toolChars) / CHARS_PER_TOKEN);
    return fixed + messages.reduce((sum, message) => sum + estimateTokens(message), 0);
  } catch {
    return undefined;
  }
}
