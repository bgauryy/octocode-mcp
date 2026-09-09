import { describe, expect, it } from 'vitest';
import {
  createExecutionState,
  reduceExecutionEvent,
  replayExecutionEvents,
  serializeExecutionEvents,
  type ExecutionEvent,
} from '../src/tools/execution-events.js';

function event(
  type: ExecutionEvent['type'],
  payload: unknown,
  sequence: number,
  turnId = 'turn-1'
): ExecutionEvent {
  return {
    version: 1,
    id: `e${sequence}`,
    sessionId: 'session-1',
    runId: 'main',
    turnId,
    sequence,
    timestamp: sequence * 1000,
    visibility: 'activity',
    type,
    payload,
  } as ExecutionEvent;
}

describe('execution event projection', () => {
  it('replays overlapping tools, failure, cancellation and scoped usage from JSONL', () => {
    const events = [
      event('session.started', { cwd: '/workspace' }, 1),
      event('turn.started', {}, 2),
      event(
        'tool.started',
        { toolCallId: 'a', tool: 'bash', title: 'Run tests' },
        3
      ),
      event(
        'tool.started',
        { toolCallId: 'b', tool: 'MCPTool', title: 'Read src/auth.ts' },
        4
      ),
      event(
        'tool.failed',
        {
          toolCallId: 'a',
          summary: 'Tests failed',
          outputRef: { kind: 'tool-result', toolCallId: 'a' },
        },
        5
      ),
      event(
        'turn.completed',
        { status: 'cancelled', usage: { input: 21, output: 7, cacheRead: 10 } },
        6
      ),
    ];
    const live = events.reduce(reduceExecutionEvent, createExecutionState());
    expect(live.tools.a).toMatchObject({ status: 'failed', durationMs: 2000 });
    expect(live.tools.b).toMatchObject({
      status: 'cancelled',
      durationMs: 2000,
    });
    expect(live.activeTurnId).toBeUndefined();
    expect(live.usage).toEqual({ input: 21, output: 7, cacheRead: 10 });
    const jsonl = serializeExecutionEvents(events);
    expect(replayExecutionEvents(jsonl)).toEqual(live);
    expect(jsonl.trim().split('\n')).toHaveLength(6);
  });

  it('ignores duplicate and stale events without reopening completed work', () => {
    const started = event(
      'tool.started',
      { toolCallId: 'a', tool: 'bash', title: 'Run tests' },
      2
    );
    const completed = event(
      'tool.completed',
      { toolCallId: 'a', summary: '42 passed' },
      3
    );
    const state = [started, completed].reduce(
      reduceExecutionEvent,
      createExecutionState()
    );
    expect(reduceExecutionEvent(state, started)).toBe(state);
    expect(reduceExecutionEvent(state, completed)).toBe(state);
    expect(state.tools.a.status).toBe('succeeded');
  });

  it('keeps questions and permissions independent, including cancellation', () => {
    const state = [
      event('question.requested', { id: 'q1', title: 'Choose storage' }, 1),
      event('permission.requested', { id: 'p1', title: 'Install packages' }, 2),
      event('question.resolved', { id: 'q1', decision: 'answered' }, 3),
    ].reduce(reduceExecutionEvent, createExecutionState());
    expect(state.interactions.q1.status).toBe('answered');
    expect(state.interactions.p1).toMatchObject({
      kind: 'permission',
      status: 'waiting',
    });
    const cancelled = reduceExecutionEvent(
      state,
      event('turn.completed', { status: 'cancelled' }, 4)
    );
    expect(cancelled.interactions.p1.status).toBe('cancelled');
  });

  it('retains message identity and raw-output references without copying private reasoning', () => {
    const state = [
      event(
        'user.message',
        {
          messageId: 'u1',
          outputRef: { kind: 'message', role: 'user', timestamp: 1 },
        },
        1
      ),
      event('assistant.started', { messageId: 'm1' }, 2),
      event(
        'assistant.completed',
        {
          messageId: 'm1',
          status: 'completed',
          outputRef: { kind: 'message', role: 'assistant', timestamp: 2 },
        },
        3
      ),
      event(
        'skill.activated',
        { name: 'architect', source: '/skills/architect/SKILL.md' },
        4
      ),
      event(
        'file.changed',
        {
          path: 'src/auth.ts',
          operation: 'modify',
          additions: 18,
          deletions: 7,
        },
        5
      ),
    ].reduce(reduceExecutionEvent, createExecutionState());
    expect(state.messages.u1.role).toBe('user');
    expect(state.messages.m1).toMatchObject({
      role: 'assistant',
      status: 'completed',
    });
    expect(state.skills.architect.source).toContain('SKILL.md');
    expect(state.files['src/auth.ts']).toMatchObject({
      additions: 18,
      deletions: 7,
    });
  });

  it('rejects corrupt event logs explicitly and preserves unknown usage', () => {
    expect(() => replayExecutionEvents('{broken}\n')).toThrow(/line 1/i);
    expect(() => replayExecutionEvents('{"type":"unknown"}\n')).toThrow(
      /line 1/i
    );
    expect(createExecutionState().usage).toEqual({});
    const state = reduceExecutionEvent(
      createExecutionState(),
      event('turn.completed', { status: 'completed' }, 1)
    );
    expect(state.usage).toEqual({});
  });

  it.each([
    event('session.updated', { model: 'model', activeToolIds: [] }, 1),
    event('context.started', { status: 'compacted' }, 1),
    event('turn.completed', { status: 'running' }, 1),
    event('turn.completed', { status: 'completed', usage: { input: '10' } }, 1),
    event('file.changed', { path: 'file.ts', operation: 'unknown' }, 1),
    event(
      'user.message',
      { messageId: 'm', outputRef: { kind: 'unknown' } },
      1
    ),
    event(
      'question.requested',
      { id: 'q', title: 'Question', persistent: 'yes' },
      1
    ),
  ])('rejects malformed payloads during replay: $type', invalid => {
    expect(() =>
      replayExecutionEvents(serializeExecutionEvents([invalid]))
    ).toThrow(/line 1/);
  });

  it('counts a requested tool once and closes an interrupted response on shutdown', () => {
    const state = [
      event(
        'tool.requested',
        { toolCallId: 'a', tool: 'bash', title: 'Tests' },
        1
      ),
      event(
        'tool.started',
        { toolCallId: 'a', tool: 'bash', title: 'Tests' },
        2
      ),
      event('assistant.started', { messageId: 'm' }, 3),
      event('context.started', {}, 4),
      event('session.completed', {}, 5),
    ].reduce(reduceExecutionEvent, createExecutionState());
    expect(state.toolCount).toBe(1);
    expect(state.activeToolIds).toEqual([]);
    expect(state.messages.m.status).toBe('interrupted');
    expect(state.compacting).toBe(false);
  });
});
