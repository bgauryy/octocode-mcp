import type { ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { CacheWarmObservation } from '../src/compaction/cache-warm.js';

function session() {
  const entries = new Map<string, SessionEntry>();
  let leaf: string | null = null;
  const state = { session: 's', model: { provider: 'p', id: 'm' } };
  const getEntry = vi.fn((id: string) => entries.get(id));
  const ctx = {
    get model() { return state.model; },
    sessionManager: { getSessionId: () => state.session, getLeafId: () => leaf, getEntry },
  } as unknown as ExtensionContext;
  const append = (type: 'usage' | 'custom', model = 'm') => {
    const id = `e${entries.size}`;
    entries.set(id, { id, parentId: leaf, timestamp: new Date(90_000).toISOString(), type, kind: 'cache_warm', provider: 'p', model } as SessionEntry);
    leaf = id;
    return id;
  };
  return { ctx, state, getEntry, append, branch: (id: string | null) => { leaf = id; } };
}

describe('successful cache warming', () => {
  it('counts only confirmed success, once, using the pre-request time rather than completion time', () => {
    const s = session();
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    expect(warm.observe(s.ctx)).toBeUndefined();
    s.append('custom');
    expect(warm.observe(s.ctx)).toBeUndefined();
    s.append('usage');
    expect(warm.observe(s.ctx)).toBe(1_000);
    expect(warm.observe(s.ctx)).toBeUndefined();
  });

  it('does not scan preexisting history or reread already observed entries while a warm is pending', () => {
    const s = session();
    for (let index = 0; index < 100; index++) s.append('custom');
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    s.append('custom');
    expect(warm.observe(s.ctx)).toBeUndefined();
    expect(warm.observe(s.ctx)).toBeUndefined();
    expect(s.getEntry).toHaveBeenCalledTimes(1);
    s.append('usage');
    expect(warm.observe(s.ctx)).toBe(1_000);
    expect(s.getEntry).toHaveBeenCalledTimes(2);
  });

  it.each(['session', 'model', 'branch', 'reset'] as const)('does not confirm a warm after a %s change', (change) => {
    const s = session();
    const base = s.append('custom');
    s.append('custom');
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    if (change === 'session') s.state.session = 'other';
    if (change === 'model') s.state.model = { provider: 'p', id: 'other' };
    if (change === 'branch') s.branch(base);
    if (change === 'reset') warm.reset();
    s.append('usage');
    expect(warm.observe(s.ctx)).toBeUndefined();
  });

  it('ignores successes preceding the decision and accepts Pi resolving the configured model alias', () => {
    const s = session();
    s.append('usage');
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    expect(warm.observe(s.ctx)).toBeUndefined();
    s.append('usage', 'other');
    expect(warm.observe(s.ctx)).toBe(1_000);
  });

  it.each(['session', 'model', 'reset'] as const)('forgets confirmed freshness on a %s change', (change) => {
    const s = session();
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    s.append('usage');
    expect(warm.observe(s.ctx)).toBe(1_000);
    expect(warm.written).toBe(1_000);
    if (change === 'session') s.state.session = 'other';
    if (change === 'model') s.state.model = { provider: 'p', id: 'other' };
    if (change === 'reset') warm.reset();
    warm.observe(s.ctx);
    expect(warm.written).toBeUndefined();
  });

  it('confirms the preceding success before starting another warm, while failures never advance freshness', () => {
    const s = session();
    const warm = new CacheWarmObservation();
    warm.begin(s.ctx, 1_000);
    s.append('usage');
    warm.begin(s.ctx, 50_000);
    expect(warm.written).toBe(1_000);
    // The second warm failed; a third decision is still not evidence that it ran.
    warm.begin(s.ctx, 100_000);
    expect(warm.written).toBe(1_000);
    s.append('usage');
    expect(warm.observe(s.ctx)).toBe(100_000);
    warm.record(1_000);
    expect(warm.written).toBe(100_000);
  });
});
