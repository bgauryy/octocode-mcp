import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { initDb } from '../src/db-init.js';
import { pruneStale } from '../src/maintenance-stale.js';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  initDb(db);
  return db;
}

function runAndLock(db: DatabaseSync, expiresAt: string | null): string {
  const runId = `run_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO task_runs
    (run_id, origin, agent_id, rationale, test_plan, status, workspace_path, created_at, updated_at)
    VALUES (?, 'WORK', 'agent-audit', 'expiry audit', 'focused test', 'ACTIVE', '/repo', ?, ?)`)
    .run(runId, now, now);
  db.prepare(`INSERT INTO awareness_locks
    (lock_id, file_path, run_id, acquired_at, expires_at) VALUES (?, '/repo/a.ts', ?, ?, ?)`)
    .run(`lock_${randomUUID().replace(/-/g, '')}`, runId, now, expiresAt);
  return runId;
}

describe('local expiration audit', () => {
  it('prunes a lock at the exact expiry instant', () => {
    const instant = new Date('2030-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(instant);
    const db = freshDb();
    try {
      runAndLock(db, instant.toISOString());
      expect(pruneStale(db).pruned_locks).toBe(1);
    } finally {
      db.close();
      vi.useRealTimers();
    }
  });

  it('uses older_than_minutes as an explicit age override for future and null leases', () => {
    const db = freshDb();
    try {
      const futureRun = runAndLock(db, new Date(Date.now() + 60 * 60_000).toISOString());
      const nullRun = runAndLock(db, null);
      const old = new Date(Date.now() - 10 * 60_000).toISOString();
      db.prepare('UPDATE awareness_locks SET acquired_at = ?').run(old);

      expect(pruneStale(db).pruned_locks).toBe(0);
      expect(pruneStale(db, { older_than_minutes: 5 }).pruned_locks).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS count FROM task_runs WHERE run_id IN (?, ?)').get(futureRun, nullRun)).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  });

  it('propagates stale-lock query errors instead of reporting zero cleanup', () => {
    const db = freshDb();
    db.exec('DROP TABLE awareness_locks');
    try {
      expect(() => pruneStale(db)).toThrow(/no such table: awareness_locks/);
    } finally {
      db.close();
    }
  });
});
