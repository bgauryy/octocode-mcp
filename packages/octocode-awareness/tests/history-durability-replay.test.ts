import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectDb } from '../src/db-runtime.js';
import { createHistoryContext } from '../src/history-store.js';
import { captureHistory } from '../src/history-capture.js';
import { assertCanonicalSchemaFingerprint, inspectSchemaState } from '../src/db-introspection.js';
import { initDb } from '../src/db-init.js';

let root: string;
let db: ReturnType<typeof connectDb>;
let dbPath: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'history-durability-')));
  dbPath = join(root, 'awareness.sqlite3');
  db = connectDb(dbPath);
  writeFileSync(join(root, 'a.ts'), 'before');
});
afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }); });
const before = { agent_id: 'fixture', workspace: '', operation_id: 'durability', phase: 'before' as const, file: ['a.ts'] };

it('persists exact platform warnings and replays each capture side without flushing again', async () => {
  const ctx = createHistoryContext(db, root);
  const archive = await ctx.store();
  const warnings = ['directory sync is not supported on this Windows volume'];
  const flush = vi.fn().mockResolvedValueOnce({ durable: false, warnings }).mockResolvedValueOnce({ durable: true, warnings: [] });
  ctx.store = async () => ({ ...archive, flush });
  const initial = await captureHistory(ctx, { ...before, workspace: root });
  expect(initial.storage_durability).toEqual({ durable: false, warnings });
  expect(await captureHistory(ctx, { ...before, workspace: root })).toEqual(initial);
  expect(flush).toHaveBeenCalledTimes(1);
  writeFileSync(join(root, 'a.ts'), 'after');
  const after = { workspace: root, agent_id: 'fixture', operation_id: 'durability', phase: 'after' as const, outcome: 'success' as const };
  const completed = await captureHistory(ctx, after);
  expect(completed.storage_durability).toEqual({ durable: true, warnings: [] });
  expect(await captureHistory(ctx, after)).toEqual(completed);
  expect((await captureHistory(ctx, { ...before, workspace: root })).storage_durability).toEqual(initial.storage_durability);
  expect(flush).toHaveBeenCalledTimes(2);
  db.close(); db = connectDb(dbPath);
  expect(await captureHistory(createHistoryContext(db, root), after)).toEqual(completed);
});

it('upgrades only the exact predecessor and leaves old capture evidence unknown', async () => {
  await captureHistory(createHistoryContext(db, root), { ...before, workspace: root });
  db.exec('DROP TABLE local_history_durability');
  expect(inspectSchemaState(db)).toBe('history-durability-upgrade');
  db.close(); db = connectDb(dbPath);
  expect(() => assertCanonicalSchemaFingerprint(db)).not.toThrow();
  const replay = await captureHistory(createHistoryContext(db, root), { ...before, workspace: root });
  expect(replay.storage_durability).toBeNull();
  expect(db.prepare('SELECT COUNT(*) AS count FROM local_history_durability').get()).toMatchObject({ count: 0 });
  db.exec('DROP TABLE local_history_durability');
  db.exec('ALTER TABLE local_history_operations ADD COLUMN unrelated TEXT');
  expect(() => initDb(db)).toThrow(/fingerprint mismatch/);
  expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='local_history_durability'").get()).toBeUndefined();
});
