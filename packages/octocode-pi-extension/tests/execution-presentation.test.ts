import { describe, expect, it } from 'vitest';
import {
  executionResultDetails,
  executionResultSummary,
  executionToolTitle,
} from '../src/tools/execution-presentation.js';
import {
  activityPresentation,
  runtimeActivityPresentation,
} from '../src/tools/activity-presentation.js';
import {
  createExecutionState,
  reduceExecutionEvent,
  type ExecutionEvent,
} from '../src/tools/execution-events.js';

describe('semantic execution presentation', () => {
  it('describes intent and native MCP calls without dumping arbitrary arguments', () => {
    expect(
      executionToolTitle('bash', {
        queries: [{ command: 'yarn test auth', secret: 'private' }],
      })
    ).toBe('Bash yarn test auth');
    expect(
      executionToolTitle('file', {
        queries: [
          {
            type: 'edit',
            path: 'src/auth.ts',
            edits: [{ oldText: 'private' }],
          },
        ],
      })
    ).toBe('Edit src/auth.ts');
    expect(
      executionToolTitle('MCPTool', {
        queries: [
          {
            server: 'octocode',
            tool: 'localGetFileContent',
            arguments: {
              queries: [{ path: 'src/auth.ts', startLine: 8, endLine: 40 }],
            },
          },
        ],
      })
    ).toBe('Read src/auth.ts:8-40');
    expect(
      executionToolTitle('skill', {
        queries: [{ name: 'architect', reason: 'private' }],
      })
    ).toBe('Skill architect');
    expect(
      executionToolTitle('bash', {
        command: 'TOKEN=abc123 command\nnext\u001b[2J',
      })
    ).not.toMatch(/abc123|\n/);
  });

  it('preserves partial batch outcomes and bounds previews while full output stays referenced', () => {
    const result = {
      details: {
        results: [
          { index: 0, status: 'success', result: { path: 'a.ts' } },
          { index: 1, status: 'failed', result: {} },
          { index: 2, status: 'not-run' },
        ],
      },
    };
    expect(executionResultSummary(result, true)).toBe(
      '1 succeeded · 1 failed · 1 not run'
    );
    expect(executionResultDetails(result)).toHaveLength(2);
    expect(executionResultDetails(result)[1].failed).toBe(true);
    expect(
      executionResultSummary({ content: [{ text: 'x'.repeat(20000) }] }, false)
    ).toHaveLength(180);
  });

  it('uses explicit input/permission priority and restores the underlying plan after resolution', () => {
    const base = createExecutionState();
    const event = (type: string, payload: unknown, sequence: number) =>
      ({
        version: 1,
        id: `e${sequence}`,
        sessionId: 's',
        runId: 'r',
        turnId: 't',
        sequence,
        timestamp: 1000 * sequence,
        visibility: 'activity',
        type,
        payload,
      }) as ExecutionEvent;
    const state = [
      event(
        'tool.started',
        { toolCallId: 'a', tool: 'bash', title: 'Bash yarn test' },
        1
      ),
      event('permission.requested', { id: 'p', title: 'Install packages' }, 2),
    ].reduce(reduceExecutionEvent, base);
    const activity = {
      kind: 'verifying',
      since: 1000,
      planScope: 'p',
    } as const;
    expect(
      runtimeActivityPresentation({ activity, execution: state })
    ).toMatchObject({
      visible: false,
      attention: true,
      status: 'Permission required · Install packages',
    });
    const resolved = reduceExecutionEvent(
      state,
      event('permission.resolved', { id: 'p', decision: 'allow-once' }, 3)
    );
    expect(
      runtimeActivityPresentation({ activity, execution: resolved }).status
    ).toBe('Bash yarn test');
    const done = reduceExecutionEvent(
      resolved,
      event('tool.completed', { toolCallId: 'a', summary: '42 passed' }, 4)
    );
    expect(
      runtimeActivityPresentation({ activity, execution: done }).status
    ).toBe('Verifying');
    expect(
      activityPresentation({
        kind: 'awaiting_start',
        since: 1,
        planScope: 'p',
        revision: 'r',
      }).status
    ).not.toContain('/octocode-plan');
  });
});
