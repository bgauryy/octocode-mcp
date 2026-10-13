import { reserveTokensFor } from '../src/compaction/register.js';
import { describe, expect, it, vi } from 'vitest';
import { THRASH_STREAK, THRASH_TURNS, ThrashBreaker, needsDownshiftCompaction } from '../src/compaction/pacing.js';
import { registerCompaction } from '../src/compaction/register.js';

describe('thrash breaker', () => {
  const refill = (breaker: ThrashBreaker, turns: number) => {
    for (let i = 0; i < turns; i++) breaker.turnEnded();
  };

  it(`trips after ${THRASH_STREAK} compactions in a row that each came within ${THRASH_TURNS} turns of the previous one`, () => {
    const breaker = new ThrashBreaker();
    breaker.compacted(false);
    for (let i = 0; i < THRASH_STREAK; i++) {
      expect(breaker.tripped()).toBe(false);
      refill(breaker, THRASH_TURNS);
      breaker.compacted(false);
    }
    refill(breaker, 1);
    expect(breaker.tripped()).toBe(true);
    // Room to breathe: more turns than the window is not a refill.
    refill(breaker, THRASH_TURNS);
    expect(breaker.tripped()).toBe(false);
  });

  it('starts over after a slow refill, a manual compaction or a new session', () => {
    const breaker = new ThrashBreaker();
    breaker.compacted(false);
    for (let i = 0; i < THRASH_STREAK; i++) {
      refill(breaker, 1);
      breaker.compacted(false);
    }
    breaker.compacted(true);
    refill(breaker, 1);
    expect(breaker.tripped()).toBe(false);
    for (let i = 0; i < THRASH_STREAK; i++) {
      refill(breaker, 1);
      breaker.compacted(false);
    }
    breaker.reset();
    expect(breaker.tripped()).toBe(false);
    refill(breaker, THRASH_TURNS + 1);
    breaker.compacted(false);
    refill(breaker, 1);
    expect(breaker.tripped()).toBe(false);
  });
});

describe('downshift compaction', () => {
  it('compacts only when the context does not fit a smaller window less the reply room', () => {
    const big = { contextWindow: 1_000_000 };
    const small = { contextWindow: 200_000 };
    expect(needsDownshiftCompaction(big, small, 190_000, 16_384)).toBe(true);
    expect(needsDownshiftCompaction(big, small, 150_000, 16_384)).toBe(false);
    expect(needsDownshiftCompaction(small, big, 190_000, 16_384)).toBe(false);
    expect(needsDownshiftCompaction(undefined, small, 190_000, 16_384)).toBe(false);
    expect(needsDownshiftCompaction(big, small, null, 16_384)).toBe(false);
  });
});

describe('pacing wired into the session', () => {
  function session(tokens: number) {
    const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
    const pi = { on: (name: string, handler: never) => void handlers.set(name, handler), getSettings: () => ({ compaction: { reserveTokens: 10_000 } }), getThinkingLevel: () => 'off', getActiveTools: () => [], sendMessage: vi.fn() };
    registerCompaction(pi as never, { restore: vi.fn(), forget: vi.fn(), record: vi.fn() } as never);
    const ctx = {
      cwd: '/w', hasUI: true, ui: { notify: vi.fn() }, abort: vi.fn(), compact: vi.fn(), model: undefined,
      getContextUsage: () => ({ tokens, contextWindow: 1, percent: 1 }),
      sessionManager: { getSessionId: () => 's', buildSessionProjection: () => ({ entries: [] }), getSessionFile: () => undefined },
    };
    const fire = (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx);
    return { ctx, fire };
  }
  const before = (reason: string) => ({ reason, preparation: { messagesToSummarize: [], turnPrefixMessages: [], settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 }, fileOps: { read: new Set(), written: new Set(), edited: new Set() } }, branchEntries: [], signal: new AbortController().signal });
  const turnEnd = { message: { role: 'assistant' }, messageEntryId: 'm', entries: [], context: { contextEntries: [] } };

  it('cancels an automatic compaction and stops the run once the context keeps refilling; a manual one still runs', async () => {
    const { ctx, fire } = session(1);
    await fire('session_compact', { reason: 'threshold' });
    for (let i = 0; i < THRASH_STREAK; i++) {
      await fire('turn_end', turnEnd);
      await fire('session_compact', { reason: 'threshold' });
    }
    await fire('turn_end', turnEnd);
    expect(await fire('session_before_compact', before('threshold'))).toEqual({ cancel: true });
    expect(ctx.abort).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/Automatic compaction stopped/), 'error');
    expect(await fire('session_before_compact', before('manual'))).toBeUndefined();
  });

  it('compacts before switching to a model whose window the context does not fit', async () => {
    const { ctx, fire } = session(150_000);
    await fire('model_select', { model: { id: 'small', contextWindow: 128_000 }, previousModel: { id: 'big', contextWindow: 1_000_000 }, source: 'set' });
    expect(ctx.compact).toHaveBeenCalledTimes(1);
    await fire('model_select', { model: { id: 'big', contextWindow: 1_000_000 }, previousModel: { id: 'small', contextWindow: 128_000 }, source: 'set' });
    expect(ctx.compact).toHaveBeenCalledTimes(1);
  });
});

describe('per-model compaction reserve', () => {
  it("reads the model's override, else the global reserve, else Pi's default", () => {
    const model = { provider: 'p', id: 'm' };
    expect(reserveTokensFor({ compaction: { reserveTokens: 40_000, modelOverrides: { 'p/m': { reserveTokens: 8_000 } } } }, model)).toBe(8_000);
    expect(reserveTokensFor({ compaction: { reserveTokens: 40_000, modelOverrides: { 'p/other': { reserveTokens: 8_000 } } } }, model)).toBe(40_000);
    expect(reserveTokensFor({}, model)).toBe(16_384);
  });
});
