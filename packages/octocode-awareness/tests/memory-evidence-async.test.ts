import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db-init.js';
import { insertMemory, insertMemoryWithSimilarityGate, insertPreparedMemory } from '../src/memory-write.js';
import { getMemory, queryMemory } from '../src/memory-recall.js';
import { checkMemoryEvidence, createMemoryEvidenceBudget } from '../src/memory-evidence.js';

const mocks = vi.hoisted(() => ({ load: vi.fn(), fingerprint: vi.fn() }));
vi.mock('../src/native-files.js', () => ({ loadNativeFiles: mocks.load }));
const fingerprint = 'awareness-evidence-v1:' + 'a'.repeat(64);

describe('asynchronous memory evidence boundary', () => {
  let db: DatabaseSync;
  let workspace: string;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDb(db);
    workspace = mkdtempSync(join(tmpdir(), 'memory-async-'));
    mocks.load.mockReset().mockResolvedValue({ fingerprintFiles: mocks.fingerprint });
    mocks.fingerprint.mockReset();
  });
  afterEach(() => { db.close(); rmSync(workspace, { recursive: true, force: true }); });
  const params = () => ({ taskContext: 'async evidence', observation: 'bounded content verification', importance: 5,
    workspacePath: workspace, cwd: workspace, references: ['file:source.ts'], captureFingerprint: true });

  it('keeps ordinary writes and unchecked recall free of native loading', async () => {
    await insertMemory(db, { ...params(), captureFingerprint: false, fileTreeFingerprint: fingerprint });
    const result = await getMemory(db, { workspacePath: workspace });
    expect(result.memories[0]?.evidence).toMatchObject({ state: 'unknown', reason: 'unchecked' });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(['direct', 'gate'])('prepares %s evidence without holding a SQLite transaction', async mode => {
    let release!: (value: { fingerprint: string; paths: string[]; files: number; bytes: number }) => void;
    mocks.fingerprint.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = mode === 'direct' ? insertMemory(db, params()) : insertMemoryWithSimilarityGate(db, params());
    await vi.waitFor(() => expect(mocks.fingerprint).toHaveBeenCalled(), { interval: 1 });
    expect(db.isTransaction).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 0 });
    // A separate task runs while native work is pending.
    let yielded = false;
    await new Promise<void>(resolve => setImmediate(() => { yielded = true; resolve(); }));
    expect(yielded).toBe(true);
    release({ fingerprint, paths: [join(workspace, 'source.ts')], files: 1, bytes: 12 });
    await pending;
    expect(db.isTransaction).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 1 });
  });

  it('rejects capture inside an existing transaction and sync primitives cannot discard requested evidence', async () => {
    db.exec('BEGIN IMMEDIATE');
    await expect(insertMemory(db, params())).rejects.toThrow(/before entering a write transaction/);
    await expect(insertMemoryWithSimilarityGate(db, params())).rejects.toThrow(/before entering a write transaction/);
    expect(() => insertPreparedMemory(db, params())).toThrow(/prepared before/);
    expect(() => queryMemory(db, { checkFingerprint: true } as never)).toThrow(/Use getMemory/);
    db.exec('ROLLBACK');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('refuses to join a transaction opened while capture was pending', async () => {
    let release!: (value: { fingerprint: string; paths: string[]; files: number; bytes: number }) => void;
    mocks.fingerprint.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = insertMemory(db, params());
    await vi.waitFor(() => expect(mocks.fingerprint).toHaveBeenCalled(), { interval: 1 });
    db.exec('BEGIN IMMEDIATE');
    release({ fingerprint, paths: [join(workspace, 'source.ts')], files: 1, bytes: 12 });
    await expect(pending).rejects.toThrow(/transaction changed during evidence capture/);
    expect(db.isTransaction).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 0 });
    db.exec('ROLLBACK');
  });

  it('never falls back to weaker evidence when the native loader or capture fails', async () => {
    mocks.load.mockRejectedValueOnce(new Error('native unavailable'));
    await expect(insertMemory(db, params())).rejects.toThrow(/source_inaccessible/);
    mocks.fingerprint.mockResolvedValue({ reason: 'source_changed_during_read', paths: [], files: 1, bytes: 5 });
    await expect(insertMemoryWithSimilarityGate(db, params())).rejects.toThrow(/source_changed_during_read/);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 0 });
  });

  it('subtracts each native result from the shared recall budget and never reuses freshness across checks', async () => {
    const memory = { workspace_path: workspace, references: ['file:source.ts'], file_tree_fingerprint: fingerprint };
    const budget = { ...createMemoryEvidenceBudget(), deadline: performance.now() + 1000 };
    mocks.fingerprint.mockResolvedValueOnce({ fingerprint, paths: [join(workspace, 'source.ts')], files: 1, bytes: 12 })
      .mockResolvedValueOnce({ fingerprint: 'awareness-evidence-v1:' + 'b'.repeat(64), paths: [join(workspace, 'source.ts')], files: 1, bytes: 15 });
    expect((await checkMemoryEvidence(memory, workspace, true, budget)).state).toBe('fresh');
    expect((await checkMemoryEvidence(memory, workspace, true, budget)).state).toBe('stale');
    expect(mocks.fingerprint.mock.calls[0]?.slice(2, 5)).toEqual([1024 * 1024, 8 * 1024 * 1024, 64]);
    expect(mocks.fingerprint.mock.calls[1]?.slice(2, 5)).toEqual([1024 * 1024, 8 * 1024 * 1024 - 12, 63]);
    expect(budget).toMatchObject({ files: 2, bytes: 27 });
  });
});
