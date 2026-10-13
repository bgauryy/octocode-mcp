import type { ExtensionAPI, SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import { contextReads, seenFiles } from '../files/reads.js';
import type { FileGuard } from '../files/tool.js';
import { chooseSessionCacheRetention } from '../shared/env.js';
import { isRecord } from '../shared/util.js';
import { parts, type ContextEntry } from './images.js';
import { PromptCacheLifetimes, promptCacheTtlMs, warmingDecision } from './cache.js';
import { TooLargeRecovery } from './recovery.js';
import { RESTORE_SHARE, RESTORE_TOTAL_CHARS, deliverRestoredFiles, recentFiles, settleRestoredFiles, type PendingRestore } from './restore.js';
import { THRASH_MESSAGE, ThrashBreaker, needsDownshiftCompaction } from './pacing.js';
import type { Api, Model } from '@earendil-works/pi-ai';
import { carryFileLists, windowBudget, writeSummary } from './summary.js';

/**
 * Octocode never trims the model's context: tool results and call arguments stay verbatim until Pi compacts. It
 * supplies prompt-cache lifetimes and warming decisions, strips images from a request rejected as too large (HTTP 413,
 * else the session is stuck), and writes the compaction summary (`summary.ts`).
 */

/**
 * Files whose latest result in the context is among the `edited` entries (413 recovery replaced their images): their
 * content left the model's view, so the file guard asks for a fresh read before they are changed.
 */
function editedReadPaths(entries: ContextEntry[], edited: ReadonlySet<string>, cwd: string): string[] {
  return [...seenFiles(entries, cwd).values()].filter((seen) => edited.has(seen.id)).map((seen) => seen.file);
}

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

export function registerCompaction(pi: ExtensionAPI, guard: FileGuard): void {
  const tooLarge = new TooLargeRecovery();
  const lifetimes = new PromptCacheLifetimes();
  const thrash = new ThrashBreaker();
  /** The model a pending downshift compaction summarizes on (the one the context still fits). */
  let downshiftFrom: Model<Api> | undefined;
  let session: string | undefined;
  pi.on('cache_warming_decision', async (event, ctx) => warmingDecision(event, ctx, promptCacheTtlMs(lifetimes.of(ctx.model))));
  pi.on('turn_end', async (event, ctx) => {
    lifetimes.observe(pi, ctx, event.message);
    thrash.turnEnded();
    const current = ctx.sessionManager.getSessionId();
    if (current !== session) {
      session = current;
      tooLarge.reset();
    }
    const entries = event.context.contextEntries.flatMap((entry) =>
      entry.sourceEntry.type === 'message' && entry.messages.length === 1 ? [{ id: entry.sourceEntry.id, message: entry.messages[0] }] : [],
    );
    const recovery = tooLarge.onTurnEnd(event.message, event.messageEntryId, entries, ctx);
    if (!recovery) return undefined;
    for (const file of editedReadPaths(entries, new Set(recovery.map((edit) => edit.targetId)), ctx.cwd)) guard.forget(file);
    return { entries: [...event.entries, ...recovery] };
  });
  pi.on('agent_before_settle', async (event) => (tooLarge.shouldRetry(event.outcome) ? { continue: true } : undefined));
  // The file lists know only Pi's read/write/edit and drop a hook summary's lists: both are added first, so Pi's
  // default summary (when Octocode's fails) has them too.
  // The files worked on in the summarized part, most recent first, come back after the compaction.
  let restoreCandidates: string[] = [];
  let restoreBudget = RESTORE_TOTAL_CHARS;
  let pendingRestore: PendingRestore | undefined;
  pi.on('session_before_compact', async (event, ctx) => {
    if (event.reason !== 'manual' && thrash.tripped()) {
      if (ctx.hasUI) ctx.ui.notify(THRASH_MESSAGE, 'error');
      ctx.abort();
      return { cancel: true };
    }
    restoreCandidates = recentFiles(event.preparation, ctx.cwd);
    // Sized for the window the context lands in (after a downshift, the smaller model's), with Pi's reserve for it.
    restoreBudget = windowBudget(ctx.model?.contextWindow, event.preparation.settings.reserveTokens, RESTORE_SHARE, RESTORE_TOTAL_CHARS);
    addFileToolOps(event.preparation);
    carryFileLists(event.preparation, event.branchEntries);
    const from = downshiftFrom;
    downshiftFrom = undefined;
    return writeSummary(pi, event, ctx, from);
  });

  // The retention is chosen before the session's first request, so pi-ai and Pi's warmer share one lifetime, and again
  // before every run, so a process that lost it (an earlier build, a reload mid-rebuild) heals at once.
  pi.on('session_start', async (_event, ctx) => {
    chooseSessionCacheRetention(ctx.hasUI);
    tooLarge.reset();
    thrash.reset();
    downshiftFrom = undefined;
    restoreCandidates = [];
    pendingRestore = undefined;
  });
  pi.on('before_agent_start', async (_event, ctx) => void chooseSessionCacheRetention(ctx.hasUI));
  // File contents summarized away by compaction, or on another branch, are no longer in context: the guard keeps only
  // the reads the context still shows, then the files worked on most recently are read back (and count as read).
  // Switching to a model whose window the context does not fit compacts first, on the previous model: the next
  // request on the new one would fail, and only the previous model can still read the whole history.
  pi.on('model_select', async (event, ctx) => {
    const reserve = reserveTokensFor(pi.getSettings(), event.model);
    if (!needsDownshiftCompaction(event.previousModel, event.model, ctx.getContextUsage()?.tokens, reserve)) return;
    downshiftFrom = event.previousModel;
    if (ctx.hasUI) ctx.ui.notify(`The context does not fit ${event.model.id}'s window; compacting first on ${event.previousModel!.id}.`, 'info');
    ctx.compact({ onError: () => (downshiftFrom = undefined) });
  });
  pi.on('session_compact', async (event, ctx) => {
    thrash.compacted(event.reason === 'manual');
    guard.restore(contextReads(ctx));
    const pending = restoreCandidates;
    restoreCandidates = [];
    pendingRestore = deliverRestoredFiles(pi, pending, ctx, restoreBudget);
  });
  // The restored files count as read from the first model call that carries them (Pi may hold the message until the
  // running turn ends).
  pi.on('context', async (event) => {
    if (pendingRestore && settleRestoredFiles(event.messages, pendingRestore, guard)) pendingRestore = undefined;
  });
  pi.on('session_tree', async (_event, ctx) => {
    tooLarge.reset();
    pendingRestore = undefined;
    guard.restore(contextReads(ctx));
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
