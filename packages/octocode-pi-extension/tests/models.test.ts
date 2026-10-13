import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_TTL_MS, indexCatalog, loadCatalog, lookup, readCatalog } from '../src/subagents/catalog.js';
import { describeModels } from '../src/subagents/models-command.js';
import { resolveTier, routeModel, type ModelRef } from '../src/subagents/model.js';
import { tmp } from './helpers.js';

const api = {
  anthropic: { models: {
    'claude-small-1': { tool_call: true, description: 'small one', modalities: { input: ['text', 'image'] }, limit: { context: 200_000 }, cost: { input: 1, output: 5 }, canonical_model_id: 'anthropic/claude-small-1' },
  } },
  reseller: { models: {
    'claude-small-1': { tool_call: true, description: 'small one', modalities: { input: ['text', 'image'] }, limit: { context: 200_000 }, cost: { input: 2, output: 9 }, canonical_model_id: 'anthropic/claude-small-1' },
    'embed-1': { tool_call: false, cost: { input: 0.01, output: 0 } },
  } },
};

const m = (provider: string, id: string, input: number, output: number, extra: Partial<ModelRef> = {}): ModelRef => ({ provider, id, cost: { input, output }, contextWindow: 200_000, input: ['text', 'image'], ...extra });

describe('models.dev catalog', () => {
  it('indexes bare ids by the lab listing and keeps a provider entry only where it differs', () => {
    const catalog = indexCatalog(api, 1);
    expect(catalog.models['claude-small-1']).toMatchObject({ cost: { input: 1, output: 5 }, toolCall: true, context: 200_000, input: ['text', 'image'] });
    expect(catalog.models['reseller/claude-small-1']).toMatchObject({ cost: { input: 2, output: 9 } });
    expect(catalog.models['anthropic/claude-small-1']).toBeUndefined();
    expect(lookup(catalog, 'reseller', 'claude-small-1')?.cost).toEqual({ input: 2, output: 9 });
    expect(lookup(catalog, 'my-gateway', 'claude-small-1')?.cost).toEqual({ input: 1, output: 5 });
    expect(lookup(catalog, 'openrouter', 'anthropic/claude-small-1')?.description).toBe('small one');
    expect(lookup(undefined, 'a', 'b')).toBeUndefined();
  });

  it('fetches once, reuses a fresh index, keeps a stale one when offline, and backs off after a failure', async () => {
    const file = path.join(tmp(), 'state', 'models-dev.json');
    let calls = 0;
    const ok = (async () => { calls += 1; return new Response(JSON.stringify(api)); }) as typeof fetch;
    const down = (async () => { calls += 1; throw new Error('offline'); }) as typeof fetch;
    const t0 = 10 * CATALOG_TTL_MS;
    expect(Object.keys((await loadCatalog({ file, now: t0, fetchImpl: ok }))!.models)).toContain('claude-small-1');
    expect((fs.statSync(file).mode & 0o777).toString(8)).toBe('600');
    await loadCatalog({ file, now: t0 + 1000, fetchImpl: ok });
    expect(calls).toBe(1);
    const stale = await loadCatalog({ file, now: t0 + CATALOG_TTL_MS + 1, fetchImpl: down });
    expect(stale?.fetchedAt).toBe(t0);
    expect(calls).toBe(2);
    await loadCatalog({ file, now: t0 + CATALOG_TTL_MS + 2, fetchImpl: down });
    expect(calls).toBe(2);
    expect(readCatalog(path.join(tmp(), 'missing.json'))).toBeUndefined();
  });
});

describe('model purposes', () => {
  const opus = m('p', 'opus', 4, 20);
  const sonnet = m('p', 'sonnet', 2, 10);
  const haiku = m('p', 'haiku', 0.1, 0.5);

  it('small is the cheapest capable model, medium the dearest below the parent when there are two', () => {
    expect(resolveTier('small', [opus, sonnet, haiku], opus)).toBe(haiku);
    expect(resolveTier('medium', [opus, sonnet, haiku], opus)).toBe(sonnet);
    expect(resolveTier('small', [sonnet, haiku], sonnet)).toBe(haiku);
    expect(resolveTier('medium', [sonnet, haiku], sonnet)).toBeUndefined();
    expect(resolveTier('small', [haiku], haiku)).toBeUndefined();
    expect(resolveTier('small', [opus, haiku], undefined)).toBeUndefined();
  });

  it('skips models that cannot call tools, lack images the parent takes, or have a small window; prefers the parent provider', () => {
    const catalog = indexCatalog(api, 1);
    const embed = m('reseller', 'embed-1', 0.01, 0);
    const textOnly = m('p', 'text', 0.05, 0.2, { input: ['text'] });
    const tiny = m('p', 'tiny', 0.02, 0.1, { contextWindow: 32_000 });
    expect(resolveTier('small', [opus, haiku, embed, textOnly, tiny], opus, catalog)).toBe(haiku);
    const otherCheap = m('q', 'cheaper', 0.01, 0.05);
    expect(resolveTier('small', [opus, haiku, otherCheap], opus)).toBe(haiku);
    expect(resolveTier('small', [opus, otherCheap], opus)).toBe(otherCheap);
  });

  it('fills a missing price from models.dev, and stays on the parent when its own price is unknown', () => {
    const catalog = indexCatalog(api, 1);
    const unpriced = { provider: 'reseller', id: 'claude-small-1', contextWindow: 200_000 };
    expect(resolveTier('small', [opus, unpriced], opus, catalog)).toBe(unpriced);
    expect(resolveTier('small', [opus, unpriced], opus)).toBeUndefined();
    // A provider models.dev does not list (a local runtime) never borrows a cloud price through the bare id.
    const local = { provider: 'ollama-local', id: 'claude-small-1', contextWindow: 200_000, cost: { input: 0, output: 0 } };
    expect(resolveTier('small', [opus, local], opus, catalog)).toBeUndefined();
    expect(resolveTier('small', [haiku], { provider: 'x', id: 'mystery' })).toBeUndefined();
  });

  it('keeps each family to its newest release, skips deprecated and stale models, and prefers the parent lab', () => {
    const fam = (id: string, family: string, released: string, input: number, extra: Record<string, unknown> = {}) => [id, { tool_call: true, family, release_date: released, limit: { context: 400_000 }, modalities: { input: ['text', 'image'] }, cost: { input, output: input * 5 }, canonical_model_id: `lab-a/${id}`, ...extra }];
    const catalog = indexCatalog({ router: { models: Object.fromEntries([
      fam('top-2', 'top', '2026-09-01', 5),
      fam('top-1', 'top', '2026-03-01', 2),
      fam('mid-2', 'mid', '2026-08-01', 1),
      fam('mid-1', 'mid', '2026-01-01', 0.8),
      fam('mini-2', 'mini', '2026-08-01', 0.2),
      fam('mini-old', 'mini-legacy', '2023-01-01', 0.05),
      fam('gone', 'gone', '2026-09-01', 0.01, { status: 'deprecated' }),
      ['other-cheap', { tool_call: true, family: 'x', release_date: '2026-09-01', limit: { context: 400_000 }, modalities: { input: ['text', 'image'] }, cost: { input: 0.01, output: 0.05 }, canonical_model_id: 'lab-b/other-cheap' }],
    ]) } }, 1);
    const all = ['top-2', 'top-1', 'mid-2', 'mid-1', 'mini-2', 'mini-old', 'gone', 'other-cheap'].map((id) => ({ provider: 'router', id }));
    const parent = all[0]!;
    expect(resolveTier('small', all, parent, catalog)?.id).toBe('mini-2');
    expect(resolveTier('medium', all, parent, catalog)?.id).toBe('mid-2');
    // Only an older generation of a family, and only that: it is still better than staying on the parent.
    expect(resolveTier('small', [parent, all[5]!], parent, catalog)?.id).toBe('mini-old');
  });

  it('never makes medium a near-copy of the parent', () => {
    const near = m('p', 'near', 3.5, 18);
    expect(resolveTier('medium', [opus, near, haiku], opus)).toBeUndefined();
    expect(resolveTier('medium', [opus, near, sonnet, haiku], opus)).toBe(sonnet);
  });

  it('takes medium from the next tier down: Sonnet alone under Opus, never Haiku under Sonnet', () => {
    expect(resolveTier('medium', [opus, sonnet], opus)).toBe(sonnet);
    expect(resolveTier('small', [opus, sonnet], opus)).toBe(sonnet);
    expect(resolveTier('medium', [sonnet, haiku], sonnet)).toBeUndefined();
  });

  it('keeps a thinking suffix on a purpose, and lets the agent call name a purpose', () => {
    expect(routeModel({ preferred: 'small:high', available: [opus, haiku], parent: opus })).toEqual({ model: 'p/haiku:high' });
    expect(routeModel({ preferred: 'medium:low', available: [opus], parent: opus })).toEqual({ model: 'p/opus:low' });
    expect(routeModel({ explicit: 'small', available: [opus, haiku], parent: opus })).toEqual({ model: 'p/haiku' });
  });

  it('routes a profile purpose to its model, or to the parent with no cheaper candidate', () => {
    expect(routeModel({ preferred: 'small', available: [opus, sonnet, haiku], parent: opus })).toEqual({ model: 'p/haiku' });
    expect(routeModel({ preferred: 'medium', available: [sonnet, haiku], parent: sonnet })).toEqual({ model: 'p/sonnet' });
  });

  it('lists models cheapest first with the purposes and profiles', () => {
    const text = describeModels([opus, haiku, sonnet], opus, new Map([['researcher', { name: 'researcher', model: 'small' } as never]]), indexCatalog(api, 1));
    const lines = text.split('\n');
    expect(lines[1]).toMatch(/^ {2}p\/haiku · \$0\.10\/\$0\.50 per M in\/out · 200k · tools, images/);
    expect(lines[3]).toMatch(/^● p\/opus/);
    expect(text).toContain('small: p/haiku');
    expect(text).toContain('medium: p/sonnet');
    expect(text).toContain('researcher: p/haiku (small, a purpose)');
    expect(describeModels([], undefined, new Map(), undefined)).toBe('No models are configured.');
  });
});
