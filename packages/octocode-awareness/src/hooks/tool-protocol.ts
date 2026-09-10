import { z } from 'zod';
import { extractWriteTargetPaths } from '../write-targets.js';
import { historyToolEffect } from '../history-tool-effects.js';

export const TOOL_CATEGORIES = ['read', 'write', 'shell', 'mcp', 'unknown'] as const;
export const TOOL_EFFECTS = ['workspace-read', 'workspace-write', 'unknown'] as const;
export const TOOL_OUTCOMES = ['success', 'failure', 'denied', 'interrupted', 'timeout', 'partial', 'unknown'] as const;

type ToolCategory = typeof TOOL_CATEGORIES[number];
type ToolEffect = typeof TOOL_EFFECTS[number];
export type ToolOutcome = typeof TOOL_OUTCOMES[number];
export type ToolHookHost = 'claude' | 'codex' | 'cursor' | 'copilot' | 'gemini' | 'opencode';

const hostEvents: Record<ToolHookHost, ReadonlySet<string>> = {
  claude: new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']),
  codex: new Set(['PreToolUse', 'PostToolUse']),
  cursor: new Set(['preToolUse', 'postToolUse', 'postToolUseFailure']),
  copilot: new Set(['preToolUse', 'PreToolUse', 'postToolUse', 'PostToolUse', 'postToolUseFailure', 'PostToolUseFailure']),
  gemini: new Set(['BeforeTool', 'AfterTool']),
  opencode: new Set(['tool.execute.before', 'tool.execute.after']),
};
const successOnlyPostEvents: Record<ToolHookHost, ReadonlySet<string>> = {
  claude: new Set(['PostToolUse']),
  codex: new Set(['PostToolUse']),
  cursor: new Set(['postToolUse']),
  copilot: new Set(['postToolUse', 'PostToolUse']),
  gemini: new Set(['AfterTool']),
  opencode: new Set(['tool.execute.after']),
};

const nativeToolPayloadSchema = z.object({
  cwd: z.string().trim().min(1).optional(),
  workspace: z.string().trim().min(1).optional(),
  workspacePath: z.string().trim().min(1).optional(),
  hook_event_name: z.string().trim().min(1).optional(),
  eventName: z.string().trim().min(1).optional(),
  tool_name: z.string().trim().min(1).optional(),
  toolName: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  tool_use_id: z.string().trim().min(1).optional(),
  toolUseId: z.string().trim().min(1).optional(),
  toolCallId: z.string().trim().min(1).optional(),
  tool_input: z.unknown().optional(),
  toolArgs: z.unknown().optional(),
  input: z.unknown().optional(),
  args: z.unknown().optional(),
  tool_response: z.unknown().optional(),
  toolResponse: z.unknown().optional(),
  result: z.unknown().optional(),
  is_error: z.boolean().optional(),
  isError: z.boolean().optional(),
}).passthrough();

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
const firstString = (...values: unknown[]): string | null => {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
};

function classifyTool(name: string, input: unknown): { category: ToolCategory; effect: ToolEffect; files: string[] } {
  const normalized = name.toLowerCase();
  const historyEffect = historyToolEffect(name, input);
  if (historyEffect.effect === 'workspace-write') {
    return { category: 'write', effect: 'workspace-write', files: [...historyEffect.files] };
  }
  const inputRecord = record(input);
  const editorOperation = firstString(inputRecord.command, inputRecord.operation)?.toLowerCase();
  if (normalized === 'str_replace_editor') {
    if (editorOperation === 'view') return { category: 'read', effect: 'workspace-read', files: [] };
    if (!['create', 'str_replace', 'insert'].includes(editorOperation ?? '')) {
      return { category: 'unknown', effect: 'unknown', files: [] };
    }
  }
  if (['write', 'edit', 'multi_edit', 'multiedit', 'notebookedit', 'notebook_edit', 'apply_patch', 'applypatch', 'create', 'str_replace_editor'].includes(normalized)) {
    const files = extractWriteTargetPaths(name, input, { assumeWrite: true });
    return { category: 'write', effect: 'workspace-write', files };
  }
  if (['read', 'read_file', 'localfetch', 'localsearch', 'glob', 'search'].includes(normalized)) {
    return { category: 'read', effect: 'workspace-read', files: [] };
  }
  if (normalized === 'bash' || normalized.includes('shell') || normalized === 'exec_command' || normalized === 'write_stdin') {
    return { category: 'shell', effect: 'unknown', files: [] };
  }
  if (normalized.startsWith('mcp__') || normalized.startsWith('mcp_')) {
    return { category: 'mcp', effect: 'unknown', files: [] };
  }
  return { category: 'unknown', effect: 'unknown', files: [] };
}

function normalizeOutcome(payload: Record<string, unknown>, phase: 'pre' | 'post'): { kind: ToolOutcome; terminal: boolean; exitCode?: number } {
  if (phase === 'pre') return { kind: 'unknown', terminal: false };
  const response = record(payload.tool_response ?? payload.toolResponse ?? payload.result);
  const event = firstString(payload.hook_event_name, payload.eventName)?.toLowerCase() ?? '';
  const status = firstString(response.status, payload.status)?.toLowerCase();
  const exitCode = typeof response.exit_code === 'number' ? response.exit_code
    : typeof response.exitCode === 'number' ? response.exitCode
      : typeof payload.exit_code === 'number' ? payload.exit_code : undefined;
  if (event.includes('failure') || payload.is_error === true || payload.isError === true || response.is_error === true || response.isError === true || response.success === false || (exitCode !== undefined && exitCode !== 0)) {
    return { kind: 'failure', terminal: true, ...(exitCode === undefined ? {} : { exitCode }) };
  }
  if (status === 'denied') return { kind: 'denied', terminal: true };
  if (status === 'interrupted' || status === 'cancelled') return { kind: 'interrupted', terminal: true };
  if (status === 'timeout' || status === 'timed_out') return { kind: 'timeout', terminal: true };
  if (status === 'partial') return { kind: 'partial', terminal: true };
  if (status === 'running' || status === 'launched' || status === 'progress') return { kind: 'unknown', terminal: false };
  if (response.success === true || exitCode === 0 || status === 'success' || status === 'completed') {
    return { kind: 'success', terminal: true, ...(exitCode === undefined ? {} : { exitCode }) };
  }
  return { kind: 'unknown', terminal: true };
}

export function normalizeToolHookPayload(value: unknown, host: ToolHookHost) {
  const native = nativeToolPayloadSchema.parse(value);
  const event = firstString(native.hook_event_name, native.eventName);
  if (!event || !hostEvents[host].has(event)) throw new Error(`event is invalid for ${host}`);
  const phase: 'pre' | 'post' = event.toLowerCase().includes('pre') || event === 'BeforeTool' || event.endsWith('.before') ? 'pre' : 'post';
  const input = native.tool_input ?? native.toolArgs ?? native.input ?? native.args ?? {};
  const name = firstString(native.tool_name, native.toolName, native.name) ?? '';
  const classification = classifyTool(name, input);
  const outcome = normalizeOutcome(native, phase);
  if (outcome.kind === 'unknown' && outcome.terminal && classification.category !== 'shell' && successOnlyPostEvents[host].has(event)) {
    outcome.kind = 'success';
  }
  return {
    version: 1 as const,
    host,
    event,
    phase,
    workspace: firstString(native.cwd, native.workspace, native.workspacePath),
    correlationId: firstString(native.tool_use_id, native.toolUseId, native.toolCallId),
    tool: { name, ...classification },
    input,
    outcome,
    native,
  };
}

export function toolHookContextEnvelope(host: ToolHookHost, event: string, message: string): Record<string, unknown> | null {
  if (host === 'cursor') {
    if (event === 'postToolUseFailure') return null;
    if (event === 'preToolUse' || event === 'postToolUse') return { additional_context: message };
  }
  if (host === 'copilot') {
    return event.toLowerCase() === 'pretooluse'
      ? { permissionDecision: 'allow', additionalContext: message }
      : { additionalContext: message };
  }
  return { hookSpecificOutput: { hookEventName: event, additionalContext: message } };
}
