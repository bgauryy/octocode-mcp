import { expect, test } from 'vitest';
import { __test__, registerCompactionHooks } from '../src/tools/compaction-hooks.js';
import type { PiInstance } from '../src/types.js';
import { readSessionUserRequestContext, renderUserRequestContext, USER_REQUEST_CONTEXT_MAX_CHARS } from '../src/tools/user-request-context.js';

test('request recovery retains the original goal and recent amendments without reviving completed work', () => {
  const messages = [
    { role: 'user', content: 'Original goal: fix context and dynamic capabilities.' },
    ...Array.from({ length: 20 }, (_, index) => ({ role: 'user', content: `Historical amendment ${index}. ${'x'.repeat(10000)}` })),
    { role: 'user', content: 'Cancel the MCP edits; finish skills only.' },
  ];
  const text = renderUserRequestContext(messages);
  expect(text).toContain('Original goal: fix context and dynamic capabilities.');
  expect(text).toContain('Cancel the MCP edits; finish skills only.');
  expect(text).toContain('Keep completed work complete');
  expect(text.length).toBeLessThanOrEqual(USER_REQUEST_CONTEXT_MAX_CHARS);
  expect(readSessionUserRequestContext({ sessionManager: { getBranch: () => messages.map(message => ({ message })), getEntries: () => [{ message: { role: 'user', content: 'SIBLING BRANCH' } }] } } as never)).not.toContain('SIBLING BRANCH');
});

test('combined oversized compaction sections preserve the split-turn marker and pending gate', () => {
  const result = __test__.buildDeterministicCompaction({
    firstKeptEntryId: 'kept', tokensBefore: 200000,
    messagesToSummarize: Array.from({ length: 10 }, () => ({ role: 'user', content: 'u'.repeat(10000) })),
    turnPrefixMessages: [{ role: 'assistant', content: 't'.repeat(20000) }],
    previousSummary: 's'.repeat(20000),
    fileOps: { read: Array.from({ length: 100 }, () => 'path'.repeat(200)), written: ['changed'.repeat(20000)] },
  }, 'overflow', 'f'.repeat(50000), 'plan'.repeat(20000), Array.from({ length: 20 }, () => ({ kind: 'authorization', question: 'Pending permission '.repeat(1000) })));
  expect(result?.summary).toContain('**Turn Context (split turn):**');
  expect(result?.summary).toContain('awaiting the user; not granted');
  expect(result?.summary).toContain('## Resume instructions');
});

test('audit: emergency compaction keeps an early unfinished objective without a plan', () => {
  const result = __test__.buildDeterministicCompaction({
    firstKeptEntryId: 'kept', tokensBefore: 200000,
    messagesToSummarize: [
      { role: 'user', content: 'UNFINISHED_OBJECTIVE_73: audit both tool routing and worker recovery; acceptance requires both.' },
      ...Array.from({ length: 8 }, (_, index) => ({ role: 'toolResult', content: `intermediate result ${index}` })),
    ], turnPrefixMessages: [{ role: 'assistant', content: 'Checking the next tool result.' }],
  }, 'overflow', undefined);
  expect(result?.summary.includes('UNFINISHED_OBJECTIVE_73')).toBe(true);
});

test('audit: long compaction focus cannot erase pending authorization or resume policy', () => {
  const result = __test__.buildDeterministicCompaction({
    firstKeptEntryId: 'kept', tokensBefore: 200000,
    messagesToSummarize: [], turnPrefixMessages: [{ role: 'user', content: 'continue the audit' }],
  }, 'overflow', 'F'.repeat(13000), undefined, [{ kind: 'authorization', question: 'PENDING_AUTHORIZATION_73: may this be published?' }]);
  expect({
    pendingAuthorization: result?.summary.includes('PENDING_AUTHORIZATION_73'),
    resumeInstructions: result?.summary.includes('## Resume instructions'),
    splitTurnMarker: result?.summary.includes('**Turn Context (split turn):**'),
  }).toEqual({ pendingAuthorization: true, resumeInstructions: true, splitTurnMarker: true });
});

test('audit: failed compaction preserves a newer active-tool selection', async () => {
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  let activeTools = ['MCPTool', 'file', 'bash'];
  registerCompactionHooks({
    on(event: string, handler: (...args: any[]) => any) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
    getActiveTools: () => [...activeTools],
    setActiveTools: (next: string[]) => { activeTools = [...next]; },
  } as unknown as PiInstance, () => {});
  for (const handler of handlers.get('session_before_compact') ?? []) await handler({ reason: 'manual' }, {});
  activeTools = ['MCPTool'];
  for (const handler of handlers.get('session_compact_failed') ?? []) await handler({}, {});
  expect(activeTools).toEqual(['MCPTool']);
});
