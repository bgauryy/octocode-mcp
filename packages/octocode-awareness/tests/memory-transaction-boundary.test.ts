import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db-init.js';
import { insertMemory, insertMemoryWithSimilarityGate } from '../src/memory-write.js';
import type { InsertMemoryParams } from '../src/types/identity-memory.js';

const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('../src/memory-evidence.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/memory-evidence.js')>(),
  prepareMemoryEvidence: mocks.prepare,
}));
afterEach(() => { mocks.prepare.mockReset(); });

it.each(['direct', 'gate'])('does not join a transaction opened in the final %s evidence continuation', async mode => {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  const params: InsertMemoryParams = { taskContext: 'transaction boundary', observation: 'do not join a foreign transaction',
    importance: 5, workspacePath: process.cwd(), captureFingerprint: true };
  let release!: (value: InsertMemoryParams) => void;
  mocks.prepare.mockReturnValue(new Promise<InsertMemoryParams>(resolve => { release = resolve; }));
  try {
    const pending = mode === 'direct' ? insertMemory(db, params) : insertMemoryWithSimilarityGate(db, params);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    release({ ...params, captureFingerprint: false });
    queueMicrotask(() => db.exec('BEGIN IMMEDIATE'));
    await expect(pending).rejects.toThrow('transaction changed during evidence capture');
    expect(db.isTransaction).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 0 });
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
  }
});
