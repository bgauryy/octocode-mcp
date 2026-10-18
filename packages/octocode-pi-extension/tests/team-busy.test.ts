import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Member } from '../src/team/model.js';
import { TeamStore } from '../src/team/store.js';
import { tmp } from './helpers.js';

const member = (id: string): Member => ({
  id, role: id, pid: process.pid, status: 'idle', joinedAt: 1_000, updatedAt: Date.now(), toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
});

describe('team store on a busy database', () => {
  it('opens without waiting for housekeeping while another process holds the write lock, and prunes at the next heartbeat', () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.git'));
    const file = path.join(tmp(), 'team.sqlite');
    TeamStore.open(cwd, file).close();
    // Another process mid-write: an expired lease is left for the prune to remove.
    const other = new DatabaseSync(file);
    other.exec('PRAGMA busy_timeout=5000');
    other.prepare("INSERT INTO leases (workspace, path, path_key, kind, owner, reason, acquired_at, expires_at) VALUES (?, 'a.ts', 'a.ts', 'file', 'gone', '', 0, 1)").run(fs.realpathSync(cwd));
    other.exec('BEGIN IMMEDIATE');
    const started = Date.now();
    let store: TeamStore | undefined;
    try {
      store = TeamStore.open(cwd, file);
      // Well under the 5 s a write the agent asked for would wait.
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      other.exec('COMMIT');
    }
    try {
      expect(other.prepare("SELECT COUNT(*) AS n FROM leases WHERE owner = 'gone'").get()).toEqual({ n: 1 });
      expect(store.save(member('inky'))).toBe(true);
      expect(other.prepare("SELECT COUNT(*) AS n FROM leases WHERE owner = 'gone'").get()).toEqual({ n: 0 });
    } finally {
      store.close();
      other.close();
    }
  });
});
