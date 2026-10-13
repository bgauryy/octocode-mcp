import { describe, expect, it } from 'vitest';
import { addFileToolOps, registerCompaction } from '../src/compaction/register.js';

describe('compaction', () => {
  it('adds the paths the file tool changed to Pi file ops (not MCP tool shapes)', () => {
    const preparation = {
      fileOps: { read: new Set(['a.ts']), written: new Set<string>(), edited: new Set(['b.ts']) },
      messagesToSummarize: [
        { role: 'assistant', content: [{ type: 'toolCall', name: 'file', arguments: { queries: [{ type: 'edit', path: 'c.ts' }, { type: 'delete', path: 'a.ts' }] } }] },
        { role: 'assistant', content: [{ type: 'toolCall', name: 'mcp__octocode__localFetch', arguments: { queries: [{ path: 'd.ts' }] } }] },
      ],
      turnPrefixMessages: [{ role: 'assistant', content: [{ type: 'toolCall', name: 'file', arguments: { queries: [{ type: 'write', path: 'e.ts' }] } }] }],
    } as never as Parameters<typeof addFileToolOps>[0];
    addFileToolOps(preparation);
    expect([...preparation.fileOps.edited].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'e.ts']);
    expect([...preparation.fileOps.read]).toEqual(['a.ts']);
  });
});

describe('summaries', () => {
  it('leaves /tree summaries to Pi, adds file-tool paths, and lets Pi summarize when there is no model', async () => {
    const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
    registerCompaction({ on: (name: string, handler: never) => void handlers.set(name, handler) } as never, { restore: () => undefined } as never);
    expect(handlers.has('session_before_tree')).toBe(false);
    const preparation = {
      fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
      messagesToSummarize: [{ role: 'assistant', content: [{ type: 'toolCall', name: 'file', arguments: { queries: [{ type: 'write', path: 'todo.txt' }] } }] }],
      turnPrefixMessages: [], settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    };
    expect(await handlers.get('session_before_compact')!({ type: 'session_before_compact', preparation, branchEntries: [], signal: new AbortController().signal }, { model: undefined })).toBeUndefined();
    expect([...preparation.fileOps.edited]).toEqual(['todo.txt']);
  });
});
