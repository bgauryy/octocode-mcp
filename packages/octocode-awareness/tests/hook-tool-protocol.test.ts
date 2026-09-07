import { describe, expect, it } from 'vitest';
import {
  normalizeToolHookPayload,
  toolHookContextEnvelope,
} from '../bin/hook-tool-protocol.js';

describe('generic hook tool protocol', () => {
  it.each([
    ['Read', { file_path: 'src/a.ts' }, 'read', 'workspace-read'],
    ['Write', { file_path: 'src/a.ts' }, 'write', 'workspace-write'],
    ['Bash', { command: 'printf ok' }, 'shell', 'unknown'],
    ['mcp__octocode__localSearch', { path: '/work/repo' }, 'mcp', 'unknown'],
    ['future_tool', { path: 'src/a.ts' }, 'unknown', 'unknown'],
    ['str_replace_editor', { command: 'view', path: 'src/a.ts' }, 'read', 'workspace-read'],
    ['str_replace_editor', { command: 'unknown_future_operation', path: 'src/a.ts' }, 'unknown', 'unknown'],
  ] as const)('classifies %s without treating path-bearing unknown tools as writes', (toolName, input, category, effect) => {
    const result = normalizeToolHookPayload({
      cwd: '/work/repo', hook_event_name: 'PreToolUse', tool_name: toolName,
      tool_use_id: 'tool-1', tool_input: input, vendor_extension: { future: true },
    }, 'codex');
    expect(result).toMatchObject({
      version: 1, host: 'codex', phase: 'pre', event: 'PreToolUse',
      tool: { name: toolName, category, effect }, correlationId: 'tool-1',
    });
    expect(result.native.vendor_extension).toEqual({ future: true });
  });

  it.each([
    ['create', { path: 'src/new.ts' }],
    ['str_replace_editor', { command: 'create', path: 'src/new.ts' }],
    ['str_replace_editor', { command: 'str_replace', path: 'src/a.ts' }],
    ['str_replace_editor', { command: 'insert', path: 'src/a.ts' }],
  ] as const)('extracts mutation targets after positive %s classification', (toolName, input) => {
    expect(normalizeToolHookPayload({
      cwd: '/work/repo', hook_event_name: 'PreToolUse', tool_name: toolName,
      tool_use_id: 'tool-1', tool_input: input,
    }, 'codex').tool).toMatchObject({ category: 'write', effect: 'workspace-write', files: [input.path] });
  });

  it.each([
    [{ hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, 'success', true],
    [{ hook_event_name: 'PostToolUse', tool_response: { exit_code: 7 } }, 'failure', true],
    [{ hook_event_name: 'PostToolUseFailure', is_error: true }, 'failure', true],
    [{ hook_event_name: 'PostToolUse', tool_response: { status: 'running' } }, 'unknown', false],
    [{ hook_event_name: 'PostToolUse', tool_response: { status: 'partial' } }, 'partial', true],
    [{ hook_event_name: 'PostToolUse', tool_response: {} }, 'unknown', true],
  ] as const)('normalizes terminal evidence without inventing success', (extra, outcome, terminal) => {
    expect(normalizeToolHookPayload({
      cwd: '/work/repo', tool_name: 'Bash', tool_use_id: 'tool-1', tool_input: { command: 'x' }, ...extra,
    }, 'claude')).toMatchObject({ outcome: { kind: outcome, terminal } });
  });

  it('rejects malformed known fields while preserving unknown vendor bags', () => {
    expect(() => normalizeToolHookPayload({
      cwd: '/work/repo', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 42,
    }, 'codex')).toThrow(/tool_use_id/);
    expect(() => normalizeToolHookPayload({
      cwd: '/work/repo', hook_event_name: 'postToolUseFailure', tool_name: 'Read', tool_use_id: 'x',
    }, 'codex')).toThrow(/event/);
  });

  it('uses only event-supported response shapes', () => {
    expect(toolHookContextEnvelope('codex', 'PreToolUse', 'changed')).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'changed' },
    });
    expect(toolHookContextEnvelope('cursor', 'preToolUse', 'changed')).toEqual({ additional_context: 'changed' });
    expect(toolHookContextEnvelope('cursor', 'postToolUse', 'changed')).toEqual({ additional_context: 'changed' });
    expect(toolHookContextEnvelope('cursor', 'postToolUseFailure', 'changed')).toBeNull();
  });
});
