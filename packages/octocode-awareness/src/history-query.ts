import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { historyEntitySchemas, type HistoryReadInput, type HistoryTimelineInput } from './schema/definitions-history.js';
import { HistoryError, historyHash, historyPath, historyVersions, type HistoryContext } from './history-store.js';
import { historyGitBackend } from './history-git.js';

const cursorSchema = z.object({ scope: z.string().length(64), before: z.number().int().positive() }).strict();
function continuation(ctx: HistoryContext, command: string, args: Record<string, unknown>) {
  const scoped = { ...args, workspace: ctx.workspace };
  const argv = ['history', command, '--db', ctx.dbPath];
  for (const [key, value] of Object.entries(scoped)) {
    if (value !== undefined) argv.push(`--${key.replaceAll('_', '-')}`, String(value));
  }
  argv.push('--compact');
  return { command: `history ${command}`, args: scoped, db: ctx.dbPath, argv };
}
export function historyStatus(ctx: HistoryContext) {
  const count = ctx.db.prepare('SELECT COUNT(*) AS operations, SUM(status IN (\'capturing\',\'open\',\'failed\',\'partial\')) AS incomplete FROM local_history_operations WHERE workspace_path=?').get(ctx.workspace)!;
  return { ok: true, available: ctx.dbPath !== ':memory:', initialized: ctx.dbPath !== ':memory:' && existsSync(join(`${ctx.dbPath}.history`, 'awareness-v1', historyHash(ctx.workspace), 'history-store.json')),
    backend: historyGitBackend(),
    workspace: ctx.workspace, operations: Number(count.operations), incomplete: Number(count.incomplete ?? 0),
    disabled_reason: ctx.dbPath === ':memory:' ? 'memory_database' : null };
}
export function historyTimeline(ctx: HistoryContext, input: HistoryTimelineInput) {
  const file = input.file === undefined ? undefined : historyPath(ctx, input.file);
  const scope = historyHash(JSON.stringify([ctx.dbPath, ctx.workspace, file ?? null]));
  let before = Number.MAX_SAFE_INTEGER;
  if (input.cursor) {
    try {
      const cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')));
      if (cursor.scope !== scope) throw new Error('scope mismatch');
      before = cursor.before;
    } catch { throw new HistoryError('HISTORY_CURSOR_INVALID', 'Timeline cursor does not match the selected store, workspace, and file.'); }
  }
  const clauses = ['o.workspace_path=?', 'o.rowid<?'];
  const bindings: Array<string | number> = [ctx.workspace, before];
  if (file) {
    clauses.push('EXISTS (SELECT 1 FROM local_history_versions v WHERE v.operation_id=o.operation_id AND v.file_path=?)');
    bindings.push(file);
  }
  const rows = ctx.db.prepare(`SELECT o.rowid AS sequence,o.*,
    (SELECT COUNT(*) FROM local_history_versions v WHERE v.operation_id=o.operation_id) AS file_count
    FROM local_history_operations o WHERE ${clauses.join(' AND ')} ORDER BY o.rowid DESC LIMIT ?`)
    .all(...bindings, input.limit + 1);
  const page = rows.slice(0, input.limit);
  const operations = page.map(({ sequence: _sequence, file_count, ...row }) => ({ ...historyEntitySchemas.local_history_operation.parse(row), file_count: Number(file_count) }));
  const last = page.at(-1);
  const cursor = last && rows.length > input.limit ? Buffer.from(JSON.stringify({ scope, before: Number(last.sequence) })).toString('base64url') : null;
  return { ok: true, operations, partial: cursor !== null, next: cursor ? continuation(ctx, 'timeline', { file, limit: input.limit, cursor }) : null };
}
export async function historyRead(ctx: HistoryContext, input: HistoryReadInput) {
  const file = historyPath(ctx, input.file);
  const row = historyVersions(ctx, input.operation_id).find(version => version.file_path === file);
  if (!row) throw new HistoryError('HISTORY_NOT_FOUND', 'This file was not part of the selected operation.');
  const status = row[`${input.side}_status`];
  const oid = row[`${input.side}_oid`];
  if (status !== 'captured' || !oid) return { ok: true, status, content: null, reason: row[`${input.side}_reason`], next: null };
  const bytes = await (await ctx.store()).readBlob(oid, 2 * 1024 * 1024);
  const end = Math.min(bytes.byteLength, input.offset + input.limit);
  const hasMore = end < bytes.byteLength;
  return { ok: true, status, oid, mode: row[`${input.side}_mode`], encoding: 'base64', content: Buffer.from(bytes.subarray(input.offset, end)).toString('base64'),
    total_bytes: bytes.byteLength, offset: input.offset, partial: hasMore,
    next: hasMore ? continuation(ctx, 'read', { ...input, file, offset: end }) : null };
}
