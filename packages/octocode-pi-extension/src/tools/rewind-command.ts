import { EXTENSION_COMMANDS } from '../commands.js';
/**
 * rewind-command — explicit, preview-first local file recovery through the
 * canonical Awareness history store. It never snapshots prompts, touches the
 * user's Git repository, rewinds conversation state, or applies automatically.
 */

import type { PiContext, PiInstance, NotifyFn } from '../types.js';
import type {
  CheckpointInfo,
  CheckpointEngine,
  DiffStatEntry,
} from './checkpoints.js';
import type { SelectOverlayItem } from './ui-overlays.js';

// ─── Deps ────────────────────────────────────────────────────────────────────

/** Lazy engine provider — index.ts memoizes initCheckpointStore behind this. */
export type EngineProvider = (
  ctx?: PiContext
) => CheckpointEngine | undefined | Promise<CheckpointEngine | undefined>;

export interface RewindCommandDeps {
  getEngine: EngineProvider;
  /** Notification sink (default ctx.ui.notify). Injectable for tests. */
  notify?: NotifyFn;
}

export function registerRewindCommand(
  pi: PiInstance,
  deps: RewindCommandDeps
): void {
  const notify: NotifyFn =
    deps.notify ?? ((ctx, message, level) => ctx?.ui?.notify?.(message, level));
  pi.registerCommand?.(EXTENSION_COMMANDS.rewind.name, {
    description: EXTENSION_COMMANDS.rewind.description,
    handler: async (_args, ctx) => {
      if (!ctx?.hasUI || !ctx.ui?.select || !ctx.ui?.confirm) {
        notify(
          ctx,
          'Use the octocode-awareness history timeline and restore-preview commands, then restore-apply with the returned preview id.',
          'info'
        );
        return;
      }
      const engine = await deps.getEngine(ctx);
      if (!engine) {
        notify(ctx, 'Local history is unavailable.', 'warning');
        return;
      }
      let page = await engine.listCheckpoints(30);
      let checkpoint: CheckpointInfo | undefined;
      while (!checkpoint) {
        if (!page.checkpoints.length && !page.nextCall) {
          notify(ctx, 'No checkpoints available in this history.', 'info');
          return;
        }
        const labels = buildCheckpointItems(page.checkpoints).map(
          item => `${item.label}  ${item.description ?? ''}`
        );
        if (page.nextCall) labels.push('Load more…');
        const selected = await ctx.ui.select('Restore local history', labels);
        if (selected === undefined) return;
        if (page.nextCall && selected === 'Load more…') {
          page = await engine.listCheckpoints(30, page.nextCall);
          continue;
        }
        const index = labels.indexOf(selected);
        if (index < 0) return;
        checkpoint = page.checkpoints[index];
      }
      const changes = await engine.diffStat(checkpoint.id);
      const summary = formatDiffStat(changes);
      if (!(await ctx.ui.confirm('Apply this restore?', summary))) return;
      const receipt = await engine.restoreFiles(checkpoint.id);
      notify(
        ctx,
        `Restored ${checkpoint.id.slice(0, 8)}. Verification pending: ${receipt.verificationRunId}.`,
        'info'
      );
    },
  });
}

export function buildCheckpointItems(
  checkpoints: CheckpointInfo[]
): SelectOverlayItem[] {
  return checkpoints.map(cp => ({
    value: cp.id,
    label: `${new Date(cp.ts).toLocaleString()} — ${cp.label || '(no label)'}`,
    description: `${cp.filesChanged} file${cp.filesChanged === 1 ? '' : 's'} · ${cp.id.slice(0, 8)}`,
  }));
}

export function formatDiffStat(entries: DiffStatEntry[]): string {
  if (entries.length === 0)
    return 'No differences between this checkpoint and the work tree.';
  return entries.map(e => `${e.status} ${e.path}`).join('\n');
}
