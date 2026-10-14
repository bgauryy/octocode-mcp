import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@earendil-works/pi-tui';
import { contextBar, footerLines, SUBAGENTS_STATUS, type FooterState } from '../src/ui/footer.js';
import { QUEUED_STATUS } from '../src/ui/delivery.js';
import { statusColor } from '../src/shared/render.js';
import { chipText } from '../src/permission/mode.js';

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as never;
/** Records which colour token painted which text. */
const painted: Array<[string, string]> = [];
const recording = { fg: (color: string, text: string) => (painted.push([color, text]), text), bold: (text: string) => text } as never;

const state: FooterState = {
  model: 'claude-opus-5-5',
  thinking: 'high',
  context: { percent: 42, limit: 200_000 },
  usage: { input: 12_400, cacheRead: 0, output: 3_100, cost: 0.84, unpriced: false },
  cwd: '/Users/me/code/app',
  home: '/Users/me',
  sessionName: 'fix login',
};
const statuses = new Map([
  ['mcp', 'mcp 3/3'],
  ['octocode-team', 'agents 1/2 ↑1k ↓2k'],
  ['octocode-bash', '1 bash job'],
  ['octocode-permission', '⏸ permission: manual · Shift+Tab'],
  ['octocode-speed', '58 tok/s'],
  ['other-ext', 'lint ok'],
]);

describe('footer', () => {
  it('shows the model, context, mode and running work first, and where you are second', () => {
    const [top, bottom] = footerLines(state, 'main', statuses, theme, 170);
    expect(top).toMatch(/^claude-opus-5-5 · ⏸ permission: manual · Shift\+Tab · high · ctx ▰▰▰▱▱▱▱▱ 42% of 200k · agents 1\/2 ↑1k ↓2k · 1 bash job +58 tok\/s · ≈\$0\.84$/);
    expect(bottom).toBe('~/code/app ⎇ main · fix login · ↑12.4k ↓3.1k · mcp 3/3 · lint ok');
    expect(visibleWidth(top!)).toBe(170);
  });

  it('colours context by how full it is', () => {
    expect(contextBar(30)).toEqual({ bar: '▰▰▱▱▱▱▱▱', color: 'success' });
    expect(contextBar(65).color).toBe('warning');
    expect(contextBar(91).color).toBe('error');
    painted.length = 0;
    footerLines({ ...state, context: { percent: 91, limit: 200_000 } }, 'main', statuses, recording, 160);
    expect(painted.some(([color, text]) => color === 'error' && text.includes('91%'))).toBe(true);
  });

  it('draws a session name without its escape sequences', () => {
    const [, bottom] = footerLines({ ...state, sessionName: 'fix \u001b]0;pwned\u0007login\u001b[2J' }, null, new Map(), theme, 160);
    expect(bottom).toContain('fix login');
    expect(bottom).not.toContain('\u001b');
  });

  it("keeps another extension's multi-line status on one row, as Pi's own footer does", () => {
    const [, bottom] = footerLines(state, null, new Map([['mcp', 'MCP:\n 3 servers\t ok']]), theme, 160);
    expect(bottom).toContain('MCP: 3 servers ok');
    expect(bottom).not.toMatch(/[\r\n\t]/);
  });

  it('keeps raw model, directory, branch and session text on their own rows', () => {
    const dirty = (value: string) => `${value}\nnext\tpart\u2028last\u001b[2J`;
    const lines = footerLines({ ...state, model: dirty('model'), cwd: dirty('/work/app'), thinking: dirty('high'), sessionName: dirty('session') }, dirty('main'), new Map(), theme, 400);
    expect(lines[0]).toContain('model next part last');
    expect(lines[1]).toContain('/work/app next part last');
    expect(lines[1]).toContain('session next part last');
    for (const line of lines) expect(line).not.toMatch(/[\r\n\t\u2028\u2029\u001b]/);
  });

  it('reserves the permission mode when model names and running-work statuses exceed the row', () => {
    const long = { ...state, model: 'provider/'.repeat(40) };
    const busy = new Map([...statuses, ['octocode-team', 'agents '.repeat(40)]]);
    const [normal] = footerLines(long, null, statuses, theme, 170);
    expect(normal).toContain('permission: manual · Shift+Tab');
    for (const width of [75, 40, 26, 20, 10]) {
      const lines = footerLines(long, null, busy, theme, width);
      expect(lines[0], `mode at ${width} columns`).toContain('manual');
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    }
    for (const width of [0, 1, 4, 8]) {
      expect(footerLines(long, null, busy, theme, width).every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  });

  it('says so when context is unknown (right after compaction) and hides empty parts', () => {
    const [top, bottom] = footerLines({ ...state, thinking: undefined, context: { percent: null, limit: 200_000 }, usage: { input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false }, sessionName: undefined }, null, new Map(), theme, 120);
    expect(top).toBe('claude-opus-5-5 · ctx ? of 200k');
    expect(bottom).toBe('~/code/app');
  });

  it('drops the least important parts first on narrow terminals, never the model, context, permission mode or running work', () => {
    const [top, bottom] = footerLines(state, 'feature/a-very-long-branch-name-for-testing', new Map([...statuses, ['other-ext', 'lint ok · 12 warnings in 4 files']]), theme, 75);
    expect(visibleWidth(top!)).toBeLessThanOrEqual(75);
    expect(visibleWidth(bottom!)).toBeLessThanOrEqual(75);
    expect(bottom).toContain('feature/a-very-long-bran…');
    for (const kept of ['claude-opus-5-5', '42%', 'manual', 'agents 1/2', '1 bash job']) expect(top).toContain(kept);
    expect(top).not.toContain('tok/s');
    expect(bottom).not.toContain('lint ok');
    // At 40 columns the mode chip is still there, in its short form (just the mode).
    const [narrow] = footerLines({ ...state, context: undefined }, 'main', new Map([['octocode-permission', '⏵⏵ permission: full · Shift+Tab']]), theme, 40);
    expect(narrow).toMatch(/^claude-opus-5-5 · ⏵⏵ full/);
    const [squeezed] = footerLines({ ...state, context: undefined, thinking: undefined }, 'main', new Map([['octocode-permission', '⏸ permission: manual · Shift+Tab']]), theme, 26);
    expect(squeezed).toBe('claude-opus-5-5 · ⏸ manual');
    const tiny = footerLines(state, 'main', statuses, theme, 20);
    expect(tiny.every((line) => visibleWidth(line) <= 20)).toBe(true);
  });
});

describe('footer line 1 work statuses', () => {
  it('keeps queued messages and background subagents on line 1 when other parts drop', () => {
    const work = new Map([...statuses, [QUEUED_STATUS, '✉ 2 queued'], [SUBAGENTS_STATUS, '2 subagents']]);
    const [wide, bottom] = footerLines(state, 'main', work, theme, 200);
    expect(wide).toContain('2 subagents');
    expect(wide).toContain('✉ 2 queued');
    expect(bottom).not.toContain('queued');
    const [narrow] = footerLines(state, 'main', work, theme, 90);
    expect(narrow).toContain('✉ 2 queued');
    expect(narrow).not.toContain('tok/s');
  });

  it('repaints statusColor statuses with the theme of the frame', () => {
    const before = { fg: (color: string, text: string) => `[before ${color}]${text}` };
    const queued = statusColor({ mode: 'tui', ui: { theme: before } } as never, 'accent', '✉ 1 queued');
    const after = { fg: (color: string, text: string) => (color === 'accent' ? `[after]${text}` : text), bold: (text: string) => text } as never;
    const [top] = footerLines(state, null, new Map([[QUEUED_STATUS, queued]]), after, 200);
    expect(top).toContain('[after]✉ 1 queued');
    expect(top).not.toContain('[before');
  });

  it('gives a long branch a third of the row', () => {
    const branch = `feature/${'x'.repeat(80)}`;
    expect(footerLines(state, branch, new Map(), theme, 240)[1]).toContain(`${branch.slice(0, 79)}…`);
  });
});

describe('footer wiring', () => {
  it('replaces Pi\'s footer, sums the session usage and samples context on events', async () => {
    const { fakeCtx, fakePi } = await import('./fake-pi.js');
    const { registerFooter } = await import('../src/ui/footer.js');
    const fake = fakePi();
    (fake.pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel = () => 'medium';
    // No compaction reserve: the gauge reads against the whole window.
    (fake.pi as unknown as { getSettings: () => unknown }).getSettings = () => ({ compaction: { reserveTokens: 0 } });
    registerFooter(fake.pi);
    const ctx = fakeCtx({ cwd: '/work/app' }) as unknown as Record<string, any>;
    let percent = 10;
    ctx['model'] = { id: 'model-x', reasoning: true, contextWindow: 100_000 };
    ctx['getContextUsage'] = () => ({ tokens: percent * 1000, contextWindow: 100_000, percent });
    ctx['sessionManager'].getEntries = () => [
      { type: 'message', message: { role: 'assistant', usage: { input: 1_000, cacheRead: 3_000, output: 200, cost: { total: 0.1 } } } },
      { type: 'message', message: { role: 'toolResult', usage: { input: 500, output: 50, cost: { total: 0.05 } } } },
      { type: 'message', message: { role: 'user' } },
    ];
    await fake.emit('session_start', {}, ctx);
    let renders = 0;
    const data = { getGitBranch: () => 'main', getExtensionStatuses: () => new Map([['mcp', 'mcp 1/1']]), onBranchChange: () => () => undefined };
    const component = ctx['ui'].footer({ requestRender: () => (renders += 1) }, theme, data);
    let [top, bottom] = component.render(120) as string[];
    expect(top).toMatch(/^model-x · medium · ctx ▱{8} 10% of 100k +≈\$0\.15$/);
    // ↑ is the whole prompt (uncached, cache reads and writes), with the share read from cache.
    expect(bottom).toBe('/work/app ⎇ main · ↑4.5k (67% cached) ↓250 · mcp 1/1');
    percent = 64;
    await fake.emit('message_end', { message: { role: 'assistant', usage: { input: 100, output: 10, cost: { total: 0.01 } } } }, ctx);
    expect(renders).toBe(1);
    [top] = component.render(120) as string[];
    expect(top).toContain('64%');
    expect(top).toContain('≈$0.16');
    // A rename (/name, or the automatic title) shows at once.
    let name: string | undefined;
    ctx['sessionManager'].getSessionName = () => name;
    name = 'auth flow';
    await fake.emit('session_info_changed', { type: 'session_info_changed', name }, ctx);
    expect(renders).toBe(2);
    expect((component.render(120) as string[]).join('\n')).toContain('auth flow');
    component.dispose();
    await fake.emit('agent_end', {}, ctx);
    expect(renders).toBe(2);
  });

  it('rebuilds the footer only when an input changed, samples context on replies and tree moves, not on tool results', async () => {
    const { fakeCtx, fakePi } = await import('./fake-pi.js');
    const { registerFooter } = await import('../src/ui/footer.js');
    const fake = fakePi();
    (fake.pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel = () => 'medium';
    // No compaction reserve: the gauge reads against the whole window.
    (fake.pi as unknown as { getSettings: () => unknown }).getSettings = () => ({ compaction: { reserveTokens: 0 } });
    registerFooter(fake.pi);
    const ctx = fakeCtx({ cwd: '/work/app' }) as unknown as Record<string, any>;
    let percent = 10;
    let samples = 0;
    ctx['model'] = { id: 'model-x', reasoning: false, contextWindow: 100_000 };
    ctx['getContextUsage'] = () => ((samples += 1), { tokens: percent * 1000, contextWindow: 100_000, percent });
    ctx['sessionManager'].getEntries = () => [];
    await fake.emit('session_start', {}, ctx);
    let statuses = new Map([['mcp', 'mcp 1/1']]);
    const data = { getGitBranch: () => 'main', getExtensionStatuses: () => statuses, onBranchChange: () => () => undefined };
    const component = ctx['ui'].footer({ requestRender: () => undefined }, theme, data);
    const first = component.render(120);
    // Every streamed token repaints the footer: unchanged inputs reuse the lines.
    expect(component.render(120)).toBe(first);
    expect(component.render(100)).not.toBe(first);
    statuses = new Map([['mcp', 'mcp 2/2']]);
    expect((component.render(120) as string[]).join('\n')).toContain('mcp 2/2');
    const counted = samples;
    // A subagent's tool result adds its cost without walking the session for context usage.
    await fake.emit('message_end', { message: { role: 'toolResult', usage: { input: 10, output: 1, cost: { total: 0.02 } } } }, ctx);
    expect(samples).toBe(counted);
    expect((component.render(120) as string[])[0]).toContain('≈$0.02');
    expect((component.render(120) as string[])[0]).not.toContain('n/a');
    // A subagent that ran partly on a model without pricing (priced cost > 0) still marks the total.
    await fake.emit('message_end', { message: { role: 'toolResult', usage: { input: 10, output: 1, cost: { total: 0.02 } }, details: { unpriced: true } } }, ctx);
    expect((component.render(120) as string[])[0]).toContain('≈$0.04 + n/a');
    await fake.emit('message_end', { message: { role: 'user' } }, ctx);
    expect(samples).toBe(counted);
    // Moving in the session tree (/tree) changes the context: sampled again.
    percent = 42;
    await fake.emit('session_tree', {}, ctx);
    expect(samples).toBe(counted + 1);
    expect((component.render(120) as string[])[0]).toContain('42%');
    component.invalidate();
    expect(component.render(120)).not.toBe(first);
  });

  it('reads the gauge against the auto-compaction point and counts background subagent reports in the cost', async () => {
    const { fakeCtx, fakePi } = await import('./fake-pi.js');
    const { registerFooter } = await import('../src/ui/footer.js');
    const fake = fakePi();
    (fake.pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel = () => 'off';
    // A 1M window that compacts at 200k: the per-model reserve wins over the global one.
    (fake.pi as unknown as { getSettings: () => unknown }).getSettings = () => ({ compaction: { reserveTokens: 40_000, modelOverrides: { 'gw/big': { reserveTokens: 800_000 } } } });
    registerFooter(fake.pi);
    const ctx = fakeCtx({ cwd: '/work/app' }) as unknown as Record<string, any>;
    ctx['model'] = { provider: 'gw', id: 'big', reasoning: false, contextWindow: 1_000_000 };
    ctx['getContextUsage'] = () => ({ tokens: 150_000, contextWindow: 1_000_000, percent: 15 });
    // A background report saved in the session (a custom_message entry) counts, as one that arrives later does.
    const report = (cost: number) => ({ usage: { input: 1_000, cacheRead: 9_000, cacheWrite: 0, output: 100, cost: { total: cost } }, unpriced: false });
    ctx['sessionManager'].getEntries = () => [{ type: 'custom_message', customType: 'octocode-agent-result', details: report(1.5) }];
    await fake.emit('session_start', {}, ctx);
    const data = { getGitBranch: () => null, getExtensionStatuses: () => new Map(), onBranchChange: () => () => undefined };
    const component = ctx['ui'].footer({ requestRender: () => undefined }, theme, data);
    let [top, bottom] = component.render(120) as string[];
    expect(top).toContain('75% of 200k');
    expect(top).toContain('≈$1.50');
    expect(bottom).toContain('↑10k (90% cached)');
    await fake.emit('message_end', { message: { role: 'custom', customType: 'octocode-agent-result', details: report(0.5) } }, ctx);
    // A custom message without usage (a team message) adds nothing.
    await fake.emit('message_end', { message: { role: 'custom', customType: 'octocode-agent-message', details: { id: 'x' } } }, ctx);
    [top, bottom] = component.render(120) as string[];
    expect(top).toContain('≈$2.00');
    expect(bottom).toContain('↑20k');
  });

  it('marks usage from a model without pricing instead of counting it as free, and says so once', async () => {
    const { fakeCtx, fakePi } = await import('./fake-pi.js');
    const { registerFooter } = await import('../src/ui/footer.js');
    const fake = fakePi();
    (fake.pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel = () => 'off';
    registerFooter(fake.pi);
    const ctx = fakeCtx({ cwd: '/work/app' }) as unknown as Record<string, any>;
    const rates = (rate: number) => ({ cost: { input: rate, output: rate, cacheRead: rate, cacheWrite: rate } });
    ctx['modelRegistry'] = { find: (provider: string) => (provider === 'local' ? rates(0) : rates(3)) };
    ctx['model'] = { id: 'llama', reasoning: false, contextWindow: 100_000 };
    ctx['getContextUsage'] = () => ({ tokens: 1000, contextWindow: 100_000, percent: 1 });
    await fake.emit('session_start', {}, ctx);
    const data = { getGitBranch: () => null, getExtensionStatuses: () => new Map(), onBranchChange: () => () => undefined };
    const component = ctx['ui'].footer({ requestRender: () => undefined }, theme, data);
    const free = { role: 'assistant', provider: 'local', model: 'llama', usage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } };
    await fake.emit('message_end', { message: free }, ctx);
    expect((component.render(120) as string[])[0]).toMatch(/ +cost n\/a$/);
    await fake.emit('message_end', { message: { ...free, provider: 'anthropic', model: 'opus', usage: { ...free.usage, cost: { total: 2.28 } } } }, ctx);
    expect((component.render(120) as string[])[0]).toMatch(/ +≈\$2\.28 \+ n\/a$/);
    await fake.emit('message_end', { message: free }, ctx);
    expect(ctx['ui'].notes).toEqual([{ message: 'local/llama has no pricing in models.json; its usage is not in the cost', type: 'warning' }]);
    // A new session warns again.
    await fake.emit('session_start', {}, ctx);
    await fake.emit('message_end', { message: free }, ctx);
    expect(ctx['ui'].notes).toHaveLength(2);
  });

  it('says once when the model leaves out the reasoning its built-in twin declares', async () => {
    const { fakeCtx, fakePi } = await import('./fake-pi.js');
    const { registerFooter, reasoningTwin } = await import('../src/ui/footer.js');
    const builtIn = { provider: 'anthropic', id: 'claude-opus-5-5', reasoning: true, compat: { forceAdaptiveThinking: true } };
    const copy = { provider: 'proxy', id: 'claude-opus-5-5', reasoning: undefined, compat: {} };
    expect(reasoningTwin(copy as never, [copy, builtIn] as never)).toBe(builtIn);
    expect(reasoningTwin(builtIn as never, [copy, builtIn] as never)).toBeUndefined();
    expect(reasoningTwin({ ...copy, id: 'llama' } as never, [copy, builtIn] as never)).toBeUndefined();
    const fake = fakePi();
    (fake.pi as unknown as { getThinkingLevel: () => string }).getThinkingLevel = () => 'off';
    registerFooter(fake.pi);
    const ctx = fakeCtx({ cwd: '/work/app' }) as unknown as Record<string, any>;
    ctx['modelRegistry'] = { getAll: () => [copy, builtIn], find: () => undefined };
    ctx['model'] = { ...copy, contextWindow: 200_000 };
    ctx['getContextUsage'] = () => undefined;
    await fake.emit('session_start', {}, ctx);
    await fake.emit('model_select', {}, ctx);
    expect(ctx['ui'].notes).toEqual([{ message: 'proxy/claude-opus-5-5 does not declare reasoning in models.json, so Pi never asks it to think. anthropic/claude-opus-5-5 declares it: add "reasoning": true and "compat": { "forceAdaptiveThinking": true } to its entry.', type: 'warning' }]);
  });

  it('counts what full ran in the chip, and keeps the count in the short form', () => {
    expect(chipText('full')).toBe('⏵⏵ permission: full · Shift+Tab');
    expect(chipText('full', { actions: 0, warnings: 0 })).toBe('⏵⏵ permission: full · Shift+Tab');
    expect(chipText('full', { actions: 1, warnings: 0 })).toBe('⏵⏵ permission: full · 1 action · Shift+Tab');
    expect(chipText('full', { actions: 12, warnings: 2 })).toBe('⏵⏵ permission: full · 12 actions · 2 ⚠ · Shift+Tab');
    expect(chipText('workspace', { actions: 12, warnings: 2 })).toBe('permission: workspace · Shift+Tab');
    const counted = new Map([['octocode-permission', chipText('full', { actions: 12, warnings: 2 })]]);
    const [narrow] = footerLines({ ...state, context: undefined }, 'main', counted, theme, 44);
    expect(narrow).toContain('⏵⏵ full · 12 actions · 2 ⚠');
    expect(narrow).not.toContain('permission:');
  });
});
