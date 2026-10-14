import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration } from '../src/shared/format.js';
import { appKey, clip, expandKey, livePaint, plural, queryTarget, resultBlock, statusColor, stopRowTimers, timed, timedTool, timingOf, toolHeader, type ToolRow } from '../src/shared/render.js';
import { recordCheck } from '../src/shared/locks.js';
import { visibleWidth } from '@earendil-works/pi-tui';
import { rendered, theme } from './fake-pi.js';

const row = (overrides: Record<string, unknown> = {}) => ({ state: {} as ToolRow, invalidate: vi.fn(), executionStarted: false, isPartial: true, isError: false, expanded: false, ...overrides });

afterEach(() => vi.useRealTimers());

describe('format helpers', () => {
  it.each([
    [0, '0ms'],
    [850, '850ms'],
    [1_200, '1.2s'],
    [9_400, '9.4s'],
    [59_000, '59s'],
    [65_000, '1m05s'],
    [900_000, '15m'],
    [3_780_000, '1h03m'],
    [7_200_000, '2h'],
    [-5, '0ms'],
  ])('formatDuration(%d, true) = %s', (ms, text) => expect(formatDuration(ms, true)).toBe(text));

  it('pluralizes, clips and falls back to ctrl+o for the expand key', () => {
    expect(plural(1, 'line')).toBe('1 line');
    expect(plural(2, 'tool use')).toBe('2 tool uses');
    expect(plural(3, 'query', 'queries')).toBe('3 queries');
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('\u001b]0;evil\u0007ok\nsecond', 10)).toBe('ok');
    expect(expandKey()).toMatch(/\S/);
  });

  it('finds the search text of a query before its path', () => {
    expect(queryTarget({ path: '.', searchText: 'add' })).toBe('add in .');
    expect(queryTarget({ owner: 'o', repo: 'r', keywords: ['a', 'b'] })).toBe('o/r a b');
    expect(queryTarget({ owner: 'o', repo: 'r', path: 'src' })).toBe('o/r/src');
    expect(queryTarget({ path: 'src/index.ts' })).toBe('src/index.ts');
  });
});

describe('toolHeader', () => {
  it('shows ○ before execution without a time', () => {
    expect(rendered(toolHeader(theme, row(), 'Bash', 'ls'))).toBe('○ Bash(ls)');
  });

  it('ticks while running and stops the ticker on the final result', () => {
    vi.useFakeTimers();
    const context = row({ executionStarted: true });
    const header = toolHeader(theme, context, 'Bash', 'sleep 2');
    expect(rendered(header)).toBe('● Bash(sleep 2) · 0ms');
    expect(context.state.ticking).toBe(true);
    vi.advanceTimersByTime(2_100);
    expect(context.invalidate).toHaveBeenCalledTimes(2);
    const doneContext = { ...context, isPartial: false, durationMs: 1_900 };
    const done = toolHeader(theme, { ...doneContext, lastComponent: header }, 'Bash', 'sleep 2');
    expect(done).toBe(header);
    expect(rendered(done)).toBe('● Bash(sleep 2) · 1.9s');
    expect(context.state.ticking).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(context.invalidate).toHaveBeenCalledTimes(2);
    expect(rendered(toolHeader(theme, doneContext, 'Bash', 'sleep 2'))).toBe('● Bash(sleep 2) · 1.9s');
  });

  it('ticks only the newest running row: an older row drops its time once and never ticks again', async () => {
    vi.useFakeTimers();
    try {
      const older = row({ executionStarted: true });
      toolHeader(theme, older, 'Bash', 'build');
      vi.advanceTimersByTime(1_100);
      expect(older.invalidate).toHaveBeenCalledTimes(1);
      expect(rendered(toolHeader(theme, older, 'Bash', 'build'))).toBe('● Bash(build) · 1.1s');
      const newer = row({ executionStarted: true });
      toolHeader(theme, newer, 'Read', 'a.ts');
      await Promise.resolve();
      // One redraw to drop the time while the row still sits above the new one; then it stays put.
      expect(older.invalidate).toHaveBeenCalledTimes(2);
      expect(rendered(toolHeader(theme, older, 'Bash', 'build'))).toBe('● Bash(build)');
      vi.advanceTimersByTime(3_000);
      expect(older.invalidate).toHaveBeenCalledTimes(2);
      expect(newer.invalidate).toHaveBeenCalledTimes(3);
      // The newest finishing does not hand the clock back: the older row may have scrolled off by then.
      toolHeader(theme, { ...newer, isPartial: false, durationMs: 3_000 }, 'Read', 'a.ts');
      vi.advanceTimersByTime(3_000);
      expect(older.invalidate).toHaveBeenCalledTimes(2);
      expect(rendered(toolHeader(theme, older, 'Bash', 'build'))).toBe('● Bash(build)');
    } finally {
      stopRowTimers();
      vi.useRealTimers();
    }
  });

  it('says waiting while the call waits for its checks or approval, and starts the clock when its run begins', async () => {
    vi.useFakeTimers();
    try {
      const context = row({ executionStarted: true, toolCallId: 'call-wait' });
      expect(rendered(toolHeader(theme, context, 'Bash', 'ls'))).toBe('○ Bash(ls) · waiting');
      vi.advanceTimersByTime(5_000);
      // Nothing to tick while waiting.
      expect(context.invalidate).not.toHaveBeenCalled();
      expect(rendered(toolHeader(theme, context, 'Bash', 'ls'))).toBe('○ Bash(ls) · waiting');
      const run = timed(async (_id: string) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return { content: [] };
      });
      const done = run('call-wait');
      // The run's start redraws the row at once.
      expect(context.invalidate).toHaveBeenCalledTimes(1);
      expect(rendered(toolHeader(theme, context, 'Bash', 'ls'))).toBe('● Bash(ls) · 0ms');
      await vi.advanceTimersByTimeAsync(2_000);
      await done;
      expect(rendered(toolHeader(theme, context, 'Bash', 'ls'))).toBe('● Bash(ls) · 2.0s');
      // Pi's duration (the run only) matches the live clock.
      expect(rendered(toolHeader(theme, { ...context, isPartial: false, durationMs: 2_000 }, 'Bash', 'ls'))).toBe('● Bash(ls) · 2.0s');
    } finally {
      stopRowTimers();
      vi.useRealTimers();
    }
  });

  it('starts an exclusive tool clock before its lock, as Pi times execute', async () => {
    const tool = timedTool({ name: 't', label: 'T', description: '', parameters: {} as never, execute: async () => ({ content: [], details: {} }) }, { exclusive: true });
    const context = row({ executionStarted: true, toolCallId: 'call-lock' });
    toolHeader(theme, context, 'T', 'x');
    const pending = tool.execute('call-lock', {} as never, undefined, undefined, {} as never);
    expect(rendered(toolHeader(theme, context, 'T', 'x'))).toMatch(/^● T\(x\) · \d+ms$/);
    await pending;
    stopRowTimers();
  });

  it('folds batch sub-lines while collapsed: three, then +N more', () => {
    const sub = Array.from({ length: 10 }, (_, index) => `query ${index}`);
    const collapsed = rendered(toolHeader(theme, row(), 'localSearch', '10 queries', { lines: sub })).split('\n');
    expect(collapsed).toEqual(['○ localSearch(10 queries)', '  query 0', '  query 1', '  query 2', `  … +7 more (${expandKey()} to expand)`]);
    expect(rendered(toolHeader(theme, row({ expanded: true }), 'localSearch', '10 queries', { lines: sub })).split('\n')).toHaveLength(11);
    // Folding one line would not save one.
    expect(rendered(toolHeader(theme, row(), 'x', '4 queries', { lines: sub.slice(0, 4) })).split('\n')).toHaveLength(5);
  });

  it('caches its lines per width until the next set, so pi-tui sees the same strings each frame', () => {
    const header = toolHeader(theme, row(), 'Bash', 'ls');
    const first = header.render(80);
    expect(header.render(80)).toBe(first);
    expect(header.render(60)).not.toBe(first);
    const again = toolHeader(theme, row({ lastComponent: header }), 'Bash', 'pwd');
    expect(again).toBe(header);
    expect(rendered(again)).toBe('○ Bash(pwd)');
  });

  it('marks errors with ✗ and clips to the width while keeping the time', () => {
    const header = toolHeader(theme, row({ isPartial: false, isError: true, durationMs: 1_500 }), 'Web', 'x'.repeat(100), { meta: 'bg' });
    const text = rendered(header, 40);
    expect(text.startsWith('✗ Web(xxx')).toBe(true);
    expect(text.endsWith(') · bg · 1.5s')).toBe(true);
    expect(visibleWidth(text)).toBeLessThanOrEqual(40);
  });

  it('sanitizes the name, summary and sub-lines', () => {
    const text = rendered(toolHeader(theme, row(), 'N\u001b[31m', 'a\u001b]8;;http://x\u0007b', { lines: ['sub'] }));
    expect(text).toBe('○ N(ab)\n  sub');
  });

  it('shows native duration immediately for restored rows without a result-driven redraw', async () => {
    const context = row({ isPartial: false, durationMs: 42 });
    expect(rendered(toolHeader(theme, context, 'Read', 'a.ts'))).toBe('● Read(a.ts) · 42ms');
    resultBlock(theme, context, { summary: 'Read 3 lines' });
    await Promise.resolve();
    expect(context.invalidate).not.toHaveBeenCalled();
  });

  it('does not invent completed durations when Pi has no recorded timing', () => {
    const context = row({ isPartial: false, state: { startedAt: Date.now() - 5_000, durationMs: 42 } });
    expect(rendered(toolHeader(theme, context, 'Read', 'a.ts'))).toBe('● Read(a.ts)');
    expect(rendered(toolHeader(theme, { ...context, durationMs: 0 }, 'Read', 'a.ts'))).toBe('● Read(a.ts) · 0ms');
  });
});

describe('resultBlock', () => {
  const body = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n');

  it('keeps every line within a width narrower than the body indent', () => {
    const block = resultBlock(theme, { expanded: true }, { summary: 'page', body: 'first line\nsecond line' });
    for (const width of [1, 3, 4]) for (const line of block.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
  });

  it('skips blank lines in the collapsed preview but keeps them when expanded', () => {
    const text = '# Title\n\nSource: x\n\n\npara\nmore';
    expect(rendered(resultBlock(theme, {}, { summary: 'page', body: text }))).toBe('  ⎿  page\n     # Title\n     Source: x\n     para\n     … +4 lines (ctrl+o to expand)');
    expect(rendered(resultBlock(theme, { expanded: true }, { summary: 'page', body: text })).split('\n')).toHaveLength(8);
  });

  it('collapses to the summary, three lines and an expand hint', () => {
    expect(rendered(resultBlock(theme, row({ isPartial: false }), { summary: '10 lines', body }))).toBe(
      ['  ⎿  10 lines', '     line 0', '     line 1', '     line 2', `     … +7 lines (${expandKey()} to expand)`].join('\n'),
    );
  });

  it('previews the tail with the hint first', () => {
    expect(rendered(resultBlock(theme, row({ isPartial: false }), { summary: 'exit 0', body, tail: true, max: 2 }))).toBe(
      ['  ⎿  exit 0', `     … +8 lines (${expandKey()} to expand)`, '     line 8', '     line 9'].join('\n'),
    );
  });

  it('shows everything when expanded, wrapped to the width', () => {
    const text = rendered(resultBlock(theme, row({ isPartial: false, expanded: true }), { summary: 's', body: `${body}\n${'y'.repeat(50)}` }), 30);
    expect(text.split('\n')).toHaveLength(1 + 10 + 2);
    expect(text).not.toContain('to expand');
  });

  it('prefixes errors, clips long lines and names the spill file', () => {
    const text = rendered(resultBlock(theme, row({ isPartial: false, isError: true }), { summary: 'exit 1', body: 'z'.repeat(300), spill: '/tmp/out.txt' }), 60);
    const [summary, line, spill] = text.split('\n');
    // Collapsed, the saved path is behind the expand key; expanded it shows, home- or cwd-relative.
    expect(summary).toBe('  ⎿  Error: exit 1 (ctrl+o to expand)');
    expect(visibleWidth(line!)).toBeLessThanOrEqual(60);
    expect(line!.replace(/\u001b\[[0-9;]*m/g, '').endsWith('…')).toBe(true);
    expect(spill).toBeUndefined();
    const open = (spillPath: string, label?: string) => rendered(resultBlock(theme, row({ isPartial: false, expanded: true }), { summary: 'exit 0', body: 'ok', spill: spillPath, ...(label ? { spillLabel: label } : {}) }), 200).split('\n').at(-1);
    expect(open('/tmp/out.txt')).toBe('     saved: /tmp/out.txt');
    expect(open(path.join(os.homedir(), 'x', 'out.txt'), 'log')).toBe(`     log: ~${path.sep}${path.join('x', 'out.txt')}`);
    expect(open(path.join(process.cwd(), 'out.txt'))).toBe('     saved: out.txt');
  });

  it('strips escape sequences from the body and keeps pre-styled lines as given', () => {
    expect(rendered(resultBlock(theme, row(), { summary: 'ok', body: '\u001b[31mred\u001b[0m\n\u202eevil' }))).toBe('  ⎿  ok\n     red\n     evil');
    expect(rendered(resultBlock(theme, row(), { summary: '', lines: ['+ a', '- b'] }))).toBe('  ⎿  + a\n     - b');
  });
});

describe('timed', () => {
  it('leaves results untouched when no pre-run waits were recorded', async () => {
    const plain = { content: [], details: undefined };
    expect(await timed(async () => plain)()).toBe(plain);
    const detailed = { content: [], details: { value: 3 } };
    expect(await timed(async () => detailed)()).toBe(detailed);
  });

  it('lets errors propagate', async () => {
    await expect(timed(async () => Promise.reject(new Error('boom')))()).rejects.toThrow('boom');
  });

  it('adds the check and queue waits recorded for the call id, once', async () => {
    recordCheck('call-wait', 400, Date.now() - 300);
    const run = timed(async (_id: string) => ({ content: [], details: { kept: true } }));
    const first = (await run('call-wait')) as unknown as { details: Record<string, unknown> };
    expect(first.details.checkMs).toBe(400);
    expect(first.details.queuedMs).toBeGreaterThanOrEqual(300);
    expect(first.details['kept']).toBe(true);
    expect(first.details).not.toHaveProperty('durationMs');
    const again = (await run('call-wait')) as unknown as { details: Record<string, unknown> };
    expect(again.details.checkMs).toBeUndefined();
    recordCheck('call-fast', 5);
    const fast = (await run('call-fast')) as unknown as { details: Record<string, unknown> };
    expect(fast.details.checkMs).toBeUndefined();
    expect(fast.details.queuedMs).toBeUndefined();
  });
});

describe('resultBlock colouring', () => {
  it('colours only the lines a collapsed preview shows, and counts the hidden rest', () => {
    let painted = 0;
    const counting = { ...(theme as object), fg: (_color: string, text: string) => ((painted += 1), text) } as never;
    const body = Array.from({ length: 1_000 }, (_, index) => `line ${index}`).join('\n');
    const text = rendered(resultBlock(counting, row({ isPartial: false }), { summary: 'exit 0', body, tail: true }));
    expect(text).toContain('… +997 lines');
    expect(painted).toBeLessThan(10);
    expect(rendered(resultBlock(theme, row({ isPartial: false }), { summary: 'exit 0', body: 'a\nb', totalLines: 50, tail: true }))).toContain('… +48 lines');
  });
});

describe('statusColor', () => {
  it('lets the footer repaint a status in the live theme', () => {
    const old = { fg: (color: string, text: string) => `<old ${color}>${text}` };
    const status = statusColor({ mode: 'tui', ui: { theme: old } } as never, 'accent', '✉ 2 queued');
    expect(status).toBe('<old accent>✉ 2 queued');
    expect(livePaint(status, { fg: (color: string, text: string) => `<new ${color}>${text}` } as never)).toBe('<new accent>✉ 2 queued');
    expect(livePaint('plain', { fg: () => 'x' } as never)).toBe('plain');
    expect(statusColor({ mode: 'rpc', ui: { theme: old } } as never, 'accent', 'x')).toBe('x');
  });
});

describe('timingOf', () => {
  it('reads only waits and combines them with Pi duration in the header', async () => {
    expect(timingOf(undefined)).toEqual({});
    expect(timingOf({ durationMs: 12 })).toEqual({});
    const timing = timingOf({ durationMs: 1200, checkMs: 3400, queuedMs: 150 });
    expect(timing).toEqual({ waits: 'checks 3.4s' });
    const context = { state: {} as ToolRow, isPartial: false, executionStarted: true, durationMs: 900, invalidate: vi.fn() };
    resultBlock(theme, context, { summary: 'ok', ...timing });
    await Promise.resolve();
    expect(context.invalidate).toHaveBeenCalledOnce();
    resultBlock(theme, context, { summary: 'ok', ...timing });
    await Promise.resolve();
    expect(context.invalidate).toHaveBeenCalledOnce();
    const header = rendered(toolHeader(theme, context, 'Tool', 'x'));
    expect(header).toContain('900ms');
    expect(header).not.toContain('1.2s');
    expect(header).toContain('checks 3.4s');
    expect(header).not.toContain('queued');
    const slowQueue = { state: {} as ToolRow, isPartial: false, executionStarted: true };
    resultBlock(theme, slowQueue, { summary: 'ok', ...timingOf({ durationMs: 10, queuedMs: 2000 }) });
    expect(rendered(toolHeader(theme, slowQueue, 'Tool', 'x'))).toContain('queued 2.0s');
  });
});

describe('timedTool', () => {
  it('records the exclusive lock wait without adding an execution duration', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const tool = timedTool({
      name: 't', label: 'T', description: '', parameters: {} as never,
      execute: async (id) => {
        if (id === 'holder') {
          entered();
          await held;
        }
        return { content: [], details: { id } };
      },
    }, { exclusive: true });
    const first = tool.execute('holder', {} as never, undefined, undefined, {} as never);
    await started;
    recordCheck('waiter', 400);
    const second = tool.execute('waiter', {} as never, undefined, undefined, {} as never);
    await vi.advanceTimersByTimeAsync(300);
    release();
    const [, result] = await Promise.all([first, second]);
    expect(result.details).toEqual({ id: 'waiter', checkMs: 400, queuedMs: 300 });
  });

  it('is opt-in on timedTool and never sets the batch-wide sequential mode', async () => {
    let running = 0;
    let peak = 0;
    const tool = (exclusiveCalls: boolean) =>
      timedTool({ name: 't', label: 'T', description: '', parameters: {} as never, execute: async () => {
        peak = Math.max(peak, ++running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return { content: [], details: {} };
      } }, { exclusive: exclusiveCalls });
    const serial = tool(true);
    expect(serial.executionMode).toBeUndefined();
    await Promise.all([serial.execute('1', {} as never, undefined, undefined, {} as never), serial.execute('2', {} as never, undefined, undefined, {} as never)]);
    expect(peak).toBe(1);
    const parallel = tool(false);
    await Promise.all([parallel.execute('1', {} as never, undefined, undefined, {} as never), parallel.execute('2', {} as never, undefined, undefined, {} as never)]);
    expect(peak).toBe(2);
  });
});

describe('interrupted rows and expandable prefaces', () => {
  const colored = { ...(theme as object), fg: (color: string, text: string) => `<${color}>${text}` } as never;

  it('draws an Esc abort as ◼ interrupted in the warning colour, and redraws a header that drew ✗', async () => {
    const state: ToolRow = {};
    const invalidate = vi.fn();
    const context = { isPartial: false, isError: true, executionStarted: true, state, invalidate };
    expect(rendered(toolHeader(colored, context, 'Bash', 'sleep 9') as never)).toContain('<error>✗');
    const body = rendered(resultBlock(colored, context, { summary: 'Operation aborted' }) as never);
    expect(body).toContain('<warning>Operation aborted');
    expect(body).not.toContain('Error:');
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(rendered(toolHeader(colored, context, 'Bash', 'sleep 9') as never)).toContain('<warning>◼');
    // A real failure keeps its Error prefix and ✗.
    const failed = rendered(resultBlock(colored, { isPartial: false, isError: true, state: {} }, { summary: 'exit 1' }) as never);
    expect(failed).toContain('Error: exit 1');
  });

  it('counts a preface apart from hidden body lines and shows it only when expanded', () => {
    const preface = ['Prompt', 'line 1', 'line 2'];
    const collapsed = rendered(resultBlock(theme, { isPartial: false, isError: false }, { summary: 'Done', body: 'a\nb', preface, prefaceLabel: 'prompt' }) as never);
    expect(collapsed).toBe('  ⎿  Done\n     a\n     b\n     … prompt (ctrl+o to expand)');
    const more = rendered(resultBlock(theme, { isPartial: false, isError: false }, { summary: 'Done', body: '1\n2\n3\n4\n5', preface, prefaceLabel: 'prompt' }) as never);
    expect(more).toContain('… +2 lines · prompt (ctrl+o to expand)');
    const open = rendered(resultBlock(theme, { isPartial: false, isError: false, expanded: true }, { summary: 'Done', body: 'a', preface }) as never);
    expect(open).toBe('  ⎿  Done\n     Prompt\n     line 1\n     line 2\n     a');
  });

  it('falls back to Pi default keys and stops every live row ticker on demand', () => {
    expect(appKey('app.thinking.toggle', 'ctrl+t')).toBe('ctrl+t');
    vi.useFakeTimers();
    try {
      const invalidate = vi.fn();
      toolHeader(theme, { executionStarted: true, isPartial: true, state: {}, invalidate }, 'Bash', 'x');
      vi.advanceTimersByTime(1_100);
      expect(invalidate).toHaveBeenCalledTimes(1);
      stopRowTimers();
      vi.advanceTimersByTime(5_000);
      expect(invalidate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
