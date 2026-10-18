import { describe, expect, it, vi } from 'vitest';
import { rgbColor, styleText, visibleWidth } from '@earendil-works/pi-tui';
import { bannerHeader, packageVersion, registerUi, spinnerFrames, themeRamp, tokensPerSecond } from '../src/ui/chrome.js';
import { BANNER_HEIGHT } from '../src/ui/banner.js';
import { fakeCtx, fakePi, theme } from './fake-pi.js';
import { toolHeader } from '../src/shared/render.js';

/** A theme with concrete colours, styled as a truecolor terminal would be. */
const colorTheme = {
  ...(theme as object),
  appearance: 'dark',
  colors: { accent: rgbColor(192, 132, 252), borderAccent: rgbColor(167, 139, 250), mdLink: rgbColor(165, 180, 252), syntaxOperator: rgbColor(94, 234, 212), dim: rgbColor(139, 148, 158), text: rgbColor(230, 237, 243) },
  style: (text: string, options: Parameters<typeof styleText>[1]) => styleText(text, options, 'truecolor'),
} as never;

describe('chrome', () => {
  it('computes output tokens per second of streaming time', () => {
    expect(tokensPerSecond(400, 4_000)).toBe(100);
    expect(tokensPerSecond(0, 1_000)).toBeUndefined();
    expect(tokensPerSecond(400, 0)).toBeUndefined();
  });

  it('dresses the TUI once per session start: banner header, footer, spinner, thinking label; speed after a run', async () => {
    const fake = fakePi();
    registerUi(fake.pi, false);
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect([...fake.handlers.keys()]).toEqual(expect.arrayContaining(['agent_end', 'agent_start', 'message_end', 'message_start', 'session_start']));

    const ctx = fakeCtx({ cwd: '/work/app' });
    await fake.emit('session_start', { reason: 'startup' }, ctx);
    expect(typeof ctx.ui.header).toBe('function');
    expect(ctx.ui.footer).toBeDefined();
    expect((ctx.ui as never as { indicator: { frames: string[] } }).indicator.frames).toHaveLength(10);
    expect((ctx.ui as never as { thinkingLabel: string }).thinkingLabel).toContain('Thinking');
    const requestRender = vi.fn();
    const header = (ctx.ui.header as (tui: unknown, theme: unknown) => { render(width: number): string[]; dispose(): void })({ requestRender }, theme);
    const lines = header.render(120);
    expect(lines).toHaveLength(BANNER_HEIGHT);
    expect(lines[0]).toContain('██');
    expect(lines.join('\n')).toContain(`v${packageVersion()}`);
    header.dispose();
    // Nothing goes into the session, so /resume and /fork never replay it.
    expect(fake.entries).toEqual([]);

    const now = vi.spyOn(Date, 'now');
    await fake.emit('agent_start', {}, ctx);
    now.mockReturnValue(1_000);
    await fake.emit('message_start', { message: { role: 'assistant' } }, ctx);
    await fake.emit('message_start', { message: { role: 'user' } }, ctx);
    now.mockReturnValue(3_000);
    await fake.emit('message_end', { message: { role: 'assistant', usage: { output: 100 } } }, ctx);
    await fake.emit('message_end', { message: { role: 'assistant', usage: { output: 999 } } }, ctx);
    now.mockRestore();
    await fake.emit('agent_end', { messages: [] }, ctx);
    expect(ctx.ui.statuses.get('octocode-speed')).toBe('50 tok/s');
    await fake.emit('agent_end', { messages: [] }, fakeCtx({ cwd: '/x', hasUI: false }));

    // Print and RPC modes get no header.
    const rpc = fakeCtx({ cwd: '/work/app', mode: 'rpc' });
    await fake.emit('session_start', { reason: 'startup' }, rpc);
    expect(rpc.ui.header).toBeUndefined();

    // Subagents get no chrome at all.
    const child = fakePi();
    registerUi(child.pi, true);
    expect(child.handlers.size).toBe(0);
  });

  it('repaints the spinner and thinking label when a theme switch invalidates the header, and stops row clocks at run end', async () => {
    const fake = fakePi();
    registerUi(fake.pi, false);
    const ctx = fakeCtx({ cwd: '/work/app' });
    await fake.emit('session_start', { reason: 'resume' }, ctx);
    const ui = ctx.ui as never as { thinkingLabel: string; theme: unknown };
    ui.theme = { ...(theme as object), fg: (color: string, text: string) => `<${color}>${text}` };
    const header = (ctx.ui.header as (tui: unknown, theme: unknown) => { invalidate(): void; dispose(): void })({ requestRender: vi.fn() }, theme);
    expect(ui.thinkingLabel).not.toContain('<thinkingText>');
    header.invalidate();
    expect(ui.thinkingLabel).toContain('<thinkingText>');
    header.dispose();

    vi.useFakeTimers();
    try {
      const invalidate = vi.fn();
      toolHeader(theme, { executionStarted: true, isPartial: true, state: {}, invalidate }, 'Bash', 'x');
      // Positive control: while the call runs, its clock asks for a repaint; only agent_end stops it.
      vi.advanceTimersByTime(1_000);
      expect(invalidate).toHaveBeenCalled();
      invalidate.mockClear();
      await fake.emit('agent_end', { messages: [] }, ctx);
      vi.advanceTimersByTime(3_000);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shines the banner only on a fresh startup, never on /resume, /new, /fork, /reload or over a resumed transcript', async () => {
    const frames = async (reason: string, branch: unknown[] = []): Promise<number> => {
      // Pi re-imports extensions for every runtime, so each session start meets fresh module state.
      const fake = fakePi();
      registerUi(fake.pi, false);
      const ctx = fakeCtx({ cwd: '/work/app' });
      ctx.sessionManager.getBranch = () => branch as never;
      await fake.emit('session_start', { reason }, ctx);
      const requestRender = vi.fn();
      const header = (ctx.ui.header as (tui: unknown, theme: unknown) => { dispose(): void })({ requestRender }, colorTheme);
      await new Promise((resolve) => setTimeout(resolve, 120));
      header.dispose();
      return requestRender.mock.calls.length;
    };
    expect(await frames('startup')).toBeGreaterThan(0);
    // `pi -c`: the history renders first, so the banner sits above the viewport and a frame would redraw everything.
    expect(await frames('startup', [{ type: 'message' }])).toBe(0);
    for (const reason of ['resume', 'new', 'fork', 'reload']) expect(await frames(reason)).toBe(0);
  });

  it('paints the banner and spinner along the theme gradient, and falls back to tokens without concrete colours', () => {
    expect(themeRamp(theme)).toBeUndefined();
    expect(spinnerFrames(theme)[0]).toBe('⠋');
    const ramp = themeRamp(colorTheme)!;
    expect(ramp(0, 'stroke', 0, 'x')).toMatch(/\u001b\[[0-9;]*1[;m].*x/);
    expect(ramp(0, 'stroke', 0, 'x')).not.toBe(ramp(1, 'stroke', 0, 'x'));
    expect(ramp(0.5, 'shadow', 0, 'x')).not.toBe(ramp(0.5, 'stroke', 0, 'x'));
    expect(ramp(0.5, 'stroke', 1, 'x')).not.toBe(ramp(0.5, 'stroke', 0, 'x'));
    expect(new Set(spinnerFrames(colorTheme)).size).toBe(10);
  });

  it('sweeps a light band across the banner once, then stops redrawing', () => {
    vi.useFakeTimers();
    try {
      const requestRender = vi.fn();
      const header = bannerHeader({ requestRender }, colorTheme, Date.now());
      const first = header.render(120);
      vi.advanceTimersByTime(500);
      expect(requestRender).toHaveBeenCalled();
      expect(header.render(120)).not.toEqual(first);
      vi.advanceTimersByTime(2_000);
      const settled = header.render(120);
      const calls = requestRender.mock.calls.length;
      vi.advanceTimersByTime(1_000);
      expect(requestRender.mock.calls.length).toBe(calls);
      expect(header.render(120)).toEqual(settled);
      expect(settled.every((line) => visibleWidth(line) <= 120)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('repaints the banner in the new colours after invalidate (a theme change)', () => {
    const live = { ...(colorTheme as object), colors: { ...(colorTheme as { colors: object }).colors } } as { colors: Record<string, unknown> };
    const header = bannerHeader({ requestRender: vi.fn() }, live as never, undefined);
    const before = header.render(120);
    live.colors = { ...live.colors, accent: rgbColor(255, 0, 0), borderAccent: rgbColor(255, 0, 0), mdLink: rgbColor(255, 0, 0), syntaxOperator: rgbColor(255, 0, 0) };
    header.invalidate();
    const after = header.render(120);
    expect(after).not.toEqual(before);
    expect(after.join('\n')).toContain('255;0;0');
  });
});
