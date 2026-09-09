import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectDb } from '../src/db-runtime.js';
import { createHistoryContext, historyHash } from '../src/history-store.js';
import { runAwarenessHistoryOperation } from '../src/history.js';

describe('workspace-local private history storage', () => {
  let root: string;
  let workspace: string;
  let dbPath: string;
  let db: ReturnType<typeof connectDb>;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-localgit-')));
    workspace = join(root, 'workspace');
    mkdirSync(workspace);
    dbPath = join(root, 'awareness.sqlite3');
    db = connectDb(dbPath);
    writeFileSync(join(workspace, 'a.ts'), 'original bytes');
  });
  afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
  const destination = () => join(workspace, '.octocode', '.localGit', historyHash(realpathSync(dbPath)), 'awareness-v1', historyHash(workspace));
  const legacy = () => join(`${dbPath}.history`, 'awareness-v1', historyHash(workspace));
  const capture = (operation_id: string) => runAwarenessHistoryOperation(db, 'capture', {
    workspace, agent_id: 'localgit-test', phase: 'before', file: ['a.ts'], operation_id,
  });

  it('initializes lazily under .octocode/.localGit and never creates a database sidecar', async () => {
    const status = await runAwarenessHistoryOperation(db, 'status', { workspace });
    expect(status).toMatchObject({ initialized: false, storage: { root: destination(), relocation_required: false } });
    expect(existsSync(join(workspace, '.octocode'))).toBe(false);
    await capture('first');
    expect(existsSync(join(destination(), 'repo.git', 'objects'))).toBe(true);
    expect(existsSync(`${dbPath}.history`)).toBe(false);
    expect(await runAwarenessHistoryOperation(db, 'status', { workspace })).toMatchObject({ initialized: true });
    expect(await runAwarenessHistoryOperation(db, 'read', { workspace, operation_id: 'first', file: 'a.ts', side: 'before' }))
      .toMatchObject({ content: Buffer.from('original bytes').toString('base64') });
  });

  it('isolates separate databases while sharing the namespace between connections', async () => {
    const first = await createHistoryContext(db, workspace).store();
    const secondDb = connectDb(join(root, 'other.sqlite3'));
    const aliasDb = connectDb(dbPath);
    try {
      expect((await createHistoryContext(secondDb, workspace).store()).gitdir).not.toBe(first.gitdir);
      expect((await createHistoryContext(aliasDb, workspace).store()).gitdir).toBe(first.gitdir);
    } finally { secondDb.close(); aliasDb.close(); }
  });

  it('reports old history without creating a new journal or silently abandoning old bytes', async () => {
    mkdirSync(legacy(), { recursive: true });
    writeFileSync(join(legacy(), 'sentinel'), 'preserve');
    expect(await runAwarenessHistoryOperation(db, 'status', { workspace })).toMatchObject({
      initialized: false, storage: { root: destination(), legacy_root: legacy(), relocation_required: true },
    });
    await expect(capture('blocked')).rejects.toMatchObject({ code: 'HISTORY_STORE_RELOCATION_REQUIRED' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM local_history_operations').get()).toEqual({ n: 0 });
    expect(existsSync(destination())).toBe(false);
    expect(readFileSync(join(legacy(), 'sentinel'), 'utf8')).toBe('preserve');
  });

  it('reads retained objects after an explicit offline relocation of the exact store', async () => {
    await capture('retained');
    mkdirSync(join(`${dbPath}.history`, 'awareness-v1'), { recursive: true });
    renameSync(destination(), legacy());
    await expect(capture('blocked')).rejects.toMatchObject({ code: 'HISTORY_STORE_RELOCATION_REQUIRED' });
    renameSync(legacy(), destination());
    expect(await runAwarenessHistoryOperation(db, 'read', { workspace, operation_id: 'retained', file: 'a.ts', side: 'before' }))
      .toMatchObject({ content: Buffer.from('original bytes').toString('base64') });
    await capture('resumed');
  });

  it.each(['.octocode', '.localGit'])('rejects a symlinked %s ancestor before creating history elsewhere', async (part) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    if (part === '.localGit') mkdirSync(join(workspace, '.octocode'));
    symlinkSync(outside, part === '.octocode' ? join(workspace, part) : join(workspace, '.octocode', part));
    await expect(capture('unsafe')).rejects.toMatchObject({ code: 'HISTORY_UNSAFE_STORAGE' });
    expect(existsSync(join(outside, historyHash(realpathSync(dbPath))))).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM local_history_operations').get()).toEqual({ n: 0 });
  });

  it('does not allocate workspace storage for an in-memory database', async () => {
    const memory = connectDb(':memory:');
    try {
      expect(await runAwarenessHistoryOperation(memory, 'status', { workspace })).toMatchObject({ available: false, storage: null });
      expect(() => createHistoryContext(memory, workspace).store()).toThrow(expect.objectContaining({ code: 'HISTORY_DISABLED' }));
      expect(existsSync(join(workspace, '.octocode'))).toBe(false);
    } finally { memory.close(); }
  });

  it('reports expired previews and unfinished captures without deleting recovery evidence', async () => {
    await capture('retained');
    writeFileSync(join(workspace, 'a.ts'), 'changed');
    const preview = await runAwarenessHistoryOperation(db, 'restore-preview', { workspace, agent_id: 'localgit-test', operation_id: 'retained', side: 'before' });
    db.prepare("UPDATE local_history_restores SET expires_at='2000-01-01T00:00:00.000Z' WHERE preview_id=?").run(String(preview.preview_id));
    await capture('unfinished');
    db.prepare("UPDATE local_history_operations SET status='capturing' WHERE operation_id='unfinished'").run();
    expect(await runAwarenessHistoryOperation(db, 'status', { workspace })).toMatchObject({
      retention: { automatic_object_pruning: false, expired_restore_previews: 1, applying_restores: 0, capturing_operations: 1 },
    });
    await expect(runAwarenessHistoryOperation(db, 'restore-apply', { workspace, agent_id: 'localgit-test', preview_id: preview.preview_id }))
      .rejects.toMatchObject({ code: 'HISTORY_PREVIEW_EXPIRED' });
    expect(readFileSync(join(workspace, 'a.ts'), 'utf8')).toBe('changed');
    expect(db.prepare('SELECT COUNT(*) AS n FROM local_history_restores').get()).toEqual({ n: 1 });
  });
});
