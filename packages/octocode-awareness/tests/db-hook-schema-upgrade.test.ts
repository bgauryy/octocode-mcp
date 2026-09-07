import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { consolidateDatabase } from '../src/db-consolidation.js';
import { initDb } from '../src/db-init.js';
import { SCHEMA_DDL, SCHEMA_INDEX_DDL } from '../src/db-schema.js';
import { hookReceipts, upsertHookReceipt } from '../src/hook-receipts.js';
import { AWARENESS_APPLICATION_ID } from '../src/storage-scope.js';
import { openAwarenessStore } from '../src/coordination/open.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

function paths() {
  const dir = mkdtempSync(join(tmpdir(), 'canonical-consolidation-'));
  dirs.push(dir);
  return { dir, source: join(dir, 'source.sqlite3'), destination: join(dir, 'destination.sqlite3') };
}

describe('canonical schema consolidation', () => {
  it.each(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode'] as const)('persists %s host observations', (host) => {
    const db = new DatabaseSync(':memory:');
    try {
      initDb(db);
      upsertHookReceipt(db, { workspacePath: '/workspace', host, event: 'stop', status: 'success' });
      expect(hookReceipts(db, '/workspace', host)).toHaveLength(1);
    } finally { db.close(); }
  });

  it('rejects the former host-enum schema without publishing or changing the source', () => {
    const { source, destination } = paths();
    const db = new DatabaseSync(source);
    db.exec(SCHEMA_DDL.replace("'claude','codex','copilot','cursor','gemini','opencode'", "'claude','codex','cursor'"));
    db.exec(SCHEMA_INDEX_DDL);
    db.exec(`PRAGMA application_id=${AWARENESS_APPLICATION_ID}`);
    db.close();
    const before = digest(source);
    expect(() => consolidateDatabase(source, destination)).toThrow(/fingerprint mismatch/);
    expect(existsSync(destination)).toBe(false);
    expect(digest(source)).toBe(before);
  });

  it('copies an exact current canonical store to a new file', () => {
    const { dir, source, destination } = paths();
    const db = new DatabaseSync(source);
    initDb(db);
    upsertHookReceipt(db, { workspacePath: dir, host: 'codex', event: 'stop', status: 'success' });
    db.close();
    const before = digest(source);
    expect(consolidateDatabase(source, destination).copiedTables.hook_receipts).toBe(1);
    expect(digest(source)).toBe(before);
    const copied = new DatabaseSync(destination, { readOnly: true });
    try { expect(hookReceipts(copied, dir, 'codex')).toHaveLength(1); }
    finally { copied.close(); }
  });

  it('preserves a pruned canonical outbox high-water mark across the copy', () => {
    const { dir, source, destination } = paths();
    const db = new DatabaseSync(source);
    initDb(db);
    db.prepare("INSERT INTO event_consumers VALUES (?, 'reader', 40, '2026-09-06T00:00:00Z')").run(dir);
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES ('event_outbox',40)").run();
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
