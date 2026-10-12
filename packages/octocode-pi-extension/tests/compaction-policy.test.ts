import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchNet, cacheRates, futureRequests, idleContinuation, recentWindowChars } from '../src/compaction/policy.js';

const batchPays = (...args: Parameters<typeof batchNet>) => batchNet(...args) > 0;
import { KEEP_RECENT_RESULTS, planContextTrims, registerCompaction } from '../src/compaction/register.js';
import type { FileGuard } from '../src/files/tool.js';
import { CACHE_RETENTION_ENV } from '../src/shared/env.js';

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

afterEach(() => vi.restoreAllMocks());

const priced = { cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } };

describe('cache rates', () => {
  it('prices reads and writes from the model, a 1-hour write at 2× input, and falls back to Anthropic ratios when unpriced', () => {
    expect(cacheRates(priced, {})).toEqual({ read: 0.5, write: 6.25 });
    expect(cacheRates(priced, { [CACHE_RETENTION_ENV]: 'long' })).toEqual({ read: 0.5, write: 10 });
    expect(cacheRates({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, {})).toEqual({ read: 0.1, write: 1.25 });
    expect(cacheRates(undefined, { [CACHE_RETENTION_ENV]: 'long' })).toEqual({ read: 0.1, write: 2 });
  });
});

describe('future requests', () => {
  it('expects the context to be reused about as many more times as it was, capped by the room left before Pi compacts', () => {
    // 40 requests grew the context to 120k tokens of a 1M window: room for far more, so 40.
    expect(futureRequests({ requests: 40, tokens: 120_000, contextWindow: 1_000_000, reserveTokens: 16_384 })).toBe(40);
    // 40 requests filled 180k of a 200k window: about 1 request of growth (4.5k each) is left before compaction resets it.
    expect(futureRequests({ requests: 40, tokens: 180_000, contextWindow: 200_000, reserveTokens: 16_384 })).toBe(1);
    expect(futureRequests({ requests: 0, tokens: 0, contextWindow: 200_000, reserveTokens: 16_384 })).toBe(1);
    expect(futureRequests({ requests: 10, tokens: null, contextWindow: 200_000, reserveTokens: 16_384 })).toBe(10);
  });
});

describe('batch economics', () => {
  const rates = { read: 0.1, write: 1.25 };
  it('trims on a warm cache only when the reads it saves outweigh rewriting the prompt after the first edit', () => {
    // Save 10k tokens per request; rewriting 100k tokens costs 115k read-units: needs about 100 more requests.
    const batch = { savedChars: 40_000, rewriteChars: 400_000 };
    expect(batchPays(batch, { due: false, rates, futureRequests: 20 })).toBe(false);
    expect(batchPays(batch, { due: false, rates, futureRequests: 150 })).toBe(true);
    // A batch near the end of the prompt rewrites little: it pays sooner.
    expect(batchPays({ savedChars: 40_000, rewriteChars: 60_000 }, { due: false, rates, futureRequests: 20 })).toBe(true);
    // A cold cache (or real pressure) costs nothing extra: any batch pays.
    expect(batchPays(batch, { due: true, rates, futureRequests: 1 })).toBe(true);
  });
});

describe('recent window', () => {
  it('follows Pi\'s compaction.keepRecentTokens, the verbatim tail Pi keeps when it summarizes', () => {
    expect(recentWindowChars({ compaction: { keepRecentTokens: 5_000 } })).toBe(20_000);
    expect(recentWindowChars({})).toBe(80_000);
    const results = Array.from({ length: KEEP_RECENT_RESULTS }, (_, index) => ({
      id: `r${index}`,
      message: { role: 'toolResult', toolName: 'bash', toolCallId: `c${index}`, content: [{ type: 'text', text: 'x'.repeat(9_000) }] },
    }));
    // A smaller window keeps fewer results verbatim (at least the minimum), so more are trimmable.
    expect(planContextTrims(results, new Map(), new Set(), { keepRecentChars: 20_000 }).length).toBeGreaterThan(planContextTrims(results).length);
  });
});

describe('idle continuation', () => {
  const minute = 60_000;
  it('estimates from this session\'s own idle gaps whether the user returns before the entry expires', () => {
    const gaps = [2, 3, 4, 6, 8, 40, 50, 55, 70, 90].map((value) => value * minute);
    // Idle 1 minute, entry lives 5: of the 10 gaps past 1 minute, 4 end after the refresh would matter (1.5) and by 6.
    expect(idleContinuation(gaps, 1 * minute, 5 * minute)).toBeCloseTo(0.4);
    // Idle 30 minutes: 5 gaps lasted that long and none ended within 35.
    expect(idleContinuation(gaps, 30 * minute, 5 * minute)).toBe(0);
    // Too little history: no estimate (Pi's own decision stands).
    expect(idleContinuation([minute, minute], minute, 5 * minute)).toBeUndefined();
  });
});

describe('turn_end policy', () => {
  function session(requests: number) {
    const handlers = new Map<string, Handler>();
    const pi = { on: (name: string, handler: Handler) => void handlers.set(name, handler), registerProvider: vi.fn(), getSettings: () => ({}) } as unknown as ExtensionAPI;
    registerCompaction(pi, { reset: vi.fn(), forget: vi.fn() } as unknown as FileGuard);
    const model = { provider: 'p', id: 'm', api: 'anthropic-messages', promptCache: { short: 300, long: 3600 }, contextWindow: 1_000_000, ...priced };
    const ctx = {
      model,
      hasUI: true,
      cwd: '/repo',
      modelRegistry: { getAll: () => [model], find: () => model },
      sessionManager: { getSessionId: () => 's1', getBranch: () => [] },
      getContextUsage: () => ({ tokens: 120_000, contextWindow: 1_000_000, percent: 12 }),
    };
    // Old large results first, then many small turns: the trimmed results sit early, so the rewrite is most of the prompt.
    const big = Array.from({ length: 10 }, (_, index) => [
      { id: `a${index}`, message: { role: 'assistant', content: [{ type: 'toolCall', id: `c${index}`, name: 'bash', arguments: { command: 'x' } }] } },
      { id: `r${index}`, message: { role: 'toolResult', toolName: 'bash', toolCallId: `c${index}`, content: [{ type: 'text', text: 'o'.repeat(8_000) }] } },
    ]).flat();
    // A long user message after them: every warm trim of the old results rewrites it too.
    const middle = { id: 'u', message: { role: 'user', content: 'u'.repeat(600_000) } };
    const small = Array.from({ length: requests }, (_, index) => [
      { id: `sa${index}`, message: { role: 'assistant', content: [{ type: 'toolCall', id: `s${index}`, name: 'bash', arguments: { command: 'y'.repeat(100) } }] } },
      { id: `sr${index}`, message: { role: 'toolResult', toolName: 'bash', toolCallId: `s${index}`, content: [{ type: 'text', text: 'k'.repeat(1_000) }] } },
    ]).flat();
    const entries = [...big, middle, ...small];
    const event = {
      entries: [],
      message: { role: 'assistant', provider: 'p', model: 'm', timestamp: Date.now(), usage: { cacheRead: 100_000, cacheWrite: 10 } },
      toolResultEntryIds: [],
      context: { contextEntries: entries.map((entry) => ({ sourceEntry: { type: 'message', id: entry.id }, messages: [entry.message] })) },
    };
    return { fire: (name: string, value: unknown) => handlers.get(name)!(value, ctx), event };
  }

  it('leaves a warm cache alone while a batch does not pay, and trims once the session has reused its context enough', async () => {
    const young = session(20);
    expect(await young.fire('turn_end', young.event)).toBeUndefined();
    const long = session(400);
    expect(((await long.fire('turn_end', long.event)) as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });

  it('never warms the cache of a headless run or a subagent', async () => {
    const handlers = new Map<string, Handler>();
    const pi = { on: (name: string, handler: Handler) => void handlers.set(name, handler), registerProvider: vi.fn(), getSettings: () => ({}) } as unknown as ExtensionAPI;
    registerCompaction(pi, { reset: vi.fn(), forget: vi.fn() } as unknown as FileGuard);
    const decide = handlers.get('cache_warming_decision')!;
    const event = { type: 'cache_warming_decision', action: 'warm', warmCost: 0.01, missCost: 1, continuationProbability: 1 };
    expect(await decide(event, { hasUI: false, sessionManager: { getBranch: () => [] } })).toEqual({ action: 'stop' });
    expect(await decide(event, { hasUI: true, sessionManager: { getBranch: () => [] } })).toBeUndefined();
  });
});
