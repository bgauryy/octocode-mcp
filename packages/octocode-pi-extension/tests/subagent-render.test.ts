import { describe, expect, it } from 'vitest';
import { doneSummary, renderAgentCall, renderAgentMessage, renderAgentResult, type RunDetails } from '../src/subagents/render.js';
import { rendered, theme } from './fake-pi.js';

const ctx = (extra: Record<string, unknown> = {}) => ({ args: {}, lastComponent: undefined, isPartial: false, isError: false, expanded: false, state: {}, ...extra }) as never;
const details = (extra: Partial<RunDetails> = {}): RunDetails => ({ id: 'general-0001', profile: 'general', goal: 'audit auth token refresh', toolCalls: 2, activity: ['→ bash ls', '→ read a.ts'], input: 1_500, cacheRead: 0, output: 500, cost: 0, unpriced: false, startedAt: 0, status: 'done', ...extra });

describe('subagent renderers', () => {
  it('names the goal in the call row, without the profile', () => {
    expect(rendered(renderAgentCall({ task: 't', goal: 'audit auth token refresh', profile: 'reviewer', isolate: true } as never, theme, ctx()))).toContain('Agent(audit auth token refresh · isolated)');
  });

  it('summarizes a finished run with and without a duration', () => {
    expect(doneSummary(details(), 38_000)).toBe('Done (general-0001 · 2 tool calls · ↑1.5k ↓500 · 38s)');
    expect(doneSummary(details({ toolCalls: 1 }), undefined)).toBe('Done (general-0001 · 1 tool call · ↑1.5k ↓500)');
    expect(doneSummary(details({ cacheRead: 1_200, cost: 0.12 }), 38_000)).toBe('Done (general-0001 · 2 tool calls · ↑1.5k (80% cached) ↓500 · ≈$0.12 · 38s)');
    expect(doneSummary(details({ cost: 0.12, unpriced: true }), undefined)).toBe('Done (general-0001 · 2 tool calls · ↑1.5k ↓500 · ≈$0.12 + n/a)');
  });

  it('labels a run by the outcome its report names, Done when it names none', () => {
    expect(doneSummary(details({ outcome: 'done' }), 38_000)).toBe('Done (general-0001 · 2 tool calls · ↑1.5k ↓500 · 38s)');
    expect(doneSummary(details({ outcome: 'partial' }), 38_000)).toBe('Partial (general-0001 · 2 tool calls · ↑1.5k ↓500 · 38s)');
    expect(doneSummary(details({ outcome: 'blocked' }), undefined)).toMatch(/^Blocked \(/);
    expect(rendered(renderAgentResult({ content: [{ type: 'text', text: 'blocked: need a decision' }], details: details({ outcome: 'blocked' }) }, { isPartial: false, expanded: false }, theme, ctx()))).toContain('⎿  Blocked (general-0001');
  });

  it('draws the call with its goal and tags, never the prompt or the profile', () => {
    const call = rendered(renderAgentCall({ task: 'look\nsecond', profile: 'researcher', background: true }, theme, ctx()));
    expect(call).toMatch(/^. Agent · background/);
    expect(call).not.toContain('look');
    expect(call).not.toContain('researcher');
    expect(rendered(renderAgentCall({ task: 'x', profile: 'implementer', model: 'openai/gpt-5', isolate: true }, theme, ctx()))).toContain('Agent(openai/gpt-5 · isolated)');
    expect(rendered(renderAgentCall({ background: true }, theme, ctx()))).toMatch(/^. Agent · background/);
  });

  it('draws a background start, Pi\'s native duration and a run without details', () => {
    const background = rendered(renderAgentResult({ content: [{ type: 'text', text: 'started' }], details: details({ status: 'background' }) }, { isPartial: false, expanded: false }, theme, ctx()));
    expect(background).toContain('Running in the background as general-0001');
    expect(background).not.toContain('started');
    // Only model-directed text behind it: no expand hint. A later note (an isolation warning) can be expanded to.
    expect(background).not.toContain('to expand');
    const warned = (expanded: boolean) => rendered(renderAgentResult({ content: [{ type: 'text', text: 'Started general-0001 in the background.\n\nNot isolated: no git repo' }], details: details({ status: 'background' }) }, { isPartial: false, expanded }, theme, ctx({ expanded })));
    expect(warned(false)).toContain('to expand');
    expect(warned(true)).toContain('Not isolated: no git repo');
    expect(warned(true)).not.toContain('Started general-0001');
    const finished = rendered(renderAgentResult({ content: [{ type: 'text', text: 'answer' }], details: details() }, { isPartial: false, expanded: false }, theme, ctx({ durationMs: 90_000 })));
    expect(finished).toContain('Done (general-0001 · 2 tool calls · ↑1.5k ↓500 · 1m30s)');
    const bare = rendered(renderAgentResult({ content: [{ type: 'text', text: 'Subagent failed\ndetail' }], details: undefined }, { isPartial: false, expanded: false }, theme, ctx({ isError: true })));
    expect(bare).toContain('Subagent failed');
  });

  it('shows the full prompt above the report only when expanded', () => {
    const args = { task: 'Find the bug\n\x1b]0;evil\x07in auth.ts', profile: 'researcher' };
    const run = (expanded: boolean) => rendered(renderAgentResult({ content: [{ type: 'text', text: 'The answer' }], details: details() }, { isPartial: false, expanded }, theme, ctx({ args, expanded })));
    expect(run(false)).not.toContain('Find the bug');
    expect(run(false)).toContain('The answer');
    expect(run(false)).toContain('to expand');
    const open = run(true);
    expect(open).toMatch(/Prompt\n\s+Find the bug\n\s+in auth\.ts\n\s*\n\s+Report\n\s+The answer/);
    expect(open).not.toContain('\x1b]0;');
    const live = (expanded: boolean) => rendered(renderAgentResult({ content: [], details: details({ status: 'running' }) }, { isPartial: true, expanded }, theme, ctx({ args, expanded, isPartial: true, executionStarted: true })));
    expect(live(false)).toContain('general-0001 · 2 tool calls');
    expect(live(true)).toMatch(/Prompt[\s\S]*Progress[\s\S]*→ read a\.ts/);
    const thinking = rendered(renderAgentResult({ content: [], details: details({ status: 'running', thinking: 'Check the lock' }) }, { isPartial: true, expanded: false }, theme, ctx({ args, isPartial: true, executionStarted: true })));
    expect(thinking).toContain('✻ Check the lock…');
    // A stop in progress says so until the run has closed.
    const stopping = rendered(renderAgentResult({ content: [], details: details({ status: 'running', stopping: true }) }, { isPartial: true, expanded: false }, theme, ctx({ args, isPartial: true, executionStarted: true })));
    expect(stopping).toContain('stopping… (general-0001 · 2 tool calls');
    // A child with a dialog open for the user's answer says so.
    const waiting = rendered(renderAgentResult({ content: [], details: details({ status: 'running', waiting: true }) }, { isPartial: true, expanded: false }, theme, ctx({ args, isPartial: true, executionStarted: true })));
    expect(waiting).toContain('waiting for your approval (general-0001 · 2 tool calls');
  });

  it('shows a background report with its name and goal (not its role), and its full prompt when expanded', () => {
    const message = (expanded: boolean) => rendered(renderAgentMessage({ role: 'custom', customType: 'x', content: 'Background subagent general-0001 finished (3s · 1 tool call):\nAll fixed.', details: { id: 'general-0001', status: 'done', summary: 'Done (1 tool call)', durationMs: 3_000, profile: 'researcher', goal: 'fix login flow', task: 'Fix login\nin src/auth.ts' }, display: true, timestamp: 0 } as never, { expanded, outputPad: 1 }, theme as never) as never);
    expect(message(false)).toContain('Agent(general-0001 · fix login flow)');
    expect(message(false)).not.toContain('researcher');
    expect(message(false)).not.toContain('Fix login');
    expect(message(false)).toContain('All fixed.');
    expect(message(true)).toMatch(/Prompt\n\s+Fix login\n\s+in src\/auth\.ts\n\s*\n\s+Report\n\s+All fixed\./);
  });

  it('draws a background report message without details as a plain report', () => {
    const box = renderAgentMessage({ role: 'custom', customType: 'x', content: 'Report head\nbody', display: true, timestamp: 0 } as never, { expanded: true, outputPad: 1 }, theme as never);
    const text = rendered(box as never);
    expect(text).toContain('Agent(background)');
    expect(text).toContain('Report head');
    expect(text).toContain('body');
    const failed = rendered(renderAgentMessage({ role: 'custom', customType: 'x', content: 'x', display: true, timestamp: 0, details: { id: 'a-1', status: 'failed', summary: 'Failed: boom', durationMs: 1_200 } } as never, { expanded: false, outputPad: 2 }, theme as never) as never);
    expect(failed).toMatch(/Agent\(a-1\).*1\.2s/);
    expect(failed).toContain('Failed: boom');
    expect(failed).not.toContain('Error: Failed');
  });

  it('draws any stop as an interruption (◼ warning), never as a failure', () => {
    const colored = { ...(theme as object), fg: (color: string, text: string) => `<${color}>${text}` };
    const stopped = (requested: boolean) => rendered(renderAgentMessage({ role: 'custom', customType: 'x', content: 'x', display: true, timestamp: 0, details: { id: 'a-1', status: 'stopped', summary: 'Stopped', requested } } as never, { expanded: false, outputPad: 2 }, colored as never) as never);
    for (const requested of [true, false]) {
      expect(stopped(requested)).toContain('<warning>◼');
      expect(stopped(requested)).not.toContain('<error>');
    }
  });
});
