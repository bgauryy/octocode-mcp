import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openAwarenessStore } from '../../src/coordination/open.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const receipt = {
  version: 1 as const, receiptId: 'cap-stable', action: 'edit', resource: 'workspace',
  actor: { kind: 'system' as const, id: 'harness' },
  provenance: { source: 'harness' as const, trust: 'authority' as const },
  guards: [{ name: 'plan', decision: 'block' as const }], effectiveDecision: 'block' as const,
  createdAt: '2026-09-06T00:00:00Z',
};

describe('continuity entity identity', () => {
  it('rejects a conflicting receipt ID instead of returning unpersisted data', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'capability-identity-'));
    dirs.push(workspace);
    const store = openAwarenessStore({ workspace, dbPath: join(workspace, 'awareness.sqlite3') });
    try {
      expect(store.recordCapabilityReceipt(receipt)).toEqual(receipt);
      expect(() => store.recordCapabilityReceipt({ ...receipt, action: 'delete' })).toThrow(/receipt ID conflict/);
      expect(store.recordCapabilityReceipt({ ...receipt, actor: { id: 'harness', kind: 'system' } })).toEqual(receipt);
    } finally { store.close(); }
  });

  it('rejects receipt ID reuse in a different workspace sharing the same database', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'capability-scope-'));
    dirs.push(workspace);
    const dbPath = join(workspace, 'awareness.sqlite3');
    const first = openAwarenessStore({ workspace, dbPath });
    const second = openAwarenessStore({ workspace: join(workspace, 'other'), dbPath });
    try {
      first.recordCapabilityReceipt(receipt);
      expect(() => second.recordCapabilityReceipt(receipt)).toThrow(/receipt ID conflict/);
    } finally { first.close(); second.close(); }
  });
});
