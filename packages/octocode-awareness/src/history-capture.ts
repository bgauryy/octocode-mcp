import { randomUUID } from 'node:crypto';
import { captureWorkspaceFiles } from './history-files.js';
import type { HistoryTreeEntry } from './history-git.js';
import type { HistoryCaptureInput, HistoryCheckpointInput } from './schema/definitions-history.js';
import { assertHistoryStorageReady, HistoryError, historyHash, historyOperation, historyPaths, historyReceipt, historyTransaction, historyVersions, type HistoryContext, type HistoryOperation } from './history-store.js';

function assertRun(ctx: HistoryContext, input: HistoryCaptureInput | HistoryCheckpointInput): void {
  if (!input.run_id) return;
  const row = ctx.db.prepare('SELECT agent_id, workspace_path FROM task_runs WHERE run_id = ?').get(input.run_id);
  if (!row || row.agent_id !== input.agent_id || row.workspace_path !== ctx.workspace) {
    throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'run_id must belong to this agent and workspace.');
  }
}
function assertOwner(ctx: HistoryContext, row: HistoryOperation, input: HistoryCaptureInput): void {
  if (row.workspace_path !== ctx.workspace || row.agent_id !== input.agent_id
    || row.session_id !== (input.session_id ?? null)
    || row.run_id !== (input.run_id ?? null)
    || row.host !== (input.host ?? null)) {
    throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'History operation ownership or correlation differs.');
  }
}

/** Capture is a journaled asynchronous operation; no database transaction spans file or Git I/O. */
export async function captureHistory(ctx: HistoryContext, input: HistoryCaptureInput | HistoryCheckpointInput) {
  assertHistoryStorageReady(ctx);
  const checkpoint = !('phase' in input);
  const side = checkpoint ? 'after' : input.phase;
  const id = input.operation_id ?? `history_${randomUUID()}`;
  let files: string[];
  if (!checkpoint && input.phase === 'after') {
    const row = historyOperation(ctx, id);
    assertOwner(ctx, row, input);
    files = historyVersions(ctx, id).map(version => version.file_path);
    if (row.kind !== 'edit' || (input.file && JSON.stringify(historyPaths(ctx, input.file)) !== JSON.stringify(files))) {
      throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'After capture must use the original edit and exact file set.');
    }
    if (row.after_commit_oid) {
      if (row.outcome !== input.outcome) throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'A terminal outcome cannot be overwritten.');
      return historyReceipt(ctx, id);
    }
    if (row.status !== 'open' && row.status !== 'partial') {
      throw new HistoryError('HISTORY_CAPTURE_IN_PROGRESS', 'The before capture has not completed; inspect its operation before retrying.');
    }
    const changed = ctx.db.prepare("UPDATE local_history_operations SET status = 'capturing', updated_at = ? WHERE operation_id = ? AND status IN ('open','partial') AND after_commit_oid IS NULL")
      .run(new Date().toISOString(), id);
    if (!changed.changes) throw new HistoryError('HISTORY_CAPTURE_IN_PROGRESS', 'Another caller is capturing this operation.');
  } else {
    files = historyPaths(ctx, input.file!);
    const requestHash = historyHash(JSON.stringify([id, ctx.workspace, input.agent_id, input.session_id ?? null, input.run_id ?? null, input.host ?? null, input.label ?? null, checkpoint, files]));
    const existing = ctx.db.prepare('SELECT request_hash, status FROM local_history_operations WHERE operation_id = ?').get(id);
    if (existing) {
      if (existing.request_hash !== requestHash) throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'operation_id was already used for a different request.');
      if (existing.status === 'capturing' || existing.status === 'failed') throw new HistoryError('HISTORY_CAPTURE_IN_PROGRESS', 'Capture is incomplete; inspect history and create a new operation.');
      return historyReceipt(ctx, id);
    }
    assertRun(ctx, input);
    const now = new Date().toISOString();
    historyTransaction(ctx, () => {
      ctx.db.prepare(`INSERT INTO local_history_operations
        (operation_id,workspace_path,agent_id,session_id,run_id,host,kind,status,request_hash,label,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'capturing',?,?,?,?)`)
        .run(id, ctx.workspace, input.agent_id, input.session_id ?? null, input.run_id ?? null, input.host ?? null, checkpoint ? 'checkpoint' : 'edit', requestHash, input.label ?? null, now, now);
      const insert = ctx.db.prepare('INSERT INTO local_history_versions (operation_id,file_path,ordinal) VALUES (?,?,?)');
      files.forEach((file, ordinal) => insert.run(id, file, ordinal));
    });
  }
  try {
    const batch = await captureWorkspaceFiles({ workspace: ctx.workspace, paths: files });
    const store = await ctx.store();
    const treeEntries: HistoryTreeEntry[] = [];
    const versions = await Promise.all(batch.entries.map(async entry => {
      const oid = entry.status === 'captured' ? (await store.writeBlob(entry.bytes)).oid : null;
      const mode = entry.status === 'captured' ? entry.mode : null;
      if (oid && mode) treeEntries.push({ path: entry.path, oid, mode });
      return { path: entry.path, oid, mode, status: entry.status, reason: 'reason' in entry ? entry.reason : null };
    }));
    const tree = await store.writeTree(treeEntries);
    const row = historyOperation(ctx, id);
    const commit = await store.writeCommit({ tree, parents: side === 'after' && row.before_commit_oid ? [row.before_commit_oid] : [], message: `Awareness ${id} ${side}\n`, timestampMs: Date.parse(row.created_at) });
    await store.publishRef(`refs/octocode/${historyHash(id)}/${side}`, commit);
    const partial = versions.some(version => version.status !== 'captured' && version.status !== 'missing');
    historyTransaction(ctx, () => {
      const update = ctx.db.prepare(`UPDATE local_history_versions SET ${side}_oid=?,${side}_mode=?,${side}_status=?,${side}_reason=? WHERE operation_id=? AND file_path=?`);
      for (const version of versions) update.run(version.oid, version.mode, version.status, version.reason, id, version.path);
      const status = partial ? 'partial' : side === 'before' ? 'open' : 'complete';
      const outcome = checkpoint || side === 'before' ? 'unknown' : (input as Extract<HistoryCaptureInput, { phase: 'after' }>).outcome;
      ctx.db.prepare(`UPDATE local_history_operations SET ${side}_commit_oid=?,status=?,outcome=?,updated_at=? WHERE operation_id=?`)
        .run(commit, status, outcome, new Date().toISOString(), id);
    });
    return historyReceipt(ctx, id);
  } catch (error) {
    ctx.db.prepare("UPDATE local_history_operations SET status='failed',updated_at=? WHERE operation_id=?").run(new Date().toISOString(), id);
    throw error;
  }
}
