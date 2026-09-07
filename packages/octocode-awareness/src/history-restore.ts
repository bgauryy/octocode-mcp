import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { captureHistory } from './history-capture.js';
import { captureWorkspaceFiles, restoreWorkspaceFile, type WorkspaceFileSnapshot } from './history-files.js';
import { activeLockRecords, preFlightIntent } from './intents-preflight.js';
import { releaseFileLock } from './intents-release.js';
import { endWork, renewWorkLease } from './work.js';
import type { HistoryExpectedSnapshot, HistoryRestoreApplyInput, HistoryRestorePreviewInput, HistoryRestoreTarget } from './schema/definitions-history.js';
import { historyEntitySchemas, historyExpectedSnapshotsSchema, historyRequestSchemas, historyRestoreTargetsSchema } from './schema/definitions-history.js';
import { HistoryError, historyOperation, historyPaths, historyTransaction, historyVersions, type HistoryContext } from './history-store.js';

type ExpectedSnapshot = HistoryExpectedSnapshot;
type RestoreTarget = HistoryRestoreTarget;
const PREVIEW_TTL_MS = 5 * 60_000;

function recoverable(version: ReturnType<typeof historyVersions>[number], side: 'before' | 'after'): RestoreTarget {
  const status = version[`${side}_status`];
  if (status === 'missing') return { path: version.file_path, status };
  const oid = version[`${side}_oid`];
  const mode = version[`${side}_mode`];
  if (status !== 'captured' || !oid || !mode) {
    throw new HistoryError('HISTORY_VERSION_UNAVAILABLE', `${version.file_path} has no recoverable ${side} image.`);
  }
  return { path: version.file_path, status, oid, mode };
}

function expected(snapshot: WorkspaceFileSnapshot): ExpectedSnapshot {
  if (snapshot.status === 'missing') return snapshot;
  if (snapshot.status !== 'captured') throw new HistoryError('HISTORY_NOT_RECOVERABLE', `${snapshot.path} cannot be restored safely.`);
  return { path: snapshot.path, status: snapshot.status, digest: snapshot.digest, size: snapshot.size, mode: snapshot.mode as '100644' | '100755' };
}

export async function previewHistoryRestore(ctx: HistoryContext, raw: HistoryRestorePreviewInput) {
  const input = historyRequestSchemas.history_restore_preview.parse(raw);
  const operation = historyOperation(ctx, input.operation_id);
  if (operation.workspace_path !== ctx.workspace) throw new HistoryError('HISTORY_NOT_FOUND', 'History operation does not exist in this workspace.');
  const requested = input.file ? new Set(historyPaths(ctx, input.file)) : null;
  const versions = historyVersions(ctx, input.operation_id).filter(version => !requested || requested.has(version.file_path));
  if (requested && versions.length !== requested.size) throw new HistoryError('HISTORY_NOT_FOUND', 'One or more requested history files do not exist.');
  if (versions.length === 0) throw new HistoryError('HISTORY_NOT_FOUND', 'No history files were selected.');
  const targets = versions.map(version => recoverable(version, input.side));
  const store = await ctx.store();
  const targetDigests = new Map<string, string>();
  try {
    await Promise.all(targets.filter((target): target is Extract<RestoreTarget, { status: 'captured' }> => target.status === 'captured')
      .map(async target => targetDigests.set(target.path, createHash('sha256').update(await store.readBlob(target.oid)).digest('hex'))));
  } catch {
    throw new HistoryError('HISTORY_VERSION_UNAVAILABLE', 'One or more restore blobs are missing or corrupt.');
  }
  const batch = await captureWorkspaceFiles({ workspace: ctx.workspace, paths: targets.map(target => target.path) });
  const expectedSnapshots = batch.entries.map(expected);
  const changes = targets.map((target, index) => {
    const current = expectedSnapshots[index]!;
    let action: 'create' | 'update' | 'delete' | 'unchanged';
    if (target.status === 'missing') action = current.status === 'missing' ? 'unchanged' : 'delete';
    else if (current.status === 'missing') action = 'create';
    else action = targetDigests.get(target.path) === current.digest && target.mode === current.mode ? 'unchanged' : 'update';
    return { path: target.path, action };
  });
  const previewId = `restore_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  historyTransaction(ctx, () => ctx.db.prepare(`INSERT INTO local_history_restores
    (preview_id,workspace_path,agent_id,source_operation_id,side,files_json,expected_json,target_json,status,expires_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(previewId, ctx.workspace, input.agent_id, input.operation_id, input.side,
      JSON.stringify(targets.map(target => target.path)), JSON.stringify(expectedSnapshots), JSON.stringify(targets), 'ready', expiresAt, createdAt));
  return { ok: true as const, preview_id: previewId, status: 'ready' as const, expires_at: expiresAt,
    files: targets.map(target => target.path), changes, changed_files: changes.filter(change => change.action !== 'unchanged').length };
}

function sameExpected(actual: WorkspaceFileSnapshot, value: ExpectedSnapshot): boolean {
  if (actual.path !== value.path || actual.status !== value.status) return false;
  if (actual.status === 'missing') return true;
  return actual.status === 'captured' && value.status === 'captured'
    && actual.digest === value.digest && actual.size === value.size && actual.mode === value.mode;
}
function publicSnapshot(snapshot: WorkspaceFileSnapshot) {
  if (snapshot.status === 'captured') return { path: snapshot.path, status: snapshot.status, digest: snapshot.digest, size: snapshot.size, mode: snapshot.mode };
  return snapshot;
}
function appliedReceipt(preview: ReturnType<typeof historyEntitySchemas.local_history_restore.parse>) {
  const stored = preview.result_json ? JSON.parse(preview.result_json) as { results?: unknown[]; verification_run_id?: string } : {};
  return { ok: true as const, status: 'applied' as const, preview_id: preview.preview_id, undo_operation_id: preview.undo_operation_id,
    verification_run_id: stored.verification_run_id ?? preview.lease_run_id, results: stored.results ?? [] };
}

export async function applyHistoryRestore(ctx: HistoryContext, input: HistoryRestoreApplyInput) {
  input = historyRequestSchemas.history_restore_apply.parse(input);
  const raw = ctx.db.prepare('SELECT * FROM local_history_restores WHERE preview_id=?').get(input.preview_id);
  if (!raw) throw new HistoryError('HISTORY_NOT_FOUND', 'Restore preview does not exist.');
  const preview = historyEntitySchemas.local_history_restore.parse(raw);
  if (preview.workspace_path !== ctx.workspace || realpathSync(input.workspace) !== ctx.workspace || preview.agent_id !== input.agent_id) {
    throw new HistoryError('HISTORY_OPERATION_CONFLICT', 'Restore preview ownership or workspace differs.');
  }
  if (preview.status === 'applied') return appliedReceipt(preview);
  if (preview.status !== 'ready') throw new HistoryError('HISTORY_REPLAY', 'Restore preview is no longer ready to apply.');
  if (Date.parse(preview.expires_at) <= Date.now()) throw new HistoryError('HISTORY_PREVIEW_EXPIRED', 'Restore preview expired; create a new preview.');
  const files = JSON.parse(preview.files_json) as string[];
  let expectedSnapshots: ExpectedSnapshot[];
  let targets: RestoreTarget[];
  try {
    expectedSnapshots = historyExpectedSnapshotsSchema.parse(JSON.parse(preview.expected_json));
    targets = historyRestoreTargetsSchema.parse(JSON.parse(preview.target_json));
  } catch {
    throw new HistoryError('HISTORY_CORRUPT', 'Restore preview metadata is invalid.');
  }
  if (files.length !== expectedSnapshots.length || files.length !== targets.length) throw new HistoryError('HISTORY_CORRUPT', 'Restore preview payload is inconsistent.');
  const selected = new Set(files);
  const peerLocks = activeLockRecords(ctx.db, { workspacePath: ctx.workspace })
    .filter(lock => lock.agent_id !== input.agent_id && selected.has(historyPathSafe(ctx, lock.file_path)));
  if (peerLocks.length) throw new HistoryError('HISTORY_LOCK_CONFLICT', `Restore conflicts with active peer locks: ${peerLocks.map(lock => lock.file_path).join(', ')}`);

  const currentBatch = await captureWorkspaceFiles({ workspace: ctx.workspace, paths: files });
  const stale = currentBatch.entries.filter((snapshot, index) => !sameExpected(snapshot, expectedSnapshots[index]!));
  if (stale.length) {
    const result = { conflicts: stale.map(publicSnapshot) };
    ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=? AND status='ready'")
      .run(JSON.stringify(result), preview.preview_id);
    return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id, ...result };
  }

  const lease = preFlightIntent(ctx.db, {
    agentId: input.agent_id, workspacePath: ctx.workspace, targetFiles: files,
    rationale: `apply history restore ${preview.preview_id}`,
    testPlan: 'verify restored files and run applicable project checks', requireRunContract: true,
    ttlMs: 120_000,
  });
  if (!lease.ok) {
    const conflicts = lease.conflicts.map(conflict => conflict.path);
    ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=? AND status='ready'")
      .run(JSON.stringify({ conflicts }), preview.preview_id);
    return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id, conflicts };
  }
  const leaseRunId = lease.run.run_id;
  const releaseLease = (status: 'PENDING' | 'FAILED') => releaseFileLock(ctx.db, {
    agentId: input.agent_id, workspacePath: ctx.workspace, runId: leaseRunId, status,
  });

  // Claim while the dedicated exclusive run fences every target.
  const claimed = ctx.db.prepare(`UPDATE local_history_restores SET status='applying',lease_run_id=?
    WHERE preview_id=? AND status='ready' AND workspace_path=? AND agent_id=? AND expires_at>?`)
    .run(leaseRunId, preview.preview_id, ctx.workspace, input.agent_id, new Date().toISOString());
  if (!claimed.changes) {
    releaseLease('FAILED');
    throw new HistoryError('HISTORY_REPLAY', 'Restore preview was already claimed.');
  }
  let undo: Awaited<ReturnType<typeof captureHistory>> | undefined;
  const results: unknown[] = [];
  try {
  const fencedBatch = await captureWorkspaceFiles({ workspace: ctx.workspace, paths: files });
  const fencedStale = fencedBatch.entries.filter((snapshot, index) => !sameExpected(snapshot, expectedSnapshots[index]!));
  if (fencedStale.length) {
    const result = { conflicts: fencedStale.map(publicSnapshot) };
    ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=?")
      .run(JSON.stringify(result), preview.preview_id);
    releaseLease('FAILED');
    return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id, ...result };
  }
  undo = await captureHistory(ctx, { workspace: ctx.workspace, agent_id: input.agent_id, file: files, label: `undo ${preview.preview_id}` });
  ctx.db.prepare("UPDATE local_history_restores SET undo_operation_id=? WHERE preview_id=? AND status='applying'")
    .run(undo.operation.operation_id, preview.preview_id);
  const undoVersions = historyVersions(ctx, undo.operation.operation_id);
  const store = await ctx.store();
  for (let index = 0; index < undoVersions.length; index += 1) {
    const version = undoVersions[index]!;
    const expectedValue = expectedSnapshots[index]!;
    const expectedMode = expectedValue.status === 'captured' ? expectedValue.mode : undefined;
    if (version.after_status !== expectedValue.status || (version.after_mode ?? undefined) !== expectedMode) {
      ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=?")
        .run(JSON.stringify({ error: 'workspace changed while creating undo checkpoint' }), preview.preview_id);
      releaseLease('FAILED');
      return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id };
    }
    if (version.after_status === 'captured') {
      const bytes = await store.readBlob(version.after_oid!);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== expectedValue.digest || bytes.byteLength !== expectedValue.size) {
        ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=?")
          .run(JSON.stringify({ error: 'workspace changed while creating undo checkpoint' }), preview.preview_id);
        releaseLease('FAILED');
        return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id };
      }
    }
  }
  const locksAtClaim = activeLockRecords(ctx.db, { workspacePath: ctx.workspace })
    .filter(lock => lock.agent_id !== input.agent_id && selected.has(historyPathSafe(ctx, lock.file_path)));
  if (locksAtClaim.length) {
    ctx.db.prepare("UPDATE local_history_restores SET status='conflict',result_json=? WHERE preview_id=?")
      .run(JSON.stringify({ conflicts: locksAtClaim.map(lock => lock.file_path) }), preview.preview_id);
    releaseLease('FAILED');
    return { ok: false as const, status: 'conflict' as const, preview_id: preview.preview_id,
      verification_run_id: leaseRunId, conflicts: locksAtClaim.map(lock => lock.file_path) };
  }
    for (let index = 0; index < files.length; index += 1) {
      const target = targets[index]!;
      const expectedCurrent = expectedSnapshots[index]!;
      const restoreTarget = target.status === 'missing'
        ? { path: target.path, status: 'missing' as const }
        : { path: target.path, status: 'captured' as const, mode: target.mode!, bytes: await store.readBlob(target.oid!) };
      const activeLease = activeLockRecords(ctx.db, { workspacePath: ctx.workspace, runId: leaseRunId });
      if (activeLease.length !== files.length) throw new HistoryError('HISTORY_LEASE_EXPIRED', 'Restore lease expired before the next file write.');
      const renewed = renewWorkLease(ctx.db, { agentId: input.agent_id, runId: leaseRunId, ttlMs: 120_000 }, { exclusiveOnly: true });
      if (renewed.locksRenewed !== files.length) throw new HistoryError('HISTORY_LEASE_EXPIRED', 'Restore could not renew its complete lock fence.');
      const restored = await restoreWorkspaceFile({ workspace: ctx.workspace, path: files[index]!, expectedCurrent, target: restoreTarget });
      results.push({ path: restored.path, status: restored.status, previous: publicSnapshot(restored.previous), current: publicSnapshot(restored.current) });
      ctx.db.prepare("UPDATE local_history_restores SET result_json=? WHERE preview_id=? AND status='applying'")
        .run(JSON.stringify({ results }), preview.preview_id);
    }
    endWork(ctx.db, { agentId: input.agent_id, runId: leaseRunId });
    ctx.db.prepare("UPDATE local_history_restores SET status='applied',result_json=? WHERE preview_id=?")
      .run(JSON.stringify({ results, verification_run_id: leaseRunId }), preview.preview_id);
    return { ok: true as const, status: 'applied' as const, preview_id: preview.preview_id, undo_operation_id: undo.operation.operation_id,
      verification_run_id: leaseRunId, results };
  } catch (error) {
    const status = results.length > 0 ? 'partial' : error instanceof Error && /stale restore preview/i.test(error.message) ? 'conflict' : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    ctx.db.prepare("UPDATE local_history_restores SET status=?,result_json=? WHERE preview_id=?")
      .run(status, JSON.stringify({ results, error: message }), preview.preview_id);
    releaseLease('FAILED');
    return { ok: false as const, status, preview_id: preview.preview_id, undo_operation_id: undo?.operation.operation_id,
      verification_run_id: leaseRunId, results, error: message };
  }
}

function historyPathSafe(ctx: HistoryContext, value: string): string {
  try { return historyPaths(ctx, [value])[0] ?? value; } catch { return value; }
}
