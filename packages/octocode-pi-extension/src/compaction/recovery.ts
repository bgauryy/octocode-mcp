import { isContextOverflow, type AssistantMessage } from '@earendil-works/pi-ai';
import type { AgentActivityOutcome, ContextEditEntryDraft, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { contextChars, isRequestTooLarge, planTooLargeRecovery, type ContextEntry } from './images.js';
import { notify } from '../shared/commands.js';

/**
 * Recovery from a request rejected as too large (HTTP 413). A bodiless gateway 413 is a plain error to Pi (no
 * compaction), and every later request would resend the same bytes, so the session is stuck: strip images and retry.
 * The first retry keeps the newest image, a later one keeps none; each strips at least one image, so this ends. Pi
 * ignores a `turn_end` continuation after an error, so the retry is asked for at `agent_before_settle`. When Pi
 * recognises the overflow it compacts and retries itself; stripping images still helps that retry fit.
 */
export class TooLargeRecovery {
  /** Consecutive turns rejected as too large. */
  private streak = 0;
  private retryPending = false;

  reset(): void {
    this.streak = 0;
    this.retryPending = false;
  }

  /** At `turn_end`: the context edits to apply, or undefined when the turn was not rejected for size or nothing is left to strip. */
  onTurnEnd(message: unknown, messageEntryId: string, entries: ContextEntry[], ctx: Pick<ExtensionContext, 'hasUI' | 'ui' | 'model'>): ContextEditEntryDraft[] | undefined {
    if (!isRequestTooLarge(message)) {
      this.streak = 0;
      return undefined;
    }
    this.streak++;
    const piRecovers = isContextOverflow(message as AssistantMessage, ctx.model?.contextWindow ?? 0);
    const failed = piRecovers ? undefined : messageEntryId;
    const edits = (this.streak === 1 ? planTooLargeRecovery(entries, failed, 1) : undefined) ?? planTooLargeRecovery(entries, failed, 0);
    if (!edits) {
      this.reset();
      if (ctx.hasUI && !piRecovers) {
        const kb = Math.round(contextChars(entries) / 1024);
        notify(ctx.ui, `The provider rejected the request as too large (about ${kb} KB of context; no images left to remove). Run /compact, or /tree back to before the large output.`, 'warning');
      }
      return undefined;
    }
    this.retryPending = !piRecovers;
    return edits;
  }

  /** At `agent_before_settle`: whether to send the stripped request once more (only after the failed run). */
  shouldRetry(outcome: AgentActivityOutcome): boolean {
    const retry = this.retryPending && outcome === 'error';
    this.retryPending = false;
    return retry;
  }
}
