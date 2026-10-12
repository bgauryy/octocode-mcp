import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promptCacheTtlMs } from '../src/compaction/cache.js';
import { TRIM_PRESSURE_PERCENT, trimsDue } from '../src/compaction/policy.js';
import { KEEP_RECENT_RESULTS, planContextTrims, registerCompaction, type TrimMemo } from '../src/compaction/register.js';
import type { FileGuard } from '../src/files/tool.js';

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

const call = (index: number, size: number) => ({
  id: `a${index}`,
  message: { role: 'assistant', content: [{ type: 'toolCall', id: `c${index}`, name: 'file', arguments: { queries: [{ type: 'write', path: `f${index}.ts`, content: 'w'.repeat(size) }] } }] },
});
/** A long user message after everything trimmable. */
const tail = { id: 'tail', message: { role: 'user', content: 'u'.repeat(400_000) } };
const result = (index: number) => ({ id: `r${index}`, message: { role: 'toolResult', toolName: 'file', toolCallId: `c${index}`, content: [{ type: 'text', text: 'ok' }] } });

/** Pi's turn_end shape: each entry is one session message. */
const turnEnd = (entries: Array<{ id: string; message: unknown }>) => ({
  entries: [],
  context: { contextEntries: entries.map((entry) => ({ sourceEntry: { type: 'message', id: entry.id }, messages: [entry.message] })) },
});

function register(model?: { promptCache?: { short?: number; long?: number } }) {
  const handlers = new Map<string, Handler>();
  const pi = { on: (name: string, handler: Handler) => void handlers.set(name, handler), registerProvider: vi.fn(), getSettings: () => ({}) } as unknown as ExtensionAPI;
  const reset = vi.fn();
  const forget = vi.fn();
  registerCompaction(pi, { reset, forget } as unknown as FileGuard);
  let session = 's1';
  // Context pressure by default, so turn_end plans trims; tests lower it to see the cache-aware deferral.
  const usage = { percent: 80 as number | null };
  const registered = model && { provider: 'p', id: 'm', api: 'anthropic-messages', ...model };
  const modelRegistry = { getAll: () => (registered ? [registered] : []), find: () => registered };
  const ctx = { model: registered, modelRegistry, hasUI: true, cwd: '/repo', sessionManager: { getSessionId: () => session, getBranch: () => [] }, getContextUsage: () => ({ tokens: 1, contextWindow: 100, percent: usage.percent }) };
  return {
    usage,
    reset,
    forget,
    fire: (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx),
    switchTo: (id: string) => void (session = id),
  };
}

/** How often JSON.stringify ran on the arguments of the given calls. */
function countStringify(entries: Array<{ message: unknown }>) {
  const tracked = new Set(entries.flatMap((entry) => ((entry.message as { content: Array<{ arguments?: unknown }> }).content ?? []).map((part) => part.arguments)).filter(Boolean));
  const original = JSON.stringify;
  let count = 0;
  const spy = vi.spyOn(JSON, 'stringify').mockImplementation((value: unknown, replacer?: (string | number)[] | null, space?: string | number) => {
    if (tracked.has(value)) count++;
    return original(value, replacer, space);
  });
  return { count: () => count, restore: () => spy.mockRestore() };
}

// An exported (user) retention: session_start keeps it, so these tests use the short tier throughout.
beforeEach(() => vi.stubEnv('PI_CACHE_RETENTION', 'short'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('trim plan memo', () => {
  it('measures each settled call once across turn_end events, and forgets on session switch, compaction and tree moves', async () => {
    const { fire, switchTo, reset } = register();
    // A small settled file call: judged too small once, then never re-measured.
    const history = [call(0, 100), result(0), call(1, 200), result(1)];
    const counter = countStringify(history);
    expect(await fire('turn_end', turnEnd(history))).toBeUndefined();
    const first = counter.count();
    expect(first).toBe(2);
    const next = [...history, call(2, 50), result(2)];
    expect(await fire('turn_end', turnEnd(next))).toBeUndefined();
    expect(counter.count()).toBe(first);

    switchTo('s2');
    await fire('turn_end', turnEnd(history));
    expect(counter.count()).toBe(first * 2);
    await fire('session_compact');
    expect(reset).toHaveBeenCalledOnce();
    await fire('turn_end', turnEnd(history));
    expect(counter.count()).toBe(first * 3);
    await fire('session_tree');
    await fire('turn_end', turnEnd(history));
    expect(counter.count()).toBe(first * 4);
    await fire('session_start');
    await fire('turn_end', turnEnd(history));
    expect(counter.count()).toBe(first * 5);
    counter.restore();
  });

  it('defers trims while the prompt cache is warm and the context has room', async () => {
    const now = Date.now();
    const ttl = 300_000;
    const turn = (at: number) => ({ message: { role: 'assistant', timestamp: at } });
    // Room in context, cache just written: wait.
    expect(trimsDue({ written: now, ttlMs: ttl }, 10, now)).toBe(false);
    expect(trimsDue({ written: now, ttlMs: ttl }, null, now)).toBe(false);
    // The turn's tools ran past the cache lifetime with no refresh: the next request misses anyway.
    expect(trimsDue({ written: now - ttl, ttlMs: ttl }, 10, now)).toBe(true);
    // The context is filling up: trim even on a warm cache.
    expect(trimsDue({ written: now, ttlMs: ttl }, TRIM_PRESSURE_PERCENT, now)).toBe(true);
    // No prompt cache for the model (or none known): nothing to keep warm.
    expect(trimsDue({ written: now, ttlMs: undefined }, 10, now)).toBe(true);

    // The lifetime is the model's tier for the retention in use.
    const tiers = { short: 300, long: 3600 };
    expect(promptCacheTtlMs(tiers, {})).toBe(300_000);
    expect(promptCacheTtlMs(tiers, { PI_CACHE_RETENTION: 'long' })).toBe(3_600_000);
    expect(promptCacheTtlMs(undefined, {})).toBeUndefined();
    // None declared for this tier: no cache.
    expect(promptCacheTtlMs({ long: 3600 }, {})).toBeUndefined();

    // About 1.3M request characters (room left under REQUEST_PRESSURE_CHARS), ending in a long message: on a warm cache any
    // batch would rewrite it, which costs more than the batch saves, so only the cache decides.
    const big = [...Array.from({ length: KEEP_RECENT_RESULTS + 10 }, (_, index) => [call(index, 40_000), result(index)]).flat(), tail];
    const session = () => {
      const s = register({ promptCache: { short: 300 } });
      s.usage.percent = 10;
      return s;
    };
    const warm = session();
    expect(await warm.fire('turn_end', { ...turnEnd(big), ...turn(Date.now()) })).toBeUndefined();
    // Pending, not lost: the same history trims once a turn's tools ran past the lifetime...
    const cold = session();
    expect(((await cold.fire('turn_end', { ...turnEnd(big), ...turn(Date.now() - ttl - 1) })) as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
    // ...unless Pi kept the cache warm meanwhile.
    const kept = session();
    await kept.fire('cache_warming_decision', { type: 'cache_warming_decision', action: 'warm' });
    expect(await kept.fire('turn_end', { ...turnEnd(big), ...turn(Date.now() - ttl - 1) })).toBeUndefined();
    const stopped = session();
    await stopped.fire('cache_warming_decision', { type: 'cache_warming_decision', action: 'stop' });
    expect(((await stopped.fire('turn_end', { ...turnEnd(big), ...turn(Date.now() - ttl - 1) })) as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });

  it('waits for the inferred cache lifetime when a model declares no cache but its turn reports cache use', async () => {
    const big = [...Array.from({ length: KEEP_RECENT_RESULTS + 10 }, (_, index) => [call(index, 40_000), result(index)]).flat(), tail];
    const undeclared = () => {
      const s = register({});
      s.usage.percent = 10;
      return s;
    };
    const turn = (usage: { cacheRead: number; cacheWrite: number }) => ({ message: { role: 'assistant', provider: 'p', model: 'm', timestamp: Date.now(), usage } });
    // Cache evidence: the warm prefix is kept until the lifetime passes.
    expect(await undeclared().fire('turn_end', { ...turnEnd(big), ...turn({ cacheRead: 5_000, cacheWrite: 200 }) })).toBeUndefined();
    // No evidence: nothing to keep warm, trims are due.
    expect(((await undeclared().fire('turn_end', { ...turnEnd(big), ...turn({ cacheRead: 0, cacheWrite: 0 }) })) as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });

  it('plans the same edits with a memo, keeps pending shrinks until a batch is worth it, and never re-proposes one', () => {
    // One large file call saves too little alone (below every threshold), so nothing is proposed yet.
    const memo: TrimMemo = new Map();
    const small = [call(0, 3_000), result(0)];
    expect(planContextTrims(small, memo)).toEqual([]);
    expect(memo.get('c0')).toMatchObject({ saved: expect.any(Number) });

    const big = [...small, ...Array.from({ length: KEEP_RECENT_RESULTS }, (_, index) => [call(10 + index, 70_000), result(10 + index)]).flat()];
    const counter = countStringify(small);
    const edits = planContextTrims(big, memo);
    // The pending verdict for c0 was reused, not recomputed: its arguments were serialized once, to save them whole.
    expect(counter.count()).toBe(1);
    counter.restore();
    // Copies are named by content, so planning the same history again points at the same files.
    expect(edits).toEqual(planContextTrims(big));
    expect(edits.map((edit) => edit.targetId)).toContain('a0');
    // Once proposed, the same (still unapplied) history proposes nothing new for these calls.
    expect(planContextTrims(big, memo)).toEqual([]);
  });
});

describe('trimmed results', () => {
  const big = (index: number, text: string, toolName = 'bash') => ({ id: `r${index}`, message: { role: 'toolResult', toolName, toolCallId: `c${index}`, content: [{ type: 'text', text }] } });
  const readCall = (index: number, name: string, args: Record<string, unknown>) => ({ id: `a${index}`, message: { role: 'assistant', content: [{ type: 'toolCall', id: `c${index}`, name, arguments: args }] } });
  const filler = (from: number) => Array.from({ length: KEEP_RECENT_RESULTS }, (_, index) => big(from + index, 'x'.repeat(3_500)));
  const textOf = (edit: { replacement: unknown }) => (edit.replacement as { content: Array<{ text: string }> }).content[0]!.text;

  it('keeps the head, the tail and any spill pointer in between, and names the saved file', () => {
    const middle = `${'m'.repeat(20_000)}\n[Output truncated: showing 10 of 900 lines. Full output: ~/.octocode/out/web-1.txt; search it]\n${'n'.repeat(20_000)}`;
    const entries = [big(0, `HEAD ${'h'.repeat(5_000)}${middle}${'t'.repeat(5_000)} EXIT 1`), big(1, `${'y'.repeat(70_000)}\nLog: ~/.octocode/bash/bash-2-1.log`), ...filler(10)];
    const edits = planContextTrims(entries);
    const first = textOf(edits.find((edit) => edit.targetId === 'r0')!);
    expect(first.startsWith('HEAD ')).toBe(true);
    expect(first.endsWith(' EXIT 1')).toBe(true);
    expect(first).toMatch(/^\[Output truncated: showing 10 of 900 lines\. Full output: ~\/\.octocode\/out\/web-1\.txt; search it\]$/m);
    expect(first.length).toBeLessThan(1_800);
    // Auxiliary pointers survive, but neither is accepted as proof that it stores the complete result.
    const second = textOf(edits.find((edit) => edit.targetId === 'r1')!);
    expect(second.match(/Log: ~\/\.octocode\/bash\/bash-2-1\.log/g)).toHaveLength(1);
    for (const [index, text] of [first, second].entries()) {
      const saved = /full text is saved at (\S+) \(sha256 [0-9a-f]{16}, \d+ bytes\); read that file/.exec(text)?.[1];
      expect(saved).toBeDefined();
      const file = saved!.startsWith('~') ? path.join(os.homedir(), saved!.slice(2)) : path.resolve(saved!);
      expect(fs.readFileSync(file, 'utf8')).toBe(entries[index]!.message.content[0]!.text);
    }
  });

  it('saves a result that names no saved copy before trimming it, and leaves it whole when it cannot be saved', () => {
    const whole = `HEAD ${'q'.repeat(90_000)} TAIL`;
    const edits = planContextTrims([big(0, whole), ...filler(10)]);
    const text = textOf(edits.find((edit) => edit.targetId === 'r0')!);
    expect(text).not.toMatch(/session history/);
    const saved = /full text is saved at (\S+) \(sha256 [0-9a-f]{16}, \d+ bytes\); read that file/.exec(text)?.[1];
    expect(saved).toBeDefined();
    const file = saved!.startsWith('~') ? path.join(os.homedir(), saved!.slice(2)) : path.resolve(saved!);
    expect(fs.readFileSync(file, 'utf8')).toBe(whole);
    // Octocode home is a regular file: nothing can be saved, so the result keeps its evidence in context.
    const blocked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-trim-')), 'home');
    fs.writeFileSync(blocked, '');
    vi.stubEnv('OCTOCODE_HOME', blocked);
    try {
      expect(planContextTrims([big(0, whole), ...filler(10)]).find((edit) => edit.targetId === 'r0')).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('makes the file tool ask for a re-read once the latest read of a file is trimmed', async () => {
    const { fire, forget } = register();
    const entries = [
      readCall(0, 'read', { path: 'src/a.ts' }),
      big(0, 'a'.repeat(40_000), 'read'),
      readCall(1, 'mcp__octocode__localFetch', { queries: [{ path: '/repo/src/b.ts', fullContent: true }, { path: '/repo/src/c.ts', ranges: ['1-9'] }] }),
      big(1, 'b'.repeat(40_000), 'mcp__octocode__localFetch'),
      // d.ts is read again later, verbatim in the recent window: still in view.
      readCall(2, 'read', { path: 'src/d.ts' }),
      big(2, 'd'.repeat(40_000), 'read'),
      ...filler(10).slice(0, KEEP_RECENT_RESULTS - 1),
      readCall(99, 'read', { path: 'src/d.ts', offset: 1, limit: 5 }),
      big(99, 'short', 'read'),
    ];
    const result = (await fire('turn_end', turnEnd(entries))) as { entries: Array<{ targetId: string }> } | undefined;
    expect(result?.entries.map((edit) => edit.targetId)).toEqual(expect.arrayContaining(['r0', 'r1', 'r2']));
    // Only Pi's read feeds the file guard: trimming an MCP result forgets nothing.
    expect(forget.mock.calls.map(([file]) => file).sort()).toEqual(['/repo/src/a.ts']);
  });
});
