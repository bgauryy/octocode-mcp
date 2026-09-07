import type { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { runAwarenessHistoryOperation } from '../src/history.js';
import { HistoryError } from '../src/history-store.js';
import { HISTORY_ROUTE_DESCRIPTORS } from '../src/schema/definitions-history.js';
import { GLOBAL_FLAGS, type ParsedArgs } from './cli-model.js';
import { parseArgs } from './cli-model.js';
import { connectDb, resolveDbPath } from '../src/db-runtime.js';
import { parseStorageScope } from '../src/storage-scope.js';
import { storageScopeForCommand } from '../src/workspace-policy.js';

export async function runHistoryCommand(db: DatabaseSync, command: string, args: ParsedArgs) {
  const route = HISTORY_ROUTE_DESCRIPTORS.find(entry => entry.schema === command);
  if (!route) throw new Error('Unknown history route.');
  const request: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === '_' || GLOBAL_FLAGS.includes(key)) continue;
    if (key === 'limit' || key === 'offset') request[key] = typeof value === 'string' ? Number(value) : value;
    else if (Array.isArray(value) && !(key === 'file' && ['history_capture', 'history_checkpoint', 'history_restore_preview'].includes(command))) {
      if (value.length !== 1) throw new HistoryError('HISTORY_INVALID_REQUEST', `--${key} accepts one value for this command.`);
      request[key] = value[0];
    } else request[key] = value;
  }
  if (args._.length) throw new HistoryError('HISTORY_INVALID_REQUEST', 'History commands do not accept positional arguments.');
  return runAwarenessHistoryOperation(db, route.command.slice('history '.length), request);
}

/** Native hosts share the exact history CLI request path without changing the existing synchronous CLI API. */
export async function execHistoryCli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let db: DatabaseSync | undefined;
  try {
    const [noun, action, ...flags] = argv;
    const route = HISTORY_ROUTE_DESCRIPTORS.find(entry => entry.command === `${noun} ${action}`);
    if (!route) throw new HistoryError('HISTORY_INVALID_REQUEST', 'Expected a canonical history noun/action.');
    const args = parseArgs(flags);
    const allowed = new Set<string>([...route.allowed, ...GLOBAL_FLAGS]);
    for (const key of Object.keys(args)) if (key !== '_' && !allowed.has(key)) throw new HistoryError('HISTORY_INVALID_REQUEST', `Unknown history flag: ${key}`);
    if (typeof args.workspace !== 'string') throw new HistoryError('HISTORY_INVALID_REQUEST', '--workspace must name one workspace.');
    if (args.db !== undefined && typeof args.db !== 'string') throw new HistoryError('HISTORY_INVALID_REQUEST', '--db must name one database.');
    const scope = storageScopeForCommand(route.schema, args.workspace, args.db_scope === undefined ? undefined : parseStorageScope(String(args.db_scope)));
    db = connectDb(resolveDbPath(args.db as string | undefined, { scope, workspace: args.workspace }));
    const payload = await runHistoryCommand(db, route.schema, args);
    return { code: payload.ok === false ? 2 : 0, stdout: JSON.stringify(payload), stderr: '' };
  } catch (error) {
    return { code: 1, stdout: JSON.stringify({ ok: false, error: { code: error instanceof HistoryError ? error.code : 'HISTORY_FAILED', message: error instanceof Error ? error.message : String(error) } }), stderr: '' };
  } finally { db?.close(); }
}
