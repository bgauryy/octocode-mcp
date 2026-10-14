import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLEAR_AT_LEAST_TOKENS, KEEP_RECENT_RESULTS } from '../src/compaction/clearing.js';
import { registerCompaction } from '../src/compaction/register.js';
import { contextReads, CLEARED_RESULTS_TYPE } from '../src/files/reads.js';
import type { FileGuard } from '../src/files/tool.js';
import { CACHE_RETENTION_ENV } from '../src/shared/env.js';
import { CHARS_PER_TOKEN } from '../src/shared/tokens.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;
const model = { provider: 'p', id: 'm', api: 'anthropic-messages', promptCache: { short: 300, long: 3600 }, contextWindow: 200_000 };
/** About 3,300 tokens of text: the 20,000-token bar takes seven of these. */
const BIG = 10_000;

let savedRetention: string | undefined;
let savedHome: string | undefined;
beforeEach(() => {
  savedRetention = process.env[CACHE_RETENTION_ENV];
  savedHome = process.env['OCTOCODE_HOME'];
  process.env[CACHE_RETENTION_ENV] = 'long';
  process.env['OCTOCODE_HOME'] = tmp();
});
afterEach(() => {
  vi.restoreAllMocks();
  if (savedRetention === undefined) delete process.env[CACHE_RETENTION_ENV];
  else process.env[CACHE_RETENTION_ENV] = savedRetention;
  if (savedHome === undefined) delete process.env['OCTOCODE_HOME'];
  else process.env['OCTOCODE_HOME'] = savedHome;
});

let counter = 0;
/** An assistant call and its result, as two messages. */
function exchange(tool: string, args: Record<string, unknown>, content: unknown[], extra: Record<string, unknown> = {}) {
  const id = `call${++counter}`;
  return {
    id,
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall', id, name: tool, arguments: args }], timestamp: T0 + counter },
      { role: 'toolResult', toolCallId: id, toolName: tool, content, isError: false, timestamp: T0 + counter, ...extra },
    ],
  };
}
const textOf = (length: number, mark = 'x') => [{ type: 'text', text: mark.repeat(length) }];
const reads = (count: number, length = BIG) => Array.from({ length: count }, (_, index) => exchange('read', { path: `f${index}.ts` }, textOf(length, String(index % 10))));
const flat = (items: Array<{ messages: unknown[] }>) => items.flatMap((item) => item.messages);

interface Reply { role: 'assistant'; content: unknown[]; timestamp: number }
const reply = (timestamp: number): Reply => ({ role: 'assistant', content: [{ type: 'text', text: 'done' }], timestamp });

/** A registered extension over a session holding `messages`; `appendEntry` writes land in the branch, as in Pi. */
function setup(messages: unknown[], options: { cwd?: string; withModel?: boolean; priorEntries?: unknown[]; guard?: Pick<FileGuard, 'restore' | 'forget'> } = {}) {
  const fake = fakePi();
  const guard = options.guard ?? { restore: vi.fn(), forget: vi.fn() };
  registerCompaction(fake.pi, guard as FileGuard);
  const cwd = options.cwd ?? '/repo';
  const ctx = fakeCtx({ cwd, model: options.withModel === false ? { ...model, promptCache: undefined } : model });
  const branch = () => [
    ...messages.map((message, index) => ({ type: 'message', id: `m${index}`, message })),
    ...(options.priorEntries ?? []),
    ...fake.entries.map((entry, index) => ({ type: 'custom', id: `c${index}`, customType: entry.customType, data: entry.data })),
  ];
  Object.assign(ctx, {
    sessionManager: {
      getSessionId: () => 's1',
      getBranch: branch,
      getEntries: branch,
      buildSessionProjection: () => ({ entries: messages.map((message, index) => ({ sourceEntry: { id: `m${index}` }, messages: [message] })), messages }),
    },
  });
  return {
    ...fake,
    ctx,
    guard,
    start: (at: number) => {
      vi.spyOn(Date, 'now').mockReturnValue(at);
      return fake.fire('before_agent_start', { type: 'before_agent_start', messageType: 'user', prompt: 'next' }, ctx);
    },
    context: async (list: unknown[] = messages) => ((await fake.fire('context', { type: 'context', messages: structuredClone(list) }, ctx)) as { messages?: any[] } | undefined)?.messages ?? list,
  };
}

const resultTexts = (messages: any[]) => messages.filter((message) => message.role === 'toolResult').map((message) => message.content.map((part: any) => part.text ?? `<${part.type}>`).join(''));
const cleared = (text: string) => text.startsWith('[Old tool result cleared');
const savedPathOf = (text: string) => /Full output: (\S+) \(sha256/.exec(text)?.[1];

describe('clearing old tool results once the prompt cache is cold', () => {
  const idleMessages = (items: Array<{ messages: unknown[] }>) => [{ role: 'user', content: 'go', timestamp: T0 }, ...flat(items), reply(T0 + 100)];

  it('does nothing while the cache is warm, however old and large the results', async () => {
    const messages = idleMessages(reads(20));
    const s = setup(messages);
    await s.start(T0 + 100 + HOUR - 1_000);
    expect(s.entries).toEqual([]);
    expect(resultTexts(await s.context()).every((text) => text.length === BIG)).toBe(true);
    expect(s.guard.forget).not.toHaveBeenCalled();
  });

  it('after an idle gap past the cache lifetime keeps the newest five and clears older results to saved files', async () => {
    const items = reads(12);
    const s = setup(idleMessages(items));
    await s.start(T0 + 100 + HOUR + 1_000);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]!.customType).toBe(CLEARED_RESULTS_TYPE);
    const outcome = resultTexts(await s.context());
    expect(outcome.slice(0, 12 - KEEP_RECENT_RESULTS).every(cleared)).toBe(true);
    expect(outcome.slice(-KEEP_RECENT_RESULTS).every((text) => text.length === BIG)).toBe(true);
    // Every cleared result is reachable: its placeholder names a file holding the whole text and how to get it back.
    outcome.slice(0, 12 - KEEP_RECENT_RESULTS).forEach((text, index) => {
      const file = savedPathOf(text)!;
      expect(fs.readFileSync(path.resolve(file), 'utf8')).toBe(String(index % 10).repeat(BIG));
      expect(text).toMatch(/prompt cache expired/);
      expect(text).toMatch(/run the call again/);
    });
  });

  it('applies the decision identically on every later request, so the prompt stays byte-stable', async () => {
    const s = setup(idleMessages(reads(12)));
    await s.start(T0 + 100 + HOUR + 1_000);
    const first = JSON.stringify(await s.context());
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 100 + 5 * HOUR);
    expect(JSON.stringify(await s.context())).toBe(first);
    // A new prompt right after (the cache is warm again, or the clearing already happened) decides nothing more.
    await s.start(T0 + 100 + HOUR + 5_000);
    expect(s.entries).toHaveLength(1);
  });

  it('clears only when the older results total at least 20,000 tokens', async () => {
    const perResult = Math.ceil((CLEAR_AT_LEAST_TOKENS * CHARS_PER_TOKEN) / 4) - 100;
    const below = setup(idleMessages(reads(KEEP_RECENT_RESULTS + 4, perResult)));
    await below.start(T0 + 100 + HOUR + 1_000);
    expect(below.entries).toEqual([]);
    const atLeast = setup(idleMessages(reads(KEEP_RECENT_RESULTS + 4, perResult + 200)));
    await atLeast.start(T0 + 100 + HOUR + 1_000);
    expect(atLeast.entries).toHaveLength(1);
  });

  it('clears only re-fetchable read-only results: Octocode MCP, web, grep/find/ls and read; never bash, file, agent or custom messages', async () => {
    const keep = [
      exchange('bash', { command: 'ls' }, textOf(60_000)),
      exchange('file', { queries: [] }, textOf(60_000)),
      exchange('agent', { task: 'x' }, textOf(60_000)),
    ];
    const custom = { role: 'custom', customType: 'note', content: 'y'.repeat(60_000), timestamp: T0 };
    const old = [
      exchange('mcp__octocode__localSearch', { queries: [] }, textOf(20_000)),
      exchange('web', { url: 'https://x.test' }, textOf(20_000)),
      exchange('grep', { pattern: 'a' }, textOf(20_000)),
      exchange('find', { pattern: 'a' }, textOf(20_000)),
      exchange('ls', { path: '.' }, textOf(20_000)),
    ];
    const s = setup([custom, ...flat(keep), ...flat(old), ...flat(reads(KEEP_RECENT_RESULTS)), reply(T0 + 100)]);
    await s.start(T0 + 100 + HOUR + 1_000);
    const out = await s.context();
    const byTool = new Map(out.filter((m) => m.role === 'toolResult').map((m) => [m.toolName + m.toolCallId, cleared(m.content[0].text)]));
    const keyOf = (item: { id: string; messages: any[] }) => `${item.messages[1].toolName}${item.id}`;
    for (const item of old) expect(byTool.get(keyOf(item))).toBe(true);
    for (const item of keep) expect(byTool.get(keyOf(item))).toBe(false);
    expect(out[0]).toEqual(custom);
  });

  it('leaves errors, results with images and results that are already placeholders alone', async () => {
    const error = exchange('read', { path: 'gone.ts' }, textOf(60_000), { isError: true });
    const image = exchange('read', { path: 'a.png' }, [...textOf(60_000), { type: 'image', data: 'AAAA', mimeType: 'image/png' }]);
    const placeholder = exchange('read', { path: 'p.ts' }, [{ type: 'text', text: `[Old tool result cleared after the prompt cache expired; full output: /x ${'z'.repeat(60_000)}]` }]);
    const s = setup([...flat([error, image, placeholder]), ...flat(reads(KEEP_RECENT_RESULTS)), reply(T0 + 100)]);
    await s.start(T0 + 100 + HOUR + 1_000);
    // The only older, clearable text is nothing: the three above are excluded, so the bar is not met.
    expect(s.entries).toEqual([]);
  });

  it('does not clear a result whose full text could not be saved, and clears nothing when too little remains', async () => {
    const blocker = path.join(tmp(), 'file-not-folder');
    fs.writeFileSync(blocker, '');
    process.env['OCTOCODE_HOME'] = blocker;
    const s = setup(idleMessages(reads(12)));
    await s.start(T0 + 100 + HOUR + 1_000);
    expect(s.entries).toEqual([]);
    expect(resultTexts(await s.context()).every((text) => text.length === BIG)).toBe(true);
    expect(s.guard.forget).not.toHaveBeenCalled();
  });

  it('skips a model with no known cache lifetime and a session with no reply yet', async () => {
    const unknown = setup(idleMessages(reads(12)), { withModel: false });
    await unknown.start(T0 + 100 + 10 * HOUR);
    expect(unknown.entries).toEqual([]);
    const fresh = setup([{ role: 'user', content: 'go', timestamp: T0 }, ...flat(reads(12)).filter((message: any) => message.role === 'toolResult')]);
    await fresh.start(T0 + 10 * HOUR);
    expect(fresh.entries).toEqual([]);
  });

  it('applies a persisted decision after a resume, reload or fork (read from the branch), and the file guard stops counting cleared reads', async () => {
    const items = reads(12);
    const messages = idleMessages(items);
    const first = setup(messages);
    await first.start(T0 + 100 + HOUR + 1_000);
    const entry = first.entries[0]!;
    const resumed = setup(messages, { priorEntries: [{ type: 'custom', id: 'old', customType: entry.customType, data: entry.data }] });
    const out = resultTexts(await resumed.context());
    expect(out.slice(0, 7).every(cleared)).toBe(true);
    expect(out.slice(7).every((text) => text.length === BIG)).toBe(true);
    // contextReads (the guard's memory after a resume) omits the cleared reads and keeps the five that stayed.
    const kept = contextReads(resumed.ctx).map((read) => path.basename(read.file));
    expect(kept.sort()).toEqual(['f10.ts', 'f11.ts', 'f7.ts', 'f8.ts', 'f9.ts']);
  });

  it('makes the file guard ask for a fresh read of a file whose read was cleared', async () => {
    const guard = { restore: vi.fn(), forget: vi.fn() };
    const s = setup(idleMessages(reads(12)), { guard });
    await s.start(T0 + 100 + HOUR + 1_000);
    const forgotten = guard.forget.mock.calls.map(([file]) => path.basename(String(file))).sort();
    expect(forgotten).toEqual(['f0.ts', 'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts']);
  });
});
