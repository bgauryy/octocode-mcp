import { describe, expect, it } from 'vitest';
import { NEEDS_APPROVAL } from '../src/permission/ask.js';
import { newChildState, reduceEvent, type ChildEffect } from '../src/subagents/events.js';

const LIMITS = { idleMs: 1_000, busyMs: 5_000 };
const NOW = 100_000;

const reduce = (state: ReturnType<typeof newChildState>, event: Record<string, unknown>, now = NOW): ChildEffect[] => reduceEvent(state, event, LIMITS, now);
const progress = (effects: ChildEffect[]) => effects.flatMap((effect) => (effect.kind === 'progress' ? [effect.update] : []));
const reply = (stopReason: string, text = 'answer') => ({ type: 'message_end', message: { role: 'assistant', stopReason, content: [{ type: 'text', text }], usage: { input: 3, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } });

describe('reduceEvent', () => {
  it('marks the child running at agent_start and settled at agent_settled, and reports the child\'s own abort flag', () => {
    const state = newChildState();
    expect(reduce(state, { type: 'agent_start' })).toEqual([]);
    expect(state.running).toBe(true);
    expect(reduce(state, { type: 'agent_settled', aborted: true })).toEqual([{ kind: 'settled', aborted: true }]);
    expect(state).toMatchObject({ running: false, settledSeen: true });
    expect(reduce(newChildState(), { type: 'agent_settled' })).toEqual([{ kind: 'settled', aborted: false }]);
  });

  it('starts a tool call: counts it, sets its busy deadline from its own timeout, and reports it as activity', () => {
    const state = newChildState();
    const effects = reduce(state, { type: 'tool_execution_start', toolName: 'bash', args: { command: 'sleep 9', timeout: 20 } });
    expect(state.toolsRunning).toBe(1);
    expect(state.busyUntil).toBe(NOW + 20_000 + LIMITS.idleMs);
    expect(state.lastActivity).toBe('→ bash sleep 9');
    expect(progress(effects)).toEqual([{ activity: '→ bash sleep 9', usage: state.usage }]);
    // A call without a timeout gets the default busy time, and never shortens an earlier deadline.
    reduce(state, { type: 'tool_execution_start', toolName: 'read', args: { path: 'a' } }, NOW + 1);
    expect(state.toolsRunning).toBe(2);
    expect(state.busyUntil).toBe(NOW + 20_000 + LIMITS.idleMs);
  });

  it('keeps the longest deadline of a background job for settling', () => {
    const state = newChildState();
    reduce(state, { type: 'tool_execution_start', toolName: 'bash', args: { command: 'x', timeout: 60, background: true } });
    reduce(state, { type: 'tool_execution_start', toolName: 'bash', args: { command: 'y', timeout: 30, background: true } });
    expect(state.jobsMs).toBe(60_000);
    reduce(state, reply('stop'), NOW + 5);
    expect(state.busyUntil).toBe(NOW + 5 + 60_000 + LIMITS.idleMs);
  });

  it('ends a tool call and reports its screenshot and a refusal that needs approval', () => {
    const state = newChildState();
    reduce(state, { type: 'tool_execution_start', toolName: 'browser', args: {} });
    const effects = reduce(state, { type: 'tool_execution_end', isError: true, result: { content: [{ type: 'image', data: 'AAA', mimeType: 'image/jpeg' }, { type: 'text', text: 'failed' }] } });
    expect(state.toolsRunning).toBe(0);
    expect(progress(effects)).toEqual([{ image: { data: 'AAA', mimeType: 'image/jpeg' }, usage: state.usage }]);
    const denied = reduce(state, { type: 'tool_execution_end', isError: true, result: { content: [{ type: 'text', text: `${NEEDS_APPROVAL} bash` }] } });
    expect(progress(denied)).toEqual([{ denied: true, usage: state.usage }]);
    // An end without a start never drives the count below zero.
    expect(state.toolsRunning).toBe(0);
  });

  it('clears running tools at a new turn or a streaming reply, and ends settling at a turn', () => {
    const state = newChildState();
    reduce(state, { type: 'tool_execution_start', toolName: 'bash', args: {} });
    reduce(state, reply('stop'));
    expect(state.settling).toBe(true);
    reduce(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta' } });
    expect(state.toolsRunning).toBe(0);
    expect(state.settling).toBe(true);
    reduce(state, { type: 'turn_start' });
    expect(state.settling).toBe(false);
  });

  it('turns thinking deltas into a live gist and resets it at the next block', () => {
    const state = newChildState();
    const delta = (text: string) => reduce(state, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: text } });
    expect(progress(delta('First, I read the file. Then'))).toEqual([{ thinking: 'First, I read the file.', usage: state.usage }]);
    // The same gist is not reported twice.
    expect(delta(' more')).toEqual([]);
    reduce(state, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } });
    expect(state.thought.gist).toBeUndefined();
  });

  it('ends a reply: adds usage, reports narration and the reply, and hands its text to the report', () => {
    const state = newChildState();
    const effects = reduce(state, reply('toolUse', 'Reading the file'));
    expect(state.usage).toMatchObject({ input: 3, output: 2 });
    expect(state.settling).toBe(false);
    expect(state.lastActivity).toBe('model turn');
    const updates = progress(effects);
    expect(updates.map((update) => update.step)).toEqual(['› Reading the file', undefined]);
    expect(updates[1]).toMatchObject({ thinking: '', reply: { role: 'assistant' } });
    expect(effects.at(-1)).toEqual({ kind: 'answer', text: 'Reading the file', stopReason: 'toolUse', errorMessage: undefined });

    const done = reduce(state, reply('stop', 'Done'), NOW + 7);
    expect(state.settling).toBe(true);
    expect(state.lastActivity).toBe('answered; settling');
    expect(state.busyUntil).toBe(NOW + 7 + LIMITS.busyMs + LIMITS.idleMs);
    // A final answer is the report, not a narration step.
    expect(progress(done).map((update) => update.step)).toEqual([undefined]);
  });

  it('reports a message that is not the child\'s own reply as incoming', () => {
    expect(reduce(newChildState(), { type: 'message_end', message: { role: 'user', content: [] } })).toEqual([{ kind: 'incoming', role: 'user' }]);
  });

  it('hands dialogs to the relay and ignores calls a tool makes itself', () => {
    const state = newChildState();
    const dialog = { type: 'extension_ui_request', id: '1', method: 'confirm' };
    expect(reduce(state, dialog)).toEqual([{ kind: 'ui', event: dialog }]);
    expect(reduce(state, { type: 'tool_execution_start', toolName: 'bash', args: {}, parentToolCallId: 'p' })).toEqual([]);
    expect(reduce(state, { type: 'agent_start', parentToolCallId: 'p' })).toEqual([]);
    expect(state).toMatchObject({ toolsRunning: 0, running: false });
  });

  it('answers only the prompt command: a refusal fails the run, a handled prompt closes input', () => {
    const state = newChildState();
    expect(reduce(state, { type: 'response', command: 'prompt', success: false, error: 'busy' })).toEqual([{ kind: 'rejected', message: 'Subagent rejected its task: busy' }]);
    expect(reduce(state, { type: 'response', command: 'prompt', success: false })).toEqual([{ kind: 'rejected', message: 'Subagent rejected its task: no reason given' }]);
    expect(reduce(state, { type: 'response', command: 'prompt', success: true, data: { disposition: 'handled' } })).toEqual([{ kind: 'close' }]);
    expect(reduce(state, { type: 'response', command: 'prompt', success: true })).toEqual([]);
    expect(reduce(state, { type: 'response', command: 'abort', success: false })).toEqual([]);
  });
});
