import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initDb } from '../src/db-init.js';
import { connectDb } from '../src/db-runtime.js';
import { SCHEMA_DDL, SCHEMA_INDEX_DDL } from '../src/db-schema.js';
import { AWARENESS_APPLICATION_ID } from '../src/storage-scope.js';
import { consolidateDatabase } from '../src/db-consolidation.js';
import { hookReceipts, upsertHookReceipt } from '../src/hook-receipts.js';
import { openAwarenessStore } from '../src/coordination/open.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendWorkerLifecycleEvent } from '../src/worker-lifecycle-ledger.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function oldStore() {
  const dir = mkdtempSync(join(tmpdir(), 'hook-schema-upgrade-'));
  dirs.push(dir);
  const source = join(dir, 'prior.sqlite3');
  const db = new DatabaseSync(source);
  db.exec(SCHEMA_DDL.replace("'claude','codex','copilot','cursor','gemini','opencode'", "'claude','codex','cursor'"));
  db.exec(SCHEMA_INDEX_DDL);
  db.exec(`PRAGMA application_id = ${AWARENESS_APPLICATION_ID}`);
  upsertHookReceipt(db, { workspacePath: dir, host: 'claude', event: 'Stop', status: 'success' });
  db.close();
  return { dir, source, destination: join(dir, 'converted.sqlite3') };
}

describe('hook receipt schema evolution', () => {
  it.each(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode'] as const)('persists %s host observations', (host) => {
    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      upsertHookReceipt(db, { workspacePath: '/workspace', host, event: 'stop', status: 'success' });
      expect(hookReceipts(db, '/workspace', host)).toHaveLength(1);
    } finally { db.close(); }
  });

  it('requires explicit conversion and preserves an exact prior store byte-for-byte', () => {
    const { dir, source, destination } = oldStore();
    const before = digest(source);
    expect(() => connectDb(source)).toThrow(/fingerprint/);
    const report = consolidateDatabase(source, destination);
    expect(report.copiedTables.hook_receipts).toBe(1);
    expect(digest(source)).toBe(before);
    const db = connectDb(destination);
    try {
      expect(hookReceipts(db, dir, 'claude')).toHaveLength(1);
      upsertHookReceipt(db, { workspacePath: dir, host: 'gemini', event: 'AfterTool', status: 'success' });
      expect(hookReceipts(db, dir, 'gemini')).toHaveLength(1);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
    expect(() => consolidateDatabase(source, destination)).toThrow(/already exists/);
  });

  it('rejects drift in a prior store and never publishes a destination', () => {
    const { source, destination } = oldStore();
    const db = new DatabaseSync(source);
    db.exec('CREATE INDEX unrecognized_receipt_index ON hook_receipts(event)');
    db.close();
    const before = digest(source);
    expect(() => consolidateDatabase(source, destination)).toThrow(/unsupported source schema/);
    expect(existsSync(destination)).toBe(false);
    expect(digest(source)).toBe(before);
  });

  it('previews a fully validated copy without publishing or changing either selected path', () => {
    const { source, destination } = oldStore();
    const before = digest(source);
    expect(consolidateDatabase(source, destination, { dryRun: true })).toMatchObject({ dryRun: true, copiedTables: { hook_receipts: 1 } });
    expect(existsSync(destination)).toBe(false);
    expect(digest(source)).toBe(before);
  });

  it('exposes preview through the real source CLI', () => {
    const { source, destination } = oldStore();
    const before = digest(source);
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../bin/awareness.ts', import.meta.url)),
      'database', 'consolidate', '--source', source, '--destination', destination, '--dry-run', '--compact'], { encoding: 'utf8', timeout: 30_000 });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, dryRun: true, copiedTables: { hook_receipts: 1 } });
    expect(existsSync(destination)).toBe(false);
    expect(digest(source)).toBe(before);
  });

  it('preserves pending runs, leases, binary memories, and host projections during conversion', () => {
    const { dir, source, destination } = oldStore();
    const db = new DatabaseSync(source);
    db.exec(`INSERT INTO sessions(session_id, agent_id, workspace_path, started_at) VALUES ('s', 'vendor:id', '${dir}', '2026-09-06T00:00:00Z');
      INSERT INTO task_runs(run_id, origin, agent_id, session_id, rationale, test_plan, status, workspace_path) VALUES ('r', 'WORK', 'vendor:id', 's', 'inspect', 'check', 'PENDING', '${dir}');
      INSERT INTO run_files(run_id, file_path, source, started_at, heartbeat_at, expires_at) VALUES ('r', '/file', 'EXPLICIT', '2026-09-06T00:00:00Z', '2026-09-06T00:00:00Z', '2099-09-06T00:00:00Z');
      INSERT INTO awareness_locks(lock_id, file_path, run_id, acquired_at) VALUES ('l', '/file', 'r', '2026-09-06T00:00:00Z');
      INSERT INTO awareness_memories(memory_id, agent_id, task_context, observation, importance, embedding) VALUES ('m', 'vendor:id', 'test', 'binary survives', 5, x'0001FF');
      INSERT INTO memory_refs(memory_id, reference) VALUES ('m', '/file');`);
    appendWorkerLifecycleEvent(db, { packetId: 'packet', workspace: dir, sessionId: 's', workerId: 'vendor:id', correlationId: 'c', type: 'worker.state', redaction: 'public', createdAt: '2026-09-06T00:00:00Z', payload: { state: 'running' } });
    const tables = ['sessions', 'task_runs', 'run_files', 'awareness_locks', 'awareness_memories', 'memory_refs', 'worker_lifecycle_events'];
    const prior = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    db.close();
    const before = digest(source);
    consolidateDatabase(source, destination);
    const copied = connectDb(destination);
    try { expect(tables.map((table) => copied.prepare(`SELECT * FROM ${table}`).all())).toEqual(prior); }
    finally { copied.close(); }
    expect(digest(source)).toBe(before);
  });

  it('preserves pruned outbox high-water marks so new events remain reachable by consumers', () => {
    const { dir, source, destination } = oldStore();
    const db = new DatabaseSync(source);
    db.prepare("INSERT INTO event_consumers VALUES (?, 'reader', 40, '2026-09-06T00:00:00Z')").run(dir);
    db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES ('event_outbox', 40)").run();
    db.close();
    consolidateDatabase(source, destination);
    const store = openAwarenessStore({ workspace: dir, dbPath: destination });
    try {
      const event = store.appendEvent(store.createHarnessEvent({ type: 'test', aggregateKind: 'audit', aggregateId: 'audit-1', payload: {} }));
      expect(event.sequence).toBe(41);
      expect(store.listEvents({ consumerId: 'reader' }).map(({ eventId }) => eventId)).toEqual([event.eventId]);
    } finally { store.close(); }
  });
});
