/**
 * rewind-command — explicit, preview-first local file recovery through the
 * canonical Awareness history store. It never snapshots prompts, touches the
 * user's Git repository, rewinds conversation state, or applies automatically.
 */

import type { PiContext, PiInstance, NotifyFn } from '../types.js';
import type { CheckpointInfo, DiffStatEntry, RestoreResult } from './checkpoints.js';
import { type SelectOverlayItem, type SelectOverlayOptions } from './ui-overlays.js';

// ─── Deps ────────────────────────────────────────────────────────────────────

/** Minimal engine surface the command needs — satisfied by CheckpointEngine. */
export interface RewindEngine {
  listCheckpoints(limit?: number, nextArgs?: string[]): Promise<import('./checkpoints.js').CheckpointPage>;
  restoreFiles(id: string, paths?: string[]): Promise<RestoreResult>;
  diffStat(id: string): Promise<DiffStatEntry[]>;
}

/** Lazy engine provider — index.ts memoizes initCheckpointStore behind this. */
export type EngineProvider = (
  ctx?: PiContext,
) => RewindEngine | undefined | Promise<RewindEngine | undefined>;

export type OverlayRunner = (
  ctx: PiContext | undefined,
  opts: SelectOverlayOptions,
) => Promise<string | null | undefined>;

export interface RewindCommandDeps {
  getEngine: EngineProvider;
  /** Notification sink (default ctx.ui.notify). Injectable for tests. */
  notify?: NotifyFn;
  /** Overlay runner (default runSelectOverlay). Injectable for tests. */
  runOverlay?: OverlayRunner;
}

export function registerRewindCommand(pi: PiInstance, deps: RewindCommandDeps): void {
  pi.registerCommand?.('octocode-rewind', {
    description: 'Preview and explicitly apply a local Awareness history restore.',
    handler: async (_args, ctx) => {
      if (!ctx?.hasUI || !ctx.ui?.select || !ctx.ui?.confirm) {
        deps.notify?.(ctx, 'Use the octocode-awareness history timeline and restore-preview commands, then restore-apply with the returned preview id.', 'info');
        return;
      }
      const engine = await deps.getEngine(ctx);
      if (!engine) { ctx.ui.notify?.('Local history is unavailable.', 'warning'); return; }
      let page = await engine.listCheckpoints(30);
      if (!page.checkpoints.length) { ctx.ui.notify?.(formatCheckpointList([]), 'info'); return; }
      let checkpoint: CheckpointInfo | undefined;
      while (!checkpoint) {
        const labels = buildCheckpointItems(page.checkpoints).map(item => `${item.label}  ${item.description ?? ''}`);
        if (page.nextArgs) labels.push('Load more…');
        const selected = await ctx.ui.select('Restore local history', labels);
        if (selected === undefined) return;
        if (page.nextArgs && selected === 'Load more…') { page = await engine.listCheckpoints(30, page.nextArgs); continue; }
        const index = labels.indexOf(selected); if (index < 0) return;
        checkpoint = page.checkpoints[index];
      }
      const changes = await engine.diffStat(checkpoint.id);
      const summary = formatDiffStat(changes);
      if (!await ctx.ui.confirm('Apply this restore?', summary)) return;
      const receipt = await engine.restoreFiles(checkpoint.id);
      ctx.ui.notify?.(`Restored ${checkpoint.id.slice(0, 8)}. Verification pending: ${receipt.verificationRunId}.`, 'info');
    },
  });
}

export function buildCheckpointItems(checkpoints: CheckpointInfo[]): SelectOverlayItem[] {
  return checkpoints.map((cp) => ({
    value: cp.id,
    label: `${new Date(cp.ts).toLocaleString()} — ${cp.label || '(no label)'}`,
    description: `${cp.filesChanged} file${cp.filesChanged === 1 ? '' : 's'} · ${cp.id.slice(0, 8)}`,
  }));
}

export function formatCheckpointList(checkpoints: CheckpointInfo[]): string {
  if (checkpoints.length === 0) {
    return 'No checkpoints yet — local history is captured around successful file mutations.';
  }
  const lines = checkpoints.map(
    (cp) =>
      `${cp.id.slice(0, 8)}  ${new Date(cp.ts).toLocaleString()}  ${cp.label || '(no label)'}` +
      ` (${cp.filesChanged} file${cp.filesChanged === 1 ? '' : 's'})`,
  );
  return ['Checkpoints (newest first):', ...lines, 'Restore with /octocode-rewind restore <id>.'].join('\n');
}

export function formatDiffStat(entries: DiffStatEntry[]): string {
  if (entries.length === 0) return 'No differences between this checkpoint and the work tree.';
  return entries.map((e) => `${e.status} ${e.path}`).join('\n');
}
