import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';
import { getAwarenessCommandDescriptor } from '../src/schema/cli.js';
import { MEMORY_LABELS } from '../src/schema/common.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe('exact verified memory pointers', () => {
  it('recalls evidence only within its validity interval across retrieval modes', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-validity-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true };
    const stored = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'TEST', text: 'Future policy', source_digest: 'policy-v2',
      verified_at: '2026-10-01T00:00:00Z', valid_until: '2026-11-01T00:00:00Z',
    } }, context);
    expect(stored.exitCode).toBe(0);
    const memoryId = (stored.payload as { memoryId: string }).memoryId;
    for (const filter of [{ memory_id: memoryId }, ...['lexical', 'semantic', 'hybrid'].map(mode => ({ query: 'Future policy', mode }))]) {
      for (const [now, count] of [
        ['2026-09-30T23:59:59Z', 0], ['2026-10-01T00:00:00Z', 1],
        ['2026-10-01T00:00:00.000Z', 1], ['2026-10-01T03:00:00+03:00', 1],
        ['2026-11-01T00:00:00Z', 0],
      ] as const) {
        const result = await executeAwarenessCommand({ command: 'memory recall-verified', params: { ...filter, now } }, context);
        expect(result.exitCode).toBe(0);
        expect((result.payload as { memories: unknown[] }).memories).toHaveLength(count);
      }
    }
  });
  it('advertises the actual label enum and rejects unsupported labels at the API boundary', async () => {
    for (const command of ['memory store-verified', 'memory recall-verified', 'memory prune']) {
      expect(getAwarenessCommandDescriptor(command)?.inputSchema.properties).toMatchObject({ label: { enum: [...MEMORY_LABELS] } });
    }
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-label-'));
    roots.push(workspace);
    const result = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'Awareness RFC history verification', text: 'Observed bytes', source_digest: 'sha256:source',
    } }, { workspace, database: join(workspace, 'ledger.sqlite3') });
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.payload)).toContain('Invalid parameters for memory store-verified');
  });
  it('retrieves only the exact record and preserves source, scope and expiry filters', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-pointer-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), agentId: 'reader', compact: true };
    const common = { label: 'TEST', source_digest: 'sha256:source', scope: 'artifact', artifact: 'fixture-artifact', verified_at: '2026-09-01T00:00:00Z', valid_until: '2026-10-01T00:00:00Z' };
    const first = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, text: 'Gamma verified source bytes and the original history.' } }, context);
    const id = (first.payload as { memoryId: string }).memoryId;
    expect(id).toBeTypeOf('string');
    await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, text: 'A different record with the same source.' } }, context);
    const params = { memory_id: id, source_digest: common.source_digest, scope: 'artifact', artifact: common.artifact, now: '2026-09-09T00:00:00Z' };
    const result = await executeAwarenessCommand({ command: 'memory recall-verified', params }, context);
    expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
    expect(result.payload).toMatchObject({ memories: [{ memoryId: id, sourceDigest: common.source_digest }] });
    expect((result.payload as { memories: unknown[] }).memories).toHaveLength(1);
    for (const change of [{ memory_id: 'missing' }, { source_digest: 'sha256:wrong' }, { scope: 'project' }, { now: '2026-10-02T00:00:00Z' }]) {
      const missing = await executeAwarenessCommand({ command: 'memory recall-verified', params: { ...params, ...change } }, context);
      expect(missing.exitCode).toBe(0);
      expect(missing.payload).toMatchObject({ memories: [] });
    }
    const other = mkdtempSync(join(tmpdir(), 'awareness-memory-other-'));
    roots.push(other);
    const foreign = await executeAwarenessCommand({ command: 'memory recall-verified', params }, { ...context, workspace: other });
    expect(foreign.payload).toMatchObject({ memories: [] });
  });

  it('rejects combining an exact pointer with a guessed search phrase', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-pointer-'));
    roots.push(workspace);
    const result = await executeAwarenessCommand({ command: 'memory recall-verified', params: { memory_id: 'memory', query: 'guessed phrase' } },
      { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true });
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.payload)).toContain('memory_id cannot be combined with query');
  });

  it('deduplicates exact replays, keeps timestamp variants, and distinguishes file evidence', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-dedup-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true };
    const common = { label: 'TEST', text: 'Stable evidence decision', source_digest: 'sha256:stable', verified_at: '2026-09-01T00:00:00Z', valid_until: '2026-12-01T00:00:00Z' };
    const first = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, file: 'src/first.ts' } }, context);
    const replay = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, file: 'src/first.ts' } }, context);
    const later = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, verified_at: '2026-09-02T00:00:00Z', file: 'src/first.ts' } }, context);
    const otherFile = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...common, file: 'src/second.ts' } }, context);
    const firstId = (first.payload as { memoryId: string }).memoryId;
    expect((replay.payload as { memoryId: string }).memoryId).toBe(firstId);
    expect((later.payload as { memoryId: string }).memoryId).not.toBe(firstId);
    expect((otherFile.payload as { memoryId: string }).memoryId).not.toBe(firstId);
  });

  it('returns an executable deterministic lexical continuation with a frozen validity instant', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-pages-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true };
    for (const [index, source] of ['one', 'two', 'three'].entries()) {
      const stored = await executeAwarenessCommand({ command: 'memory store-verified', params: {
        label: 'TEST', text: `Paged evidence ${source}`, source_digest: `sha256:paged-${source}`,
        verified_at: `2026-09-0${index + 1}T00:00:00Z`, valid_until: '2026-12-01T00:00:00Z',
      } }, context);
      expect(stored.exitCode).toBe(0);
    }
    const page = await executeAwarenessCommand({ command: 'memory recall-verified', params: {
      query: 'Paged evidence', limit: 1, now: '2026-09-30T00:00:00Z',
    } }, context);
    const payload = page.payload as { memories: Array<{ memoryId: string }>; partial: boolean; next?: { call: { command: string; params: Record<string, unknown> } } };
    expect(payload.memories).toHaveLength(1);
    expect(payload.partial).toBe(true);
    expect(payload.next?.call.command).toBe('memory recall-verified');
    expect(payload.next?.call.params.now).toBe('2026-09-30T00:00:00Z');
    const next = await executeAwarenessCommand(payload.next!.call as { command: 'memory recall-verified'; params: Record<string, unknown> }, context);
    expect((next.payload as { memories: Array<{ memoryId: string }> }).memories).toHaveLength(1);
    expect((next.payload as { memories: Array<{ memoryId: string }> }).memories[0]?.memoryId).not.toBe(payload.memories[0]?.memoryId);
  });

  it('requires an existing history operation and makes supersession visible atomically', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-memory-history-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true };
    const missingHistory = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'TEST', text: 'History backed decision', source_digest: 'sha256:history', history_ref: 'history:missing',
    } }, context);
    expect(missingHistory.exitCode).toBe(1);
    expect(JSON.stringify(missingHistory.payload)).toContain('existing history operation');
    const old = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'DECISION', text: 'Old decision', source_digest: 'sha256:old', verified_at: '2026-09-01T00:00:00Z', valid_until: '2026-12-01T00:00:00Z',
    } }, context);
    const oldId = (old.payload as { memoryId: string }).memoryId;
    const replacement = await executeAwarenessCommand({ command: 'memory store-verified', params: {
      label: 'DECISION', text: 'Replacement decision', source_digest: 'sha256:new', verified_at: '2026-09-02T00:00:00Z', valid_until: '2026-12-01T00:00:00Z', supersedes: [oldId],
    } }, context);
    expect(replacement.exitCode).toBe(0);
    const recalled = await executeAwarenessCommand({ command: 'memory recall-verified', params: { now: '2026-09-03T00:00:00Z' } }, context);
    expect((recalled.payload as { memories: Array<{ sourceDigest: string }> }).memories.map(item => item.sourceDigest)).toEqual(['sha256:new']);
  });
});
