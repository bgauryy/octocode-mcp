import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { getDatabasePath } from './db-runtime.js';
import type { HistoryGitStore } from './history-git.js';
import { historyEntitySchemas } from './schema/definitions-history.js';
import type { z } from 'zod';

export type HistoryOperation = z.infer<typeof historyEntitySchemas.local_history_operation>;
export type HistoryVersion = z.infer<typeof historyEntitySchemas.local_history_version>;
export class HistoryError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'HistoryError'; }
}
export interface HistoryContext {
  db: DatabaseSync;
  workspace: string;
  dbPath: string;
  /** Caller binding for authorized source reads; never used to authorize mutations. */
  requestWorkspace?: string;
  store(): Promise<HistoryGitStore>;
}
export const historyHash = (value: string): string => createHash('sha256').update(value).digest('hex');
function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
/** One placement owner for the lazy store and its read-only status projection. */
export function historyStoragePaths(ctx: Pick<HistoryContext, 'workspace' | 'dbPath'>) {
  if (ctx.dbPath === ':memory:') return null;
  const historyRoot = resolve(ctx.workspace, '.octocode', '.localGit', historyHash(realpathSync(ctx.dbPath)));
  const root = resolve(historyRoot, 'awareness-v1', historyHash(ctx.workspace));
  const legacyRoot = resolve(`${ctx.dbPath}.history`, 'awareness-v1', historyHash(ctx.workspace));
  return { history_root: historyRoot, root, git_dir: resolve(root, 'repo.git'),
    legacy_root: legacyRoot, relocation_required: pathExists(legacyRoot) };
}
/** Reject unsafe placement or a split history before writing a capture journal. */
export function assertHistoryStorageReady(ctx: Pick<HistoryContext, 'workspace' | 'dbPath'>): void {
  const storage = historyStoragePaths(ctx);
  if (!storage) throw new HistoryError('HISTORY_DISABLED', 'Local history requires a persistent Awareness database.');
  let candidate = ctx.workspace;
  for (const part of relative(ctx.workspace, storage.root).split(sep)) {
    candidate = resolve(candidate, part);
    try {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new HistoryError('HISTORY_UNSAFE_STORAGE', `History storage ancestor must be a directory, not a symlink: ${candidate}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (storage.relocation_required) throw new HistoryError('HISTORY_STORE_RELOCATION_REQUIRED',
    `Existing history remains at ${storage.legacy_root}. Stop history writers and explicitly relocate that complete store to ${storage.root}; never merge stores. Inspect history status and the local-history relocation guide before resuming.`);
}
export function createHistoryContext(db: DatabaseSync, workspace: string, options: { readOnly?: boolean } = {}): HistoryContext {
  const canonical = realpathSync(workspace);
  const dbPath = getDatabasePath(db);
  let pending: Promise<HistoryGitStore> | undefined;
  return { db, workspace: canonical, dbPath, store() {
    const context = { workspace: canonical, dbPath };
    assertHistoryStorageReady(context);
    const storage = historyStoragePaths(context)!;
    return pending ??= import('./history-git.js').then(({ openHistoryGitStore }) => openHistoryGitStore({
      historyRoot: storage.history_root,
      storeId: 'awareness-v1',
      workspaceId: historyHash(canonical),
      boundaryRoot: canonical,
      ignoreMarkerPath: resolve(storage.history_root, '..', '.gitignore'),
      readOnly: options.readOnly,
    }));
  } };
}
export function historyPath(ctx: HistoryContext, path: string): string {
  if (path.includes('\0') || path.includes('\\')) throw new HistoryError('HISTORY_INVALID_PATH', 'Invalid history path.');
  const result = relative(ctx.workspace, resolve(ctx.workspace, path));
  if (!result || isAbsolute(result) || result === '..' || result.startsWith(`..${sep}`)) {
    throw new HistoryError('HISTORY_INVALID_PATH', 'History paths must name files inside the workspace.');
  }
  return result.split(sep).join('/');
}
export function historyPaths(ctx: HistoryContext, files: string[]): string[] {
  return [...new Set(files.map(file => historyPath(ctx, file)))].sort();
}
export function historyOperation(ctx: HistoryContext, id: string): HistoryOperation {
  const row = ctx.db.prepare('SELECT * FROM local_history_operations WHERE operation_id = ? AND workspace_path = ?').get(id, ctx.workspace);
  if (!row) throw new HistoryError('HISTORY_NOT_FOUND', 'History operation does not exist in this workspace.');
  return historyEntitySchemas.local_history_operation.parse(row);
}
export function historyVersions(ctx: HistoryContext, id: string): HistoryVersion[] {
  historyOperation(ctx, id);
  return ctx.db.prepare('SELECT * FROM local_history_versions WHERE operation_id = ? ORDER BY ordinal').all(id)
    .map(row => historyEntitySchemas.local_history_version.parse(row));
}
export function historyReceipt(ctx: HistoryContext, id: string, side?: 'before' | 'after') {
  const operation = historyOperation(ctx, id);
  const stored = ctx.db.prepare('SELECT * FROM local_history_durability WHERE operation_id = ? AND side = ?')
    .get(id, side ?? (operation.after_commit_oid ? 'after' : 'before'));
  const evidence = stored ? historyEntitySchemas.local_history_durability.parse(stored) : null;
  return { ok: true as const, operation, versions: historyVersions(ctx, id),
    storage_durability: evidence ? { durable: evidence.durable === 1, warnings: JSON.parse(evidence.warnings_json) as string[] } : null };
}
/** Only synchronous SQLite statements belong inside this short transaction. */
export function historyTransaction<T>(ctx: HistoryContext, action: () => T): T {
  ctx.db.exec('BEGIN IMMEDIATE');
  try { const value = action(); ctx.db.exec('COMMIT'); return value; }
  catch (error) { ctx.db.exec('ROLLBACK'); throw error; }
}
