import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe('exact verified memory pointers', () => {
  it('retrieves only the exact record and preserves source, scope and expiry filters', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-pointer-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), agentId: 'reader', compact: true };
    const common = { label: 'TEST', source_digest: 'sha256:source', scope: 'artifact', verified_at: '2026-09-01T00:00:00Z', valid_until: '2026-10-01T00:00:00Z' };
    const first = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, text: 'Gamma verified source bytes and the original history.' } }, context);
    const id = (first.payload as { memoryId: string }).memoryId;
    expect(id).toBeTypeOf('string');
    await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, text: 'A different record with the same source.' } }, context);
    const params = { memory_id: id, source_digest: common.source_digest, scope: 'artifact', now: '2026-09-09T00:00:00Z' };
    const result = await executeAwarenessCommand({ command: 'memory recall-verified', params }, context);
    expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
    expect(result.payload).toMatchObject([{ memoryId: id, sourceDigest: common.source_digest }]);
    expect(result.payload).toHaveLength(1);
    for (const change of [{ memory_id: 'missing' }, { source_digest: 'sha256:wrong' }, { scope: 'project' }, { now: '2026-10-02T00:00:00Z' }]) {
      const missing = await executeAwarenessCommand({ command: 'memory recall-verified', params: { ...params, ...change } }, context);
      expect(missing.exitCode).toBe(0);
      expect(missing.payload).toEqual([]);
    }
    const other = mkdtempSync(join(tmpdir(), 'awareness-memory-other-'));
    roots.push(other);
    const foreign = await executeAwarenessCommand({ command: 'memory recall-verified', params }, { ...context, workspace: other });
    expect(foreign.payload).toEqual([]);
  });

  it('rejects combining an exact pointer with a guessed search phrase', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-pointer-'));
    roots.push(workspace);
    const result = await executeAwarenessCommand({ command: 'memory recall-verified', params: { memory_id: 'memory', query: 'guessed phrase' } },
      { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true });
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.payload)).toContain('memory_id cannot be combined with query');
  });
});
