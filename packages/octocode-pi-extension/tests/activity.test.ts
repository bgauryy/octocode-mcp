import { afterEach, describe, expect, it, vi } from 'vitest';
import { Activity, callTarget, registerActivity, shortToolName } from '../src/ui/activity.js';
import { titledDialog } from '../src/shared/locks.js';
import { Thought, thoughtGist } from '../src/shared/thought.js';
import { withDialog } from '../src/shared/locks.js';
import { fakeCtx, fakePi } from './fake-pi.js';

afterEach(() => vi.useRealTimers());

describe('Activity: consequential calls', () => {
  it('shows one line per consequential call while its tool runs, at most one a second, bursts collapsed into +n', () => {
    const activity = new Activity();
    activity.start(0);
    activity.toolStart('1', 'bash', { command: 'make' }, 0);
    activity.consequential('shell', 'make', false, 0);
    expect(activity.describe(0)).toBe('shell: make');
    // Inside the window the line keeps the first call and counts the rest.
    activity.consequential('shell', 'ls', false, 300);
    activity.consequential('web', 'https://example.com', false, 600);
    expect(activity.describe(700)).toBe('shell: make +2');
    // After the window the next call takes the line.
    activity.consequential('web', 'https://example.com', false, 1_000);
    expect(activity.describe(1_000)).toBe('web: https://example.com');
    activity.toolEnd('1', 1_100);
    expect(activity.describe(1_100)).toBeUndefined();
  });

  it('marks a ⚠ call with the warning, and lets it replace a quiet line inside the window', () => {
    const activity = new Activity();
    activity.start(0);
    activity.toolStart('1', 'bash', { command: 'x' }, 0);
    activity.consequential('shell', 'ls', false, 0);
    activity.consequential('shell.destructive', 'rm -rf build', true, 100);
    expect(activity.describe(100)).toBe('⚠ shell.destructive: rm -rf build');
    // A quiet call does not push a ⚠ line out.
    activity.consequential('shell', 'ls', false, 200);
    expect(activity.describe(200)).toBe('⚠ shell.destructive: rm -rf build +1');
  });

  it('forgets the line when the run ends', () => {
    const activity = new Activity();
    activity.start(0);
    activity.toolStart('1', 'bash', { command: 'x' }, 0);
    activity.consequential('shell', 'ls', false, 0);
    activity.end();
    activity.start(5_000);
    activity.toolStart('2', 'bash', { command: 'y' }, 5_000);
    expect(activity.describe(5_000)).toBe('Running bash y');
  });
});

describe('Activity', () => {
  it('describes model phases, parallel tools, nested calls and user prompts', () => {
    const activity = new Activity();
    expect(activity.describe(0)).toBeUndefined();
    activity.start(0);
    expect(activity.describe(0)).toBeUndefined();
    activity.stream('thinking_delta', 0);
    expect(activity.describe(1_000)).toBe('Thinking');
    expect(activity.describe(5_000)).toBe('Thinking · 5s');
    expect(activity.describe()).toBe('Thinking');
    activity.stream('text_delta', 5_000);
    expect(activity.describe(6_000)).toBe('Writing');
    expect(activity.describe(9_000)).toBe('Writing · 4s');
    activity.stream('toolcall_start', 9_000);
    expect(activity.describe(9_000)).toBe('Preparing tool calls');
    activity.stream('done', 9_000);
    activity.messageDone(9_000);
    expect(activity.describe(9_000)).toBeUndefined();
    // A long wait for the model's first token is named and timed.
    expect(activity.describe(12_000)).toBe('Waiting for model · 3s');
    expect(activity.describe()).toBeUndefined();

    activity.toolStart('1', 'bash', { command: 'yarn test\nmore' }, 10_000);
    expect(activity.describe(10_500)).toBe('Running bash yarn test');
    activity.toolStart('2', 'mcp__octocode__localSearch', { path: '/repo' }, 11_000);
    activity.toolStart('3', 'mcp__octocode__localSearch', {}, 11_000);
    expect(activity.describe(13_000)).toBe('Running 3 tools: bash · localSearch ×2 · 3s');
    expect(activity.ticking()).toBe(true);
    activity.promptStart('Pick one', 13_000);
    expect(activity.describe(14_000)).toBe('Waiting for you: Pick one');
    activity.promptEnd();
    activity.toolEnd('1', 14_000);
    activity.toolEnd('2', 14_000);
    activity.toolEnd('unknown', 14_000);
    expect(activity.describe(14_000)).toBe('Running localSearch · 3s');
    activity.toolEnd('3', 15_000);
    expect(activity.describe(15_000)).toBeUndefined();
    // Waiting for the model again: still a step whose time grows.
    expect(activity.ticking()).toBe(true);
    activity.promptStart(undefined, 15_000);
    expect(activity.describe(15_000)).toBe('Waiting for you');
    activity.end();
    expect(activity.describe(15_000)).toBeUndefined();
    // A message ending after the run ended does not revive it.
    activity.messageDone(16_000);
    expect(activity.phase).toBe('idle');
  });

  it('shows the gist of streaming thinking, changing per sentence', () => {
    expect(thoughtGist('Reading the')).toBeUndefined();
    expect(thoughtGist('**Plan**\nRead the')).toBe('Plan');
    expect(thoughtGist('One. Two')).toBe('One.');
    expect(thoughtGist('One. Two', true)).toBe('Two');
    expect(thoughtGist('Use https://bob:hunter2@example.com/x.', true)).toBe('Use https://example.com/x.');
    expect(thoughtGist('Token is ghp_0123456789abcdefghijklmnopqrstuvwxyzAB.', true)).toContain('[redacted]');
    const activity = new Activity();
    activity.start(0);
    expect(activity.stream('thinking_start', 0)).toBe(true);
    expect(activity.stream('thinking_delta', 0, 'Checking the')).toBe(false);
    expect(activity.stream('thinking_delta', 0, ' lock order. Then')).toBe(true);
    expect(activity.stream('thinking_delta', 0, ' the')).toBe(false);
    // One long unfinished sentence after a heading-like line keeps the last finished thought.
    const thought = new Thought();
    expect(thought.add('Solving it:')).toBe(true);
    expect(thought.add(' bat+ball=1.10, so')).toBe(false);
    expect(thought.gist).toBe('Solving it:');
    // A long unit cut at the front of the kept tail is dropped, never shown in part.
    const long = new Thought();
    long.add(`Key sk-${'x'.repeat(2_100)} ends here.`);
    expect(long.gist).toBeUndefined();
    long.add(' Next thought. Then');
    expect(long.gist).toBe('Next thought.');
    expect(activity.describe(3_000)).toBe('Thinking: Checking the lock order. · 3s');
    activity.stream('thinking_start', 4_000);
    expect(activity.describe()).toBe('Thinking');
  });

  it('shortens MCP tool names and sanitizes hints', () => {
    expect(shortToolName('mcp__octocode__localSearch')).toBe('localSearch');
    expect(shortToolName('mcp__my_server__get_file')).toBe('get_file');
    expect(shortToolName('bash')).toBe('bash');
    const activity = new Activity();
    activity.start(0);
    activity.toolStart('1', 'bash', { command: 'echo \u001b[31mred' }, 0);
    expect(activity.describe(0)).not.toContain('\u001b');
  });

  it('names what batched calls and agents work on, redacted', () => {
    expect(callTarget('file', { queries: [{ type: 'edit', path: 'src/a.ts' }, { type: 'write', path: 'b.ts' }] })).toEqual({ hint: 'src/a.ts', more: 1 });
    expect(callTarget('mcp__octocode__localSearch', { queries: [{ pattern: 'useState', path: 'src' }] })).toEqual({ hint: 'useState in src', more: 0 });
    expect(callTarget('ghSearchCode', { queries: [{ owner: 'o', repo: 'r', keywords: ['a', 'b'] }, {}, {}] })).toEqual({ hint: 'o/r a b', more: 2 });
    expect(callTarget('agent', { goal: 'Audit auth\nmore lines' })).toEqual({ hint: 'Audit auth', more: 0 });
    expect(callTarget('web', { queries: [{ url: 'https://me:s3cret@example.com/x' }] }).hint).toBe('https://example.com/x');
    expect(callTarget('bash', { command: 'curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789" x' }).hint).toContain('[redacted]');
    expect(callTarget('agent', { goal: 'token = ghp_abcdefghijklmnopqrstuvwxyz0123456789' }).hint).toContain('[redacted]');
    const activity = new Activity();
    activity.start(0);
    activity.toolStart('1', 'mcp__octocode__localSearch', { queries: [{ pattern: 'x'.repeat(200), path: 'src' }, {}, {}] }, 0);
    const line = activity.describe(125_000)!;
    // The clipped target keeps the count of the other queries and the elapsed time, within the width.
    expect(line).toMatch(/^Running localSearch x+… \+2 · 2m05s$/);
    expect(line.length).toBeLessThanOrEqual(70);
  });

  it('keeps every line within 70 columns and names at most two tools of a batch', () => {
    const activity = new Activity();
    activity.start(0);
    for (const [id, name] of ['bash', 'web', 'web', 'file', 'agent'].entries()) activity.toolStart(String(id), name, {}, 0);
    expect(activity.describe(3_000)).toBe('Running 5 tools: bash · web ×2 +2 · 3s');
    activity.end();
    activity.start(0);
    activity.promptStart(`Which ${'very '.repeat(30)}long question?`, 0);
    expect(activity.describe(3_000, 2)!.length).toBeLessThanOrEqual(70);
    expect(activity.describe(3_000, 2)).toMatch(/… \(\+2 queued\) · 3s$/);
    activity.promptEnd();
    activity.stream('thinking_delta', 0, `${'Weighing '.repeat(20)}options. Next`);
    expect(activity.describe(3_000)!.length).toBeLessThanOrEqual(70);
  });
});

describe('registerActivity', () => {
  it('drives the working line and the team activity from Pi events', async () => {
    vi.useFakeTimers();
    const fake = fakePi();
    const lines: Array<string | undefined> = [];
    registerActivity(fake.pi, { workingLine: true, onChange: (line) => lines.push(line) });
    const ctx = fakeCtx({ cwd: '/x' });
    const ui = ctx.ui as typeof ctx.ui & { working?: string };
    await fake.emit('session_start', {}, ctx);
    await fake.emit('agent_start', {}, ctx);
    await fake.emit('message_update', { message: { role: 'assistant' }, assistantMessageEvent: { type: 'thinking_delta' } }, ctx);
    await fake.emit('message_update', { message: { role: 'user' }, assistantMessageEvent: { type: 'text_delta' } }, ctx);
    expect(ui.working).toBe('Thinking');
    await fake.emit('message_end', { message: { role: 'assistant' } }, ctx);
    await fake.emit('message_end', { message: { role: 'user' } }, ctx);
    await fake.emit('tool_execution_start', { toolCallId: 'a', toolName: 'bash', args: { command: 'sleep 9' } }, ctx);
    // A nested call a tool makes is part of that call.
    await fake.emit('tool_execution_start', { toolCallId: 'a/1', parentToolCallId: 'a', toolName: 'web', args: {} }, ctx);
    expect(ui.working).toBe('Running bash sleep 9');
    vi.advanceTimersByTime(3_000);
    expect(ui.working).toBe('Running bash sleep 9 · 3s');
    await fake.emit('ui_prompt_start', { title: 'Continue?' }, ctx);
    expect(ui.working).toBe('Waiting for you: Continue?');
    await fake.emit('ui_prompt_end', {}, ctx);
    await fake.emit('tool_execution_end', { toolCallId: 'a/1', parentToolCallId: 'a' }, ctx);
    expect(ui.working).toBe('Running bash sleep 9 · 3s');
    await fake.emit('tool_execution_end', { toolCallId: 'a' }, ctx);
    expect(ui.working).toBeUndefined();
    await fake.emit('agent_settled', {}, ctx);
    expect(ui.working).toBeUndefined();
    // The team hears state changes only, never the ticking elapsed time.
    expect(lines).toEqual(['Thinking', undefined, 'Running bash sleep 9', 'Waiting for you: Continue?', 'Running bash sleep 9', undefined]);
    await fake.emit('session_shutdown', {}, ctx);
  });

  it('skips the working line for subagents and headless runs', async () => {
    const fake = fakePi();
    registerActivity(fake.pi, { workingLine: false });
    const ctx = fakeCtx({ cwd: '/x' });
    await fake.emit('agent_start', {}, ctx);
    await fake.emit('tool_execution_start', { toolCallId: 'a', toolName: 'bash', args: {} }, ctx);
    expect((ctx.ui as { working?: string }).working).toBeUndefined();
    const headless = fakePi();
    registerActivity(headless.pi, { workingLine: true });
    const quiet = fakeCtx({ cwd: '/x', hasUI: false });
    await headless.emit('agent_start', {}, quiet);
    await headless.emit('tool_execution_start', { toolCallId: 'a', toolName: 'bash', args: {} }, quiet);
    expect((quiet.ui as { working?: string }).working).toBeUndefined();
  });

  it('paints and ticks only in the TUI: RPC has no working line', async () => {
    vi.useFakeTimers();
    const fake = fakePi();
    const lines: Array<string | undefined> = [];
    registerActivity(fake.pi, { workingLine: true, onChange: (line) => lines.push(line) });
    const rpc = fakeCtx({ cwd: '/x', mode: 'rpc' });
    await fake.emit('session_start', {}, rpc);
    await fake.emit('agent_start', {}, rpc);
    await fake.emit('tool_execution_start', { toolCallId: 'a', toolName: 'bash', args: { command: 'ls' } }, rpc);
    expect((rpc.ui as { working?: string }).working).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    // The team still hears the state.
    expect(lines).toEqual(['Running bash ls']);
    await fake.emit('session_shutdown', {}, rpc);
  });

  it('titles a custom dialog from its opener, since Pi gives it none', async () => {
    const fake = fakePi();
    registerActivity(fake.pi, { workingLine: true });
    const ctx = fakeCtx({ cwd: '/x' });
    const ui = ctx.ui as typeof ctx.ui & { working?: string };
    await fake.emit('session_start', {}, ctx);
    await fake.emit('agent_start', {}, ctx);
    let close!: () => void;
    const open = titledDialog('2 questions: Which database?', () => new Promise<void>((resolve) => (close = resolve)));
    await fake.emit('ui_prompt_start', { kind: 'custom' }, ctx);
    expect(ui.working).toBe('Waiting for you: 2 questions: Which database?');
    await fake.emit('ui_prompt_end', { kind: 'custom' }, ctx);
    close();
    await open;
    await fake.emit('ui_prompt_start', { kind: 'custom' }, ctx);
    expect(ui.working).toBe('Waiting for you');
    await fake.emit('session_shutdown', {}, ctx);
  });

  it('shows a call\'s pre-run checks and dialogs queued behind the open one', async () => {
    vi.useFakeTimers();
    const fake = fakePi();
    const control = registerActivity(fake.pi, { workingLine: true });
    const ctx = fakeCtx({ cwd: '/x' });
    const ui = ctx.ui as typeof ctx.ui & { working?: string };
    await fake.emit('session_start', {}, ctx);
    await fake.emit('agent_start', {}, ctx);
    await fake.emit('tool_execution_start', { toolCallId: 'a', toolName: 'bash', args: { command: 'ls' } }, ctx);
    await fake.emit('tool_execution_start', { toolCallId: 'b', toolName: 'web', args: {} }, ctx);
    control.checking('a', true);
    expect(ui.working).toBe('Checking bash ls');
    vi.advanceTimersByTime(2_000);
    expect(ui.working).toBe('Checking bash ls · 2s');
    control.checking('a', false);
    control.checking('missing', true);
    expect(ui.working).toBe('Running 2 tools: bash · web · 2s');
    let close!: () => void;
    const open = withDialog(() => new Promise<void>((resolve) => (close = resolve)));
    await fake.emit('ui_prompt_start', { title: 'Pick' }, ctx);
    const queued = withDialog(async () => undefined);
    await Promise.resolve();
    expect(ui.working).toMatch(/^Waiting for you: Pick \(\+1 queued\)/);
    close();
    await Promise.all([open, queued]);
    await fake.emit('ui_prompt_end', {}, ctx);
    await fake.emit('session_shutdown', {}, ctx);
    vi.useRealTimers();
  });
});
