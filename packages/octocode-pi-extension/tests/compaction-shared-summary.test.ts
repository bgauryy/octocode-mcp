import { describe, expect, it } from 'vitest';
import { SHARED_SUMMARY_PROMPT, sharedSummary } from '../src/compaction/shared-summary.js';
import { writeSummary } from '../src/compaction/summary.js';
import { CLEARED_RESULTS_TYPE } from '../src/files/reads.js';
import { CHARS_PER_TOKEN } from '../src/shared/tokens.js';

const model = { provider: 'p', id: 'm', api: 'anthropic-messages', maxTokens: 10_000, contextWindow: 200_000, reasoning: true };
const at = 1_700_000_000_000;
const system = { role: 'system', content: 'You are the agent.', toolsAdded: [{ name: 'read' }], timestamp: at };
const ask = { role: 'user', content: [{ type: 'text', text: 'fix the parser in src/a.ts' }], timestamp: at };
const call = { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: { path: 'src/a.ts' } }], timestamp: at };
const result = { role: 'toolResult', toolCallId: 'c1', toolName: 'read', content: [{ type: 'text', text: 'file body'.repeat(50) }], isError: false, timestamp: at };
const answer = { role: 'assistant', content: [{ type: 'text', text: 'Done, the parser is fixed.' }], timestamp: at };
const entry = (id: string, ...messages: unknown[]) => ({ sourceEntry: { id, type: 'message' }, messages });
const entries = [entry('e0', system), entry('e1', ask), entry('e2', call), entry('e3', result), entry('e4', answer)];
const usage = { input: 100, output: 50, cacheRead: 9_000, cacheWrite: 10, totalTokens: 9_160 };
const reply = (content: unknown[], stopReason = 'stop') => ({ role: 'assistant', content, stopReason, usage, timestamp: at });
const text = (value: string) => ({ type: 'text', text: value });

interface Setup {
  reply?: (call: number) => unknown;
  thinking?: string;
  settings?: Record<string, unknown>;
  branch?: unknown[];
  projection?: () => unknown;
  firstKeptEntryId?: string;
  previousSummary?: string;
  customInstructions?: string;
  signal?: { aborted: boolean };
}

function setup(options: Setup = {}) {
  const calls: Array<{ model: unknown; context: any; options: any }> = [];
  const notices: string[] = [];
  const pi = { getThinkingLevel: () => options.thinking ?? 'high', getActiveTools: () => [], getSettings: () => options.settings ?? { thinkingBudgets: { high: 4_000 }, transport: 'sse' } } as never;
  const ctx = {
    model,
    modelRegistry: {
      streamSimple: (requested: unknown, context: unknown, requestOptions: unknown) => {
        calls.push({ model: requested, context, options: requestOptions });
        return { result: async () => (options.reply ?? (() => reply([text('## Goal\nfix the parser')])))(calls.length) };
      },
    },
    sessionManager: {
      getSessionId: () => 'sid-1',
      getSessionFile: () => undefined,
      getBranch: () => options.branch ?? [],
      buildSessionProjection: options.projection ?? (() => ({ entries, messages: entries.flatMap((item) => item.messages) })),
    },
    hasUI: true,
    ui: { notify: (message: string) => notices.push(message) },
  } as never;
  const event = {
    preparation: {
      firstKeptEntryId: options.firstKeptEntryId ?? 'e3',
      tokensBefore: 12_345,
      messagesToSummarize: [ask, call],
      turnPrefixMessages: [],
      previousSummary: options.previousSummary,
      isSplitTurn: false,
      fileOps: { read: new Set(['src/a.ts', 'src/b.ts']), written: new Set(['src/new.ts']), edited: new Set(['src/b.ts']) },
      settings: { reserveTokens: 10_000 },
    },
    branchEntries: [],
    customInstructions: options.customInstructions,
    signal: options.signal ?? { aborted: false },
  } as never;
  return { calls, notices, pi, ctx, event };
}

const finalPrompt = (call: { context: any }): string => call.context.messages.at(-1).content.map((part: { text: string }) => part.text).join('');

describe('cache-sharing compaction summary', () => {
  it('sends the session request plus one final user message, with the session own model, thinking level and routing id', async () => {
    const { calls, pi, ctx, event } = setup();
    const out = await sharedSummary(pi, event, ctx, model as never, 'Focus on parsing.');
    expect(out).toBeDefined();
    expect(calls).toHaveLength(1);
    const [{ context, options, model: requested }] = calls;
    expect(requested).toBe(model);
    // The conversation as Pi sends it (system message included, same order) then exactly one new user message.
    expect(context.messages.slice(0, -1)).toEqual(entries.flatMap((item) => item.messages));
    expect(context.messages.at(-1).role).toBe('user');
    expect(finalPrompt(calls[0]!)).toContain('Focus on parsing.');
    expect(options).toMatchObject({ reasoning: 'high', sessionId: 'sid-1', thinkingBudgets: { high: 4_000 }, transport: 'sse', maxTokens: 8_000 });
    expect(options.signal).toBeDefined();
    // No cache write opt-out (that would drop the read too), no tool choice, no tools replaced.
    expect(options).not.toHaveProperty('cacheRetention');
    expect(options).not.toHaveProperty('toolChoice');
    expect(context).not.toHaveProperty('tools');
    expect(context).not.toHaveProperty('systemPrompt');
  });

  it('leaves reasoning off when the session thinking level is off', async () => {
    const { calls, pi, ctx, event } = setup({ thinking: 'off' });
    await sharedSummary(pi, event, ctx, model as never, 'x');
    expect(calls[0]!.options.reasoning).toBeUndefined();
  });

  it('shows the results cleared on the branch as the placeholders the real requests carry', async () => {
    const branch = [{ type: 'custom', customType: CLEARED_RESULTS_TYPE, data: { results: [{ id: 'c1', saved: '/tmp/saved.txt' }] } }];
    const { calls, pi, ctx, event } = setup({ branch });
    await sharedSummary(pi, event, ctx, model as never, 'x');
    const sent = calls[0]!.context.messages.find((message: { role: string }) => message.role === 'toolResult');
    expect(sent.content[0].text).toMatch(/^\[Old tool result cleared .*\/tmp\/saved\.txt/);
  });

  it('returns Pi-shaped compaction: summary with file lists, details, usage, cut point and size before', async () => {
    const { pi, ctx, event } = setup();
    const out = await sharedSummary(pi, event, ctx, model as never, 'x');
    expect(out).toEqual({
      summary: '## Goal\nfix the parser\n\n<read-files>\nsrc/a.ts\n</read-files>\n\n<modified-files>\nsrc/b.ts\nsrc/new.ts\n</modified-files>',
      firstKeptEntryId: 'e3',
      tokensBefore: 12_345,
      usage,
      details: { readFiles: ['src/a.ts'], modifiedFiles: ['src/b.ts', 'src/new.ts'] },
    });
  });

  it('omits file blocks when no file was touched', async () => {
    const { pi, ctx, event } = setup();
    const fileOps = (event as any).preparation.fileOps;
    fileOps.read.clear();
    fileOps.written.clear();
    fileOps.edited.clear();
    const out = await sharedSummary(pi, event, ctx, model as never, 'x');
    expect(out?.summary).toBe('## Goal\nfix the parser');
    expect(out?.details).toEqual({ readFiles: [], modifiedFiles: [] });
  });

  it('names where the kept messages begin so the model summarizes what comes before', async () => {
    const { calls, pi, ctx, event } = setup({ firstKeptEntryId: 'e3' });
    await sharedSummary(pi, event, ctx, model as never, 'x');
    expect(finalPrompt(calls[0]!)).toMatch(/result of the read tool call/);
    const other = setup({ firstKeptEntryId: 'e1' });
    await sharedSummary(other.pi, other.event, other.ctx, model as never, 'x');
    expect(finalPrompt(other.calls[0]!)).toContain('user message beginning "fix the parser in src/a.ts"');
    const call2 = setup({ firstKeptEntryId: 'e2' });
    await sharedSummary(call2.pi, call2.event, call2.ctx, model as never, 'x');
    expect(finalPrompt(call2.calls[0]!)).toContain('assistant message that calls the read tool with {\"path\":\"src/a.ts\"}');
    const unknown = setup({ firstKeptEntryId: 'missing' });
    await sharedSummary(unknown.pi, unknown.event, unknown.ctx, model as never, 'x');
    expect(finalPrompt(unknown.calls[0]!)).not.toMatch(/stay in the conversation/);
  });

  it('tells the model to carry a previous summary forward without copying the sections code appends', async () => {
    const first = setup();
    await sharedSummary(first.pi, first.event, first.ctx, model as never, 'x');
    expect(finalPrompt(first.calls[0]!)).not.toMatch(/earlier summary/);
    const next = setup({ previousSummary: '## Goal\nold' });
    await sharedSummary(next.pi, next.event, next.ctx, model as never, 'x');
    const prompt = finalPrompt(next.calls[0]!);
    expect(prompt).toMatch(/earlier summary/);
    expect(prompt).toContain('## User Messages');
    expect(prompt).toContain('## Recovery');
    expect(prompt).toContain('<read-files>');
  });

  it('keeps the structured sections of Pi and denies tool calls in words', () => {
    for (const section of ['## Goal', '## Constraints & Preferences', '### Done', '### In Progress', '### Blocked', '## Key Decisions', '## Next Steps', '## Critical Context']) expect(SHARED_SUMMARY_PROMPT).toContain(section);
    expect(SHARED_SUMMARY_PROMPT).toMatch(/text only/i);
    expect(SHARED_SUMMARY_PROMPT).toMatch(/not part of the conversation/);
  });

  it.each([
    ['an error', () => reply([], 'error')],
    ['a length stop', () => reply([text('## Goal\ncut')], 'length')],
    ['an aborted stop', () => reply([], 'aborted')],
    ['empty text', () => reply([text('  ')])],
    ['only thinking', () => reply([{ type: 'thinking', thinking: 'hmm' }])],
    ['a tool call', () => reply([{ type: 'toolCall', id: 'x', name: 'read', arguments: {} }], 'toolUse')],
    ['text and a tool call', () => reply([text('## Goal\nx'), { type: 'toolCall', id: 'x', name: 'read', arguments: {} }], 'toolUse')],
    ['a summary over the cap', () => reply([text('x'.repeat(8_000 * CHARS_PER_TOKEN + 100))])],
  ])('gives up on %s', async (_name, build) => {
    const { pi, ctx, event } = setup({ reply: build });
    expect(await sharedSummary(pi, event, ctx, model as never, 'x')).toBeUndefined();
  });

  it('gives up when the call or the projection throws, or images are blocked', async () => {
    const throwing = setup({ reply: () => { throw new Error('down'); } });
    expect(await sharedSummary(throwing.pi, throwing.event, throwing.ctx, model as never, 'x')).toBeUndefined();
    const broken = setup({ projection: () => { throw new Error('no projection'); } });
    expect(await sharedSummary(broken.pi, broken.event, broken.ctx, model as never, 'x')).toBeUndefined();
    const blocked = setup({ settings: { images: { blockImages: true } } });
    expect(await sharedSummary(blocked.pi, blocked.event, blocked.ctx, model as never, 'x')).toBeUndefined();
    expect(blocked.calls).toHaveLength(0);
  });

  it('keeps the summary within the model cap when the model has none', async () => {
    const { calls, pi, ctx, event } = setup();
    await sharedSummary(pi, event, ctx, { ...model, maxTokens: 0 } as never, 'x');
    expect(calls[0]!.options.maxTokens).toBe(8_000);
  });
});

describe('writeSummary with the shared path', () => {
  it('uses the shared request for the session model and still appends the user messages and the note', async () => {
    const { calls, pi, ctx, event } = setup();
    const out = await writeSummary(pi, event, ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context.messages[0]).toBe(system);
    expect(out?.compaction?.summary).toMatch(/^## Goal\nfix the parser\n\n<read-files>/);
    expect(out?.compaction?.details).toEqual({ readFiles: ['src/a.ts'], modifiedFiles: ['src/b.ts', 'src/new.ts'] });
    expect(out?.compaction?.usage).toEqual(usage);
    expect(out?.compaction?.summary).toContain('## User Messages (verbatim, oldest first)');
    expect(out?.compaction?.summary).toContain('fix the parser in src/a.ts');
  });

  it('falls back to the standalone summary request when the shared reply is unusable', async () => {
    const { calls, pi, ctx, event, notices } = setup({ reply: (n) => (n === 1 ? reply([{ type: 'toolCall', id: 'x', name: 'read', arguments: {} }], 'toolUse') : reply([text('## Goal\nfallback')])) });
    const out = await writeSummary(pi, event, ctx);
    expect(calls).toHaveLength(2);
    expect(finalPrompt(calls[1]!)).toContain('<conversation>');
    expect(out?.compaction?.summary).toContain('fallback');
    expect(notices).toEqual([]);
  });

  it('summarizes a downshift on the previous model with the standalone request only', async () => {
    const { calls, pi, ctx, event } = setup();
    const out = await writeSummary(pi, event, ctx, { ...model, id: 'previous' } as never);
    expect(calls).toHaveLength(1);
    expect(finalPrompt(calls[0]!)).toContain('<conversation>');
    expect(out?.compaction?.summary).toContain('## Goal');
  });

  it('warns once when both paths fail', async () => {
    const { notices, pi, ctx, event } = setup({ reply: () => { throw new Error('down'); } });
    expect(await writeSummary(pi, event, ctx)).toBeUndefined();
    expect(notices).toHaveLength(1);
  });
});
