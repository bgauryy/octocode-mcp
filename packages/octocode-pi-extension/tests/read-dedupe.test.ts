import { describe, expect, it } from 'vitest';
import { registerReadDedupe } from '../src/files/dedupe.js';
import { CLEARED_RESULTS_TYPE, seenFiles } from '../src/files/reads.js';
import { fakeCtx, fakePi } from './fake-pi.js';

const CONTENT = 'line of text\n'.repeat(500);
let counter = 0;

function exchange(tool: string, args: Record<string, unknown>, text: string, extra: Record<string, unknown> = {}) {
  const id = `call${++counter}`;
  return {
    id,
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall', id, name: tool, arguments: args }] },
      { role: 'toolResult', toolCallId: id, toolName: tool, content: [{ type: 'text', text }], isError: false, timestamp: 1, ...extra },
    ],
  };
}

/** The `tool_result` event of a new call, as Pi emits it before the result joins the session. */
const event = (toolName: string, input: Record<string, unknown>, text: string, extra: Record<string, unknown> = {}) => ({
  type: 'tool_result',
  toolName,
  toolCallId: 'new',
  input,
  content: [{ type: 'text', text }],
  isError: false,
  details: undefined,
  ...extra,
});

function setup(earlier: Array<{ messages: unknown[] }>, cleared: string[] = []) {
  const fake = fakePi();
  registerReadDedupe(fake.pi);
  const messages = earlier.flatMap((item) => item.messages);
  const ctx = fakeCtx({ cwd: '/repo' });
  const branch = [{ type: 'custom', id: 'c', customType: CLEARED_RESULTS_TYPE, data: { results: cleared.map((id) => ({ id, saved: `/out/${id}.txt (sha256 ab, 1 bytes)` })) } }];
  Object.assign(ctx, {
    sessionManager: {
      getSessionId: () => 's1',
      getBranch: () => branch,
      buildSessionProjection: () => ({ entries: messages.map((message, index) => ({ sourceEntry: { id: `m${index}` }, messages: [message] })), messages }),
    },
  });
  return { run: (payload: unknown) => fake.fire('tool_result', payload, ctx) as Promise<{ content?: Array<{ text: string }>; details?: any } | undefined> };
}

describe('a repeated read of an unchanged file', () => {
  it('answers with a one-line note naming the file instead of the content again', async () => {
    const first = exchange('read', { path: 'src/a.ts' }, CONTENT);
    const result = await setup([first]).run(event('read', { path: 'src/a.ts' }, CONTENT));
    expect(result?.content).toEqual([{ type: 'text', text: expect.stringMatching(/^\[Unchanged since your earlier read of src\/a\.ts \(same range\)[^\n]*above[^\n]*\]$/) }]);
    expect(result?.details).toMatchObject({ unchangedOf: first.id });
  });

  it('points at the earliest full result again, never at an earlier note', async () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    const second = exchange('read', { path: 'a.ts' }, '[Unchanged since your earlier read of a.ts (same range); it is above.]', { details: { unchangedOf: first.id } });
    const result = await setup([first, second]).run(event('read', { path: 'a.ts' }, CONTENT));
    expect(result?.details).toMatchObject({ unchangedOf: first.id });
  });

  it('keeps the whole content when the range, the arguments or the tool differ', async () => {
    const first = exchange('read', { path: 'a.ts', offset: 1, limit: 50 }, CONTENT);
    const s = setup([first]);
    expect(await s.run(event('read', { path: 'a.ts', offset: 51, limit: 50 }, CONTENT))).toBeUndefined();
    expect(await s.run(event('read', { path: 'a.ts' }, CONTENT))).toBeUndefined();
    expect(await s.run(event('read', { path: 'b.ts', offset: 1, limit: 50 }, CONTENT))).toBeUndefined();
    expect(await s.run(event('grep', { path: 'a.ts', offset: 1, limit: 50 }, CONTENT))).toBeUndefined();
  });

  it('keeps the whole content when the file changed (the new text differs from the earlier one)', async () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    expect(await setup([first]).run(event('read', { path: 'a.ts' }, `${CONTENT}one more line\n`))).toBeUndefined();
  });

  it('keeps the whole content when the earlier result left the context (compaction) or was cleared', async () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    // After a compaction the projection no longer holds the earlier result.
    expect(await setup([]).run(event('read', { path: 'a.ts' }, CONTENT))).toBeUndefined();
    expect(await setup([first], [first.id]).run(event('read', { path: 'a.ts' }, CONTENT))).toBeUndefined();
  });

  it('never replaces an error, an image, or a read whose earlier result was an error', async () => {
    const failed = exchange('read', { path: 'a.ts' }, 'ENOENT', { isError: true });
    const first = exchange('read', { path: 'b.ts' }, CONTENT);
    const s = setup([failed, first]);
    expect(await s.run(event('read', { path: 'a.ts' }, 'ENOENT'))).toBeUndefined();
    expect(await s.run(event('read', { path: 'b.ts' }, CONTENT, { isError: true }))).toBeUndefined();
    expect(await s.run(event('read', { path: 'b.ts' }, CONTENT, { content: [{ type: 'text', text: CONTENT }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] }))).toBeUndefined();
  });

  it('also answers an identical localFetch of the same arguments, and no other tool', async () => {
    const args = { queries: [{ path: 'a.ts', startLine: 1 }] };
    const first = exchange('mcp__octocode__localFetch', args, CONTENT);
    const bash = exchange('bash', { command: 'cat a.ts' }, CONTENT);
    const s = setup([first, bash]);
    const result = await s.run(event('mcp__octocode__localFetch', args, CONTENT));
    expect(result?.content?.[0]?.text).toMatch(/^\[Unchanged since your earlier localFetch of the same arguments[^\n]*above[^\n]*\]$/);
    expect(await s.run(event('bash', { command: 'cat a.ts' }, CONTENT))).toBeUndefined();
  });

  it('does not stay silent about partial content: the stub keeps the read\'s own details, so the guard still sees a whole or a partial read', () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    const stub = exchange('read', { path: 'a.ts' }, '[Unchanged since your earlier read of a.ts (same range); it is above.]', { details: { unchangedOf: first.id } });
    const seen = seenFiles([...first.messages, ...stub.messages].map((message, index) => ({ id: `e${index}`, message })), '/repo');
    expect([...seen.values()]).toMatchObject([{ file: '/repo/a.ts', id: 'e3' }]);
    expect([...seen.values()][0]!.partial).toBeUndefined();
  });

  it('stops counting a stub as a read once the result it points to was cleared', () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    const stub = exchange('read', { path: 'a.ts' }, 'note', { details: { unchangedOf: first.id } });
    const messages = [...first.messages, ...stub.messages].map((message, index) => ({ id: `e${index}`, message }));
    expect(seenFiles(messages, '/repo', new Set([first.id])).size).toBe(0);
    expect(seenFiles(messages, '/repo').size).toBe(1);
  });

  it('stops counting a stub as a read once a compaction cut the result it points to out of the context', () => {
    const first = exchange('read', { path: 'a.ts' }, CONTENT);
    const stub = exchange('read', { path: 'a.ts' }, 'note', { details: { unchangedOf: first.id } });
    // The kept tail starts between the two: only the stub is left, and it shows nothing.
    expect(seenFiles(stub.messages.map((message, index) => ({ id: `e${index}`, message })), '/repo').size).toBe(0);
  });
});
