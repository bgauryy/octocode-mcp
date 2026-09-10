import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as native from '@octocodeai/octocode-extension-rust';
import { connectDb } from '../src/db-runtime.js';
import { createHistoryContext } from '../src/history-store.js';
import { applyHistoryRestore, previewHistoryRestore } from '../src/history-restore.js';
import { preFlightIntent } from '../src/intents-preflight.js';

const roots: string[] = [];
vi.mock('@octocodeai/octocode-extension-rust', async importOriginal => {
  const actual = await importOriginal<typeof import('@octocodeai/octocode-extension-rust')>();
  return { ...actual, snapshotFile: vi.fn(actual.snapshotFile), deleteFile: vi.fn(actual.deleteFile) };
});
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function fixture(capturedTarget = false, currentFile = false) {
  const workspace = mkdtempSync(join(tmpdir(), 'awareness-history-restore-'));
  roots.push(workspace);
  const db = connectDb(join(workspace, 'awareness.sqlite3'));
  const ctx = createHistoryContext(db, workspace);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO local_history_operations
    (operation_id,workspace_path,agent_id,kind,status,outcome,request_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('source', ctx.workspace, 'owner', 'checkpoint', 'complete', 'unknown', 'source-hash', now, now);
  db.prepare(`INSERT INTO local_history_versions
    (operation_id,file_path,ordinal,before_oid,before_mode,before_status,after_status) VALUES (?,?,?,?,?,?,?)`)
    .run('source', 'src/a.ts', 0, capturedTarget ? '0123456789abcdef0123456789abcdef01234567' : null,
      capturedTarget ? '100644' : null, capturedTarget ? 'captured' : 'missing', 'missing');
  if (currentFile) {
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'src/a.ts'), 'current');
  }
  const result = await previewHistoryRestore(ctx, { workspace: ctx.workspace, agent_id: 'owner', operation_id: 'source', side: 'before' });
  return { workspace: ctx.workspace, db, ctx, previewId: result.preview_id, preview: result, now };
}

describe('history restore safety', () => {
  it('leaves a failed undo capture journal when archive publication cannot be flushed', async () => {
    const value = await fixture(false, true);
    const baseStore = await value.ctx.store();
    const wrapped = { ...baseStore, async flush(): Promise<Awaited<ReturnType<typeof baseStore.flush>>> { throw new Error('archive publication fsync failed'); } };
    try {
      const result = await applyHistoryRestore({ ...value.ctx, store: async () => wrapped },
        { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId });
      expect(result).toMatchObject({ ok: false, status: 'failed', error: 'archive publication fsync failed', results: [] });
      expect(value.db.prepare("SELECT status,after_commit_oid FROM local_history_operations WHERE operation_id!='source'").get())
        .toEqual({ status: 'failed', after_commit_oid: null });
      expect(readFileSync(join(value.workspace, 'src/a.ts'), 'utf8')).toBe('current');
    } finally { value.db.close(); }
  });

  it('flushes undo evidence before completing its journal and before mutating the workspace', async () => {
    const value = await fixture(false, true);
    const baseStore = await value.ctx.store();
    let flushes = 0;
    const wrapped = { ...baseStore, async flush() {
      flushes += 1;
      expect(readFileSync(join(value.workspace, 'src/a.ts'), 'utf8')).toBe('current');
      if (flushes === 1) {
        expect(value.db.prepare("SELECT status FROM local_history_operations WHERE operation_id!='source'").get()).toEqual({ status: 'capturing' });
        return baseStore.flush();
      }
      throw new Error('archive fsync failed');
    } };
    try {
      const result = await applyHistoryRestore({ ...value.ctx, store: async () => wrapped },
        { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId });
      expect(result).toMatchObject({ ok: false, status: 'failed', error: 'archive fsync failed', undo_operation_id: expect.any(String), results: [] });
      expect(flushes).toBe(2);
      expect(readFileSync(join(value.workspace, 'src/a.ts'), 'utf8')).toBe('current');
      expect(value.db.prepare('SELECT status FROM local_history_restores WHERE preview_id=?').get(value.previewId)).toEqual({ status: 'failed' });
    } finally { value.db.close(); }
  });

  it('preserves partial archive durability warnings in applied receipts and replay', async () => {
    const value = await fixture(false, true);
    const baseStore = await value.ctx.store();
    const storageDurability = { durable: false, warnings: ['directory flush unavailable on this platform'] };
    const wrapped = { ...baseStore, async flush() { await baseStore.flush(); return storageDurability; } };
    const ctx = { ...value.ctx, store: async () => wrapped };
    const input = { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId };
    try {
      const result = await applyHistoryRestore(ctx, input);
      expect(result).toMatchObject({ ok: true, storage_durability: storageDurability });
      expect(await applyHistoryRestore(ctx, input)).toMatchObject({ ok: true, storage_durability: storageDurability });
      const stored = value.db.prepare('SELECT result_json FROM local_history_restores WHERE preview_id=?').get(value.previewId);
      expect(JSON.parse(String(stored?.result_json))).toMatchObject({ storage_durability: storageDurability });
    } finally { value.db.close(); }
  });

  it('persists and replays committed receipts when postcommit observation fails', async () => {
    const value = await fixture(false, true);
    const actual = await vi.importActual<typeof import('@octocodeai/octocode-extension-rust')>('@octocodeai/octocode-extension-rust');
    vi.mocked(native.deleteFile).mockImplementationOnce(async (...args) => {
      const receipt = await actual.deleteFile(...args);
      vi.mocked(native.snapshotFile).mockRejectedValueOnce(new Error('postcommit observation unavailable'));
      return receipt;
    });
    const input = { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId };
    try {
      const result = await applyHistoryRestore(value.ctx, input);
      expect(result).toMatchObject({ ok: true, status: 'applied', results: [{
        path: 'src/a.ts', status: 'deleted', receipt: { committed: true },
        warnings: [expect.stringContaining('postcommit observation unavailable')],
      }] });
      if (!('results' in result)) throw new Error('Expected an applied restore receipt');
      expect(await applyHistoryRestore(value.ctx, input)).toMatchObject({ results: result.results });
    } finally { value.db.close(); }
  });

  it('rejects expired, replayed, and foreign-owner previews before writing', async () => {
    const expired = await fixture();
    expect(expired.preview).toMatchObject({ changes: [{ path: 'src/a.ts', action: 'unchanged' }], changed_files: 0 });
    expired.db.prepare('UPDATE local_history_restores SET expires_at=? WHERE preview_id=?').run('2000-01-01T00:00:00Z', expired.previewId);
    await expect(applyHistoryRestore(expired.ctx, { workspace: expired.workspace, agent_id: 'owner', preview_id: expired.previewId }))
      .rejects.toMatchObject({ code: 'HISTORY_PREVIEW_EXPIRED' });
    expired.db.close();

    const replay = await fixture();
    replay.db.prepare("UPDATE local_history_restores SET status='applied' WHERE preview_id=?").run(replay.previewId);
    await expect(applyHistoryRestore(replay.ctx, { workspace: replay.workspace, agent_id: 'owner', preview_id: replay.previewId }))
      .resolves.toMatchObject({ ok: true, status: 'applied', preview_id: replay.previewId });
    await expect(applyHistoryRestore(replay.ctx, { workspace: replay.workspace, agent_id: 'intruder', preview_id: replay.previewId }))
      .rejects.toMatchObject({ code: 'HISTORY_OPERATION_CONFLICT' });
    replay.db.close();
  });

  it('rejects active peer locks before creating an undo operation', async () => {
    const value = await fixture();
    value.db.prepare(`INSERT INTO task_runs
      (run_id,origin,agent_id,rationale,test_plan,status,workspace_path,created_at,updated_at)
      VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`).run('peer-run', 'WORK', 'peer', 'peer edit', 'test', value.workspace, value.now, value.now);
    value.db.prepare(`INSERT INTO run_files
      (run_id,file_path,source,started_at,heartbeat_at,expires_at) VALUES (?,?,?,?,?,?)`)
      .run('peer-run', 'src/a.ts', 'EXPLICIT', value.now, value.now, '2999-01-01T00:00:00Z');
    value.db.prepare('INSERT INTO awareness_locks(lock_id,file_path,run_id,acquired_at,expires_at) VALUES (?,?,?,?,?)')
      .run('lock', 'src/a.ts', 'peer-run', value.now, '2999-01-01T00:00:00Z');
    await expect(applyHistoryRestore(value.ctx, { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId }))
      .rejects.toMatchObject({ code: 'HISTORY_LOCK_CONFLICT' });
    expect(value.db.prepare("SELECT COUNT(*) AS count FROM local_history_operations WHERE operation_id <> 'source'").get()).toEqual({ count: 0 });
    value.db.close();
  });

  it('records a durable undo checkpoint and a failed receipt when object loading interrupts apply', async () => {
    const value = await fixture();
    value.db.prepare('UPDATE local_history_restores SET target_json=? WHERE preview_id=?').run(
      '[{"path":"src/a.ts","status":"captured","oid":"0123456789abcdef0123456789abcdef01234567","mode":"100644"}]', value.previewId,
    );
    await expect(applyHistoryRestore(value.ctx, { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId }))
      .resolves.toMatchObject({ ok: false, status: 'failed', preview_id: value.previewId });
    const receipt = value.db.prepare('SELECT status,undo_operation_id,result_json FROM local_history_restores WHERE preview_id=?').get(value.previewId) as Record<string, unknown>;
    expect(receipt.status).toBe('failed');
    expect(receipt.undo_operation_id).toEqual(expect.any(String));
    expect(receipt.result_json).toEqual(expect.stringContaining('error'));
    expect(value.db.prepare('SELECT status FROM local_history_operations WHERE operation_id=?').get(receipt.undo_operation_id as string))
      .toEqual({ status: 'complete' });
    expect(value.db.prepare('SELECT status FROM task_runs WHERE run_id=(SELECT lease_run_id FROM local_history_restores WHERE preview_id=?)').get(value.previewId))
      .toEqual({ status: 'FAILED' });
    value.db.close();
  });

  it('settles the receipt and releases the lease when the undo image cannot be verified', async () => {
    const value = await fixture(false, true);
    const baseStore = await value.ctx.store();
    const wrapped = { ...baseStore, async readBlob() { throw new Error('corrupt undo blob'); } };
    const result = await applyHistoryRestore({ ...value.ctx, store: async () => wrapped },
      { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId });
    expect(result).toMatchObject({ ok: false, status: 'failed', error: 'corrupt undo blob', undo_operation_id: expect.any(String) });
    expect(value.db.prepare('SELECT status FROM local_history_restores WHERE preview_id=?').get(value.previewId)).toEqual({ status: 'failed' });
    expect(value.db.prepare('SELECT status FROM task_runs WHERE run_id=(SELECT lease_run_id FROM local_history_restores WHERE preview_id=?)').get(value.previewId))
      .toEqual({ status: 'FAILED' });
    value.db.close();
  });

  it('holds the exclusive fence during undo and leaves successful restore verification pending', async () => {
    const value = await fixture();
    const baseStore = await value.ctx.store();
    let peerAttempt: ReturnType<typeof preFlightIntent> | undefined;
    const wrapped = { ...baseStore, async writeTree(entries: Parameters<typeof baseStore.writeTree>[0]) {
      peerAttempt = preFlightIntent(value.db, { agentId: 'peer', workspacePath: value.workspace, targetFiles: ['src/a.ts'],
        rationale: 'race restore', testPlan: 'test', requireRunContract: true });
      return baseStore.writeTree(entries);
    } };
    const result = await applyHistoryRestore({ ...value.ctx, store: async () => wrapped },
      { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId });
    expect(peerAttempt).toMatchObject({ ok: false, conflict: true });
    expect(result).toMatchObject({ ok: true, status: 'applied', verification_run_id: expect.any(String) });
    expect(value.db.prepare('SELECT status FROM task_runs WHERE run_id=?').get(String(result.verification_run_id))).toEqual({ status: 'PENDING' });
    expect(value.db.prepare("SELECT COUNT(*) AS count FROM task_runs WHERE status='SUCCESS'").get()).toEqual({ count: 0 });
    value.db.close();
  });

  it('does not write after an expired lease is acquired by a peer during undo', async () => {
    const value = await fixture();
    const baseStore = await value.ctx.store();
    let peerAttempt: ReturnType<typeof preFlightIntent> | undefined;
    const wrapped = { ...baseStore, async writeTree(entries: Parameters<typeof baseStore.writeTree>[0]) {
      value.db.prepare("UPDATE awareness_locks SET expires_at='2000-01-01T00:00:00Z'").run();
      value.db.prepare("UPDATE run_files SET expires_at='2000-01-01T00:00:00Z' WHERE run_id IN (SELECT lease_run_id FROM local_history_restores WHERE preview_id=?)")
        .run(value.previewId);
      peerAttempt = preFlightIntent(value.db, { agentId: 'peer', workspacePath: value.workspace, targetFiles: ['src/a.ts'],
        rationale: 'take expired fence', testPlan: 'test', requireRunContract: true });
      return baseStore.writeTree(entries);
    } };
    await expect(applyHistoryRestore({ ...value.ctx, store: async () => wrapped },
      { workspace: value.workspace, agent_id: 'owner', preview_id: value.previewId })).resolves.toMatchObject({ ok: false, status: 'conflict' });
    expect(peerAttempt).toMatchObject({ ok: true });
    expect(value.db.prepare('SELECT status FROM local_history_restores WHERE preview_id=?').get(value.previewId)).toEqual({ status: 'conflict' });
    value.db.close();
  });
});
