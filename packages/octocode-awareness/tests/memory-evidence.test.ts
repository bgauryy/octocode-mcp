import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db-init.js';
import { insertMemory } from '../src/memory-write.js';
import { getMemory } from '../src/memory-recall.js';
import { projectMemoryLean } from '../src/helpers.js';
import { checkMemoryEvidence, createMemoryEvidenceBudget } from '../src/memory-evidence.js';
import { insertMemoryWithSimilarityGate } from '../src/memory-write.js';
import { replaceMemoryReferences } from '../src/db-maintenance.js';

describe('memory evidence reuse', () => {
  let workspace: string;
  let db: DatabaseSync;
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'awareness-evidence-'));
    db = new DatabaseSync(':memory:');
    initDb(db);
    writeFileSync(join(workspace, 'source.ts'), 'export const result = 1;');
    writeFileSync(join(workspace, 'dependency.ts'), 'export const input = 1;');
  });
  afterEach(() => { db.close(); rmSync(workspace, { recursive: true, force: true }); });
  const record = (references?: string[]) => insertMemory(db, {
    agentId: 'reader', taskContext: 'result depends on input', observation: 'Inspect the dependency before changing result.',
    importance: 5, workspacePath: workspace, cwd: workspace,
    references: references ?? [`file:${join(workspace, 'source.ts')}`, `file:${join(workspace, 'dependency.ts')}`],
    captureFingerprint: true,
  });
  const recall = (checkFingerprint = true) => getMemory(db, { workspacePath: workspace, cwd: workspace, checkFingerprint }).memories[0]!;

  it('retains an exact declared dependency fingerprint in the existing row and checks it before reuse', () => {
    const id = record().memoryId;
    expect(db.prepare('SELECT file_tree_fingerprint FROM awareness_memories WHERE memory_id = ?').get(id))
      .toMatchObject({ file_tree_fingerprint: expect.stringMatching(/^awareness-evidence-v1:[a-f0-9]{64}$/) });
    expect(recall().evidence).toMatchObject({ state: 'fresh', reference_count: 2 });
    expect(projectMemoryLean(recall()).evidence).toMatchObject({ state: 'fresh' });
    expect(recall(false).evidence).toMatchObject({ state: 'unknown', reason: 'unchecked' });
    writeFileSync(join(workspace, 'dependency.ts'), 'export const input = 2;');
    expect(recall().evidence).toMatchObject({ state: 'stale', reason: 'content_changed' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM task_runs').get() as { n: number }).n).toBe(0);
  });

  it('detects changed execution mode and missing dependency', () => {
    record();
    chmodSync(join(workspace, 'source.ts'), 0o755);
    expect(recall().evidence?.state).toBe('stale');
    rmSync(join(workspace, 'dependency.ts'));
    expect(recall().evidence).toMatchObject({ state: 'stale', reason: 'source_missing' });
  });

  it('does not equate an old opaque or private Git object identifier with freshness', () => {
    insertMemory(db, { taskContext: 'stored bytes', observation: 'Old bytes are not current verification.', importance: 5,
      workspacePath: workspace, cwd: workspace, references: [`file:${join(workspace, 'source.ts')}`], fileTreeFingerprint: 'git:abcdef' });
    expect(recall().evidence).toMatchObject({ state: 'unknown', reason: 'no_validated_fingerprint' });
  });

  it.each(['https://example.com/source', 'git:abcdef', 'file:/outside/source.ts'])('rejects unsupported or foreign capture %s', reference => {
    expect(() => record([reference])).toThrow(/Cannot capture memory evidence/);
    expect(recall()).toBeUndefined();
  });

  it('explains the supported provenance format before a failed capture can create memory', () => {
    expect(() => record(['signal:peer-message', 'file:source.ts']))
      .toThrow(/capture_fingerprint accepts only workspace-local file:<path>/);
    expect(db.prepare('SELECT COUNT(*) AS count FROM awareness_memories').get()).toMatchObject({ count: 0 });
  });

  it('rejects symlinks, directories and oversized source bytes without storing partial evidence', () => {
    symlinkSync(join(workspace, 'source.ts'), join(workspace, 'link.ts'));
    for (const path of ['link.ts', '.']) expect(() => record([`file:${join(workspace, path)}`])).toThrow();
    writeFileSync(join(workspace, 'large.ts'), Buffer.alloc(1024 * 1024 + 1));
    expect(() => record([`file:${join(workspace, 'large.ts')}`])).toThrow(/source_too_large/);
  });

  it('never blesses a foreign workspace merely because its bytes match', () => {
    record();
    const foreign = mkdtempSync(join(tmpdir(), 'awareness-evidence-foreign-'));
    try {
      const memories = getMemory(db, { allWorkspaces: true, workspacePath: foreign, cwd: foreign, checkFingerprint: true }).memories;
      expect(memories[0]?.evidence).toMatchObject({ state: 'unknown', reason: 'foreign_workspace' });
    } finally { rmSync(foreign, { recursive: true, force: true }); }
  });

  it('shares byte, file and time ceilings and returns unknown when a check cannot finish', () => {
    record();
    const memory = recall(false);
    for (const exhausted of [{ files: 64 }, { bytes: 8 * 1024 * 1024 }, { deadline: 0 }]) {
      expect(checkMemoryEvidence(memory, workspace, true, { ...createMemoryEvidenceBudget(), ...exhausted }).state).toBe('unknown');
    }
    expect(() => record(Array.from({ length: 65 }, () => `file:${join(workspace, 'source.ts')}`))).toThrow(/reference_limit/);
  });

  it('captures through the atomic similarity gate and rejects mixed caller/captured fingerprints', () => {
    const result = insertMemoryWithSimilarityGate(db, {
      agentId: 'reader', taskContext: 'entry point semantics', observation: 'Inspect dependency inputs.', importance: 5,
      workspacePath: workspace, cwd: workspace, references: ['file:source.ts'], captureFingerprint: true,
    });
    expect(result.skipped).toBe(false);
    expect(recall().evidence?.state).toBe('fresh');
    expect(() => insertMemory(db, { taskContext: 'mixed', observation: 'mixed', importance: 5,
      captureFingerprint: true, fileTreeFingerprint: 'manual', workspacePath: workspace })).toThrow(/cannot be combined/);
  });

  it('detects changed reference sets and fails closed when a dependency becomes a symlink', () => {
    const { memoryId } = record();
    replaceMemoryReferences(db, memoryId, [`file:${join(workspace, 'source.ts')}`]);
    expect(recall().evidence?.state).toBe('stale');
    replaceMemoryReferences(db, memoryId, [`file:${join(workspace, 'source.ts')}`, 'https://example.com/dependency']);
    expect(recall().evidence).toMatchObject({ state: 'unknown', reason: 'unsupported_reference' });
    replaceMemoryReferences(db, memoryId, [`file:${join(workspace, 'source.ts')}`, `file:${join(workspace, 'dependency.ts')}`]);
    rmSync(join(workspace, 'dependency.ts'));
    symlinkSync(join(workspace, 'source.ts'), join(workspace, 'dependency.ts'));
    expect(recall().evidence).toMatchObject({ state: 'unknown', reason: 'symlink_source' });
  });
});
