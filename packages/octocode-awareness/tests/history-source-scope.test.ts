import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand, type AwarenessCommandCall } from '../src/command-api.js';
import { connectDb } from '../src/db-runtime.js';
import { createHistoryContext } from '../src/history-store.js';
import { historyInspect } from '../src/history-query.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
it('inspects and reads linked history through executable caller-bound pages without granting restore authority', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-source-'))); roots.push(root);
  const main = join(root, 'main'); const peer = join(root, 'peer'); const clone = join(root, 'clone');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' });
  mkdirSync(main); git(main, 'init', '-q', '-b', 'main');
  git(main, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'seed');
  git(main, 'worktree', 'add', '-qb', 'peer', peer); git(root, 'clone', '-q', main, clone);
  for (const name of ['a', 'b', 'unicode-λ']) writeFileSync(join(main, name), `bytes:${name}`);
  const context = { workspace: peer, database: join(root, 'ledger.sqlite3'), agentId: 'reader', compact: true };
  const captured = await executeAwarenessCommand({ command: 'history checkpoint', params: { operation_id: 'source', file: ['a', 'b', 'unicode-λ'] } }, { ...context, workspace: main });
  expect(captured.exitCode, JSON.stringify(captured.payload)).toBe(0);
  const status = await executeAwarenessCommand({ command: 'history status', params: {} }, { ...context, workspace: main });
  const storage = (status.payload as { storage: { root: string; git_dir: string } }).storage;
  const archivePaths = [storage.root, join(storage.root, 'history-store.json'), join(storage.git_dir, 'config'), join(storage.git_dir, 'HEAD')];
  const archiveState = () => archivePaths.map(path => { const value = statSync(path); return [value.mode, value.mtimeMs, value.ctimeMs]; });
  const beforeRead = archiveState();
  let request: AwarenessCommandCall | undefined = { command: 'history inspect', params: { source_workspace: main, operation_id: 'source', limit: 1 } };
  const files: string[] = [];
  let read: AwarenessCommandCall | undefined;
  while (request) {
    const result = await executeAwarenessCommand(request, context);
    expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
    const payload = result.payload as { rows: Array<{ file_path: string; next?: { after?: { call: AwarenessCommandCall } } }>; next?: { call: AwarenessCommandCall } };
    for (const row of payload.rows) { files.push(row.file_path); read ??= row.next?.after?.call; }
    request = payload.next?.call;
    if (request) expect(request.params).toMatchObject({ workspace: peer, source_workspace: main });
  }
  expect(files).toEqual(['a', 'b', 'unicode-λ']);
  expect(read?.command).toBe('history read');
  read!.params = { ...read!.params, limit: 2 };
  const bytes: Buffer[] = [];
  while (read) {
    const result = await executeAwarenessCommand(read, context);
    expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
    const payload = result.payload as { content: string; next?: { call: AwarenessCommandCall } };
    bytes.push(Buffer.from(payload.content, 'base64')); read = payload.next?.call;
    if (read) expect(read.params).toMatchObject({ workspace: peer, source_workspace: main });
  }
  expect(Buffer.concat(bytes).toString()).toBe('bytes:a');
  expect(archiveState()).toEqual(beforeRead);
  for (const command of ['history inspect', 'history read']) {
    const result = await executeAwarenessCommand({ command, params: { operation_id: 'source', source_workspace: main,
      ...(command === 'history read' ? { file: 'a', side: 'after' } : {}) } }, { ...context, workspace: clone });
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.payload)).toContain('HISTORY_SOURCE_WORKSPACE');
  }
  const restore = await executeAwarenessCommand({ command: 'history restore-preview', params: { source_workspace: main, operation_id: 'source', side: 'after' } }, context);
  expect(restore.exitCode).toBe(1);
  renameSync(storage.root, `${storage.root}.retained`);
  const missing = await executeAwarenessCommand({ command: 'history read', params: {
    source_workspace: main, operation_id: 'source', file: 'a', side: 'after',
  } }, context);
  expect(missing.exitCode).toBe(1);
  expect(existsSync(storage.root)).toBe(false);
});

it('rejects cross-caller and malformed inspect cursors and restarts changed operation snapshots', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-inspect-cursor-'))); roots.push(root);
  const db = connectDb(join(root, 'ledger.sqlite3'));
  const ctx = createHistoryContext(db, root);
  const now = new Date().toISOString();
  try {
    db.prepare(`INSERT INTO local_history_operations
      (operation_id,workspace_path,agent_id,kind,status,outcome,request_hash,created_at,updated_at)
      VALUES (?,?,?,'checkpoint','complete','unknown',?,?,?)`).run('source', root, 'reader', 'request', now, now);
    for (const [ordinal, path] of ['a', 'b', 'c'].entries()) {
      db.prepare('INSERT INTO local_history_versions (operation_id,file_path,ordinal) VALUES (?,?,?)').run('source', path, ordinal);
    }
    const input = { workspace: root, operation_id: 'source', limit: 1 };
    const first = historyInspect(ctx, input);
    const cursor = (first.next?.args as Record<string, unknown> | undefined)?.cursor as string;
    expect(cursor).toBeTypeOf('string');
    expect(() => historyInspect({ ...ctx, requestWorkspace: '/different-caller' }, { ...input, cursor })).toThrow('Inspect cursor');
    expect(() => historyInspect(ctx, { ...input, cursor: 'invalid' })).toThrow('Inspect cursor');
    db.prepare("UPDATE local_history_operations SET status='partial' WHERE operation_id='source'").run();
    const changed = historyInspect(ctx, { ...input, cursor });
    expect(changed).toMatchObject({ rows: [], partial: true, partialReasons: ['snapshot_changed'] });
    expect(changed.next?.args).toEqual(input);
    expect(historyInspect(ctx, changed.next!.args as typeof input).rows.map(row => row.file_path)).toEqual(['a']);
  } finally { db.close(); }
});
