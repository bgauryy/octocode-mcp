import { describe, expect, it } from 'vitest';
import { COMPACTION_NOTE_TYPE } from '../src/compaction/record.js';
import { addFileToolOps, registerCompaction } from '../src/compaction/register.js';

const call = (id: string, name: string, queries: unknown[]) => ({ role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: { queries } }] });
const result = (toolCallId: string, isError: boolean, details?: unknown) => ({ role: 'toolResult', toolCallId, toolName: 'file', isError, content: [], ...(details ? { details } : {}) });
const prepare = (messagesToSummarize: unknown[], turnPrefixMessages: unknown[] = [], edited: string[] = []) =>
  ({ fileOps: { read: new Set(['a.ts']), written: new Set<string>(), edited: new Set(edited) }, messagesToSummarize, turnPrefixMessages }) as never as Parameters<typeof addFileToolOps>[0];

describe('compaction', () => {
  it('adds the paths the file tool changed to Pi file ops (not MCP tool shapes)', () => {
    const preparation = prepare(
      [
        call('1', 'file', [{ type: 'edit', path: 'c.ts' }, { type: 'delete', path: 'a.ts' }]),
        result('1', false, { outcomes: [{ ok: true }, { ok: true }] }),
        { role: 'assistant', content: [{ type: 'toolCall', id: '2', name: 'mcp__octocode__localFetch', arguments: { queries: [{ path: 'd.ts' }] } }] },
        result('2', false, { outcomes: [{ ok: true }] }),
      ],
      [call('3', 'file', [{ type: 'write', path: 'e.ts' }]), result('3', false, { outcomes: [{ ok: true }] })],
      ['b.ts'],
    );
    addFileToolOps(preparation);
    expect([...preparation.fileOps.edited].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'e.ts']);
    expect([...preparation.fileOps.read]).toEqual(['a.ts']);
  });

  it('skips a failed query, a failed call and a call with no result', () => {
    const preparation = prepare([
      call('1', 'file', [{ type: 'edit', path: 'ok.ts' }, { type: 'edit', path: 'rejected.ts' }]),
      result('1', false, { outcomes: [{ ok: true }, { ok: false }] }),
      call('2', 'file', [{ type: 'edit', path: 'failed-call.ts' }]),
      result('2', true),
      call('3', 'file', [{ type: 'edit', path: 'unanswered.ts' }]),
      call('4', 'file', [{ type: 'edit', path: 'no-outcomes.ts' }]),
      result('4', false),
    ]);
    addFileToolOps(preparation);
    expect([...preparation.fileOps.edited]).toEqual(['ok.ts']);
  });

  it('pairs a result with its own call when several run in one turn', () => {
    const preparation = prepare([
      call('a', 'file', [{ type: 'edit', path: 'one.ts' }]),
      call('b', 'file', [{ type: 'edit', path: 'two.ts' }]),
      result('b', false, { outcomes: [{ ok: true }] }),
      result('a', true),
    ]);
    addFileToolOps(preparation);
    expect([...preparation.fileOps.edited]).toEqual(['two.ts']);
  });
});

describe('summaries', () => {
  it('leaves /tree summaries to Pi, adds file-tool paths, and lets Pi summarize when there is no model', async () => {
    const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
    const notes: unknown[] = [];
    registerCompaction({ on: (name: string, handler: never) => void handlers.set(name, handler), appendEntry: (customType: string, data: unknown) => notes.push({ customType, data }) } as never, { restore: () => undefined } as never);
    expect(handlers.has('session_before_tree')).toBe(false);
    const preparation = {
      fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
      messagesToSummarize: [{ role: 'assistant', content: [{ type: 'toolCall', id: 't', name: 'file', arguments: { queries: [{ type: 'write', path: 'todo.txt' }] } }] }, { role: 'toolResult', toolCallId: 't', toolName: 'file', isError: false, content: [], details: { outcomes: [{ ok: true }] } }],
      turnPrefixMessages: [], settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    };
    expect(await handlers.get('session_before_compact')!({ type: 'session_before_compact', preparation, branchEntries: [], signal: new AbortController().signal }, { model: undefined })).toBeUndefined();
    expect([...preparation.fileOps.edited]).toEqual(['todo.txt']);
    expect(notes).toEqual([{ customType: COMPACTION_NOTE_TYPE, data: { kind: 'default-summary', reason: 'no model is selected for the summary' } }]);
  });
});
