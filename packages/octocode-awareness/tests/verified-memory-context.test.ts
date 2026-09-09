import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';
import { decodeMemoryContent, renderMemoryContent } from '../src/memory-content.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe('selected file reasoning', () => {
  it('preserves reasons without collapsing evidence about different files or artifacts', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'awareness-reasons-'));
    roots.push(workspace);
    const context = { workspace, database: join(workspace, 'ledger.sqlite3'), compact: true };
    const params = { label: 'DECISION', text: 'Keep the current config on validation failure.',
      source_digest: 'config-spec-v1', file: ['src/config.ts'], area: 'configuration',
      why: 'Subscribers require a valid config.', constraint: 'Validate before swapping.',
      scope: 'artifact', artifact: 'config-loader' };
    const store = async (changes = {}) => {
      const result = await executeAwarenessCommand({ command: 'memory store-verified', params: { ...params, ...changes } }, context);
      expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
      return result.payload as { memoryId: string; verifiedAt: string };
    };
    const first = await store();
    expect(await store()).toEqual(first);
    expect((await store({ file: ['src/other.ts'] })).memoryId).not.toBe(first.memoryId);
    expect((await store({ artifact: 'another-loader' })).memoryId).not.toBe(first.memoryId);
    const recalled = await executeAwarenessCommand({ command: 'memory recall-verified', params: {
      file: ['src/config.ts'], area: 'configuration', scope: 'artifact', artifact: 'config-loader',
    } }, context);
    expect(recalled.exitCode).toBe(0);
    expect(recalled.payload).toMatchObject({ partial: false, memories: [{ memoryId: first.memoryId,
      text: params.text, why: params.why, constraint: params.constraint, file: params.file }] });
    expect((recalled.payload as { memories: unknown[] }).memories).toHaveLength(1);
  });

  it('treats malformed envelopes as ordinary text and renders selected reasons readably', () => {
    const malformed = '{"$awareness":"awareness-file-context/v1","text":3}';
    expect(decodeMemoryContent(malformed)).toEqual({ text: malformed });
    const incomplete = '{"$awareness":"awareness-file-context/v1"';
    expect(renderMemoryContent(incomplete)).toBe(incomplete);
    expect(renderMemoryContent('{"$awareness":"awareness-file-context/v1","text":"Keep config","why":"Avoid invalid state"}'))
      .toBe('Keep config\nWhy: Avoid invalid state');
  });
});
