import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { getDatabasePath } from './db-runtime.js';
import { openHistoryGitStore, type HistoryGitStore } from './history-git.js';
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
  store(): Promise<HistoryGitStore>;
}
export const historyHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function createHistoryContext(db: DatabaseSync, workspace: string): HistoryContext {
  const canonical = realpathSync(workspace);
  const dbPath = getDatabasePath(db);
  let pending: Promise<HistoryGitStore> | undefined;
  return { db, workspace: canonical, dbPath, store() {
    if (dbPath === ':memory:') throw new HistoryError('HISTORY_DISABLED', 'Local history requires a persistent Awareness database.');
    return pending ??= openHistoryGitStore({ historyRoot: `${dbPath}.history`, storeId: 'awareness-v1', workspaceId: historyHash(canonical) });
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
export function historyReceipt(ctx: HistoryContext, id: string) {
  return { ok: true as const, operation: historyOperation(ctx, id), versions: historyVersions(ctx, id) };
}
/** Only synchronous SQLite statements belong inside this short transaction. */
export function historyTransaction<T>(ctx: HistoryContext, action: () => T): T {
  ctx.db.exec('BEGIN IMMEDIATE');
  try { const value = action(); ctx.db.exec('COMMIT'); return value; }
  catch (error) { ctx.db.exec('ROLLBACK'); throw error; }
}
