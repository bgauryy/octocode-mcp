import {
  getAwarenessCommandDescriptor,
  listAwarenessCommandDescriptors,
  type AwarenessCommandDescriptor,
  type AwarenessCommandEffect,
  type AwarenessCommandPiMode,
} from '@octocodeai/octocode-awareness';
import type { ApprovalClass } from '@octocodeai/agent-contracts/protocols';
import { z } from 'zod';
import type { PiContext, PiInstance, PiTheme, ToolCallResult } from '../types.js';
import type { registerUniqueTool } from './octocode-tools.js';
import { buildQueryEnvelopeSchema, executeQueryBatch } from './query-envelope.js';
import { buildAwarenessCliEnvironment } from './awareness-cli-context.js';
import { assertPersistentAwarenessEnabled } from './storage-policy.js';
import { requestApproval } from './approval.js';
import { runAwarenessCommand, type AwarenessCommandRunner } from './awareness-command-runner.js';
import { makeComponentRenderer } from './render-helpers.js';
import { compileMcpSchemaValidator } from './mcp/schema-validator.js';
import { truncateToWidth } from '../tui/width.js';
import { paint } from '../tui/palette.js';

type RegisterFn = typeof registerUniqueTool;
const RESERVED_PARAMS = new Set(['db', 'database', 'workspace', 'agent_id', 'lead_agent_id', 'compact']);
const EFFECTS = ['read', 'coordination-write', 'workspace-write', 'host-config-write', 'destructive-admin'] as const;
const PI_MODES = ['normal', 'recovery', 'external-host-only'] as const;
const AWARENESS_OUTPUT_MAX_CHARS = 12_000;
const AWARENESS_OUTPUT_HEAD_CHARS = 8_000;
const AWARENESS_OUTPUT_TAIL_CHARS = 3_000;

function result(text: string, details: Record<string, unknown>, isError = false): ToolCallResult {
  return { content: [{ type: 'text', text }], details, isError };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nativeInputSchema(descriptor: AwarenessCommandDescriptor): Record<string, unknown> {
  const schema = structuredClone(descriptor.inputSchema) as Record<string, unknown>;
  const properties = record(schema['properties']);
  if (properties) {
    for (const field of RESERVED_PARAMS) delete properties[field];
  }
  if (Array.isArray(schema['required'])) {
    const required = (schema['required'] as unknown[]).filter((field) => typeof field === 'string' && !RESERVED_PARAMS.has(field));
    if (required.length) schema['required'] = required;
    else delete schema['required'];
  }
  schema['x-pi-host-injected'] = descriptor.injected;
  return schema;
}

function modelInputSchema(descriptor: AwarenessCommandDescriptor): Record<string, unknown> {
  const schema = nativeInputSchema(descriptor);
  delete schema['$schema'];
  delete schema['description'];
  for (const key of Object.keys(schema)) {
    if (key.startsWith('x-')) delete schema[key];
  }
  return schema;
}

function modelDescriptor(descriptor: AwarenessCommandDescriptor): Record<string, unknown> {
  return {
    command: descriptor.command,
    use: descriptor.use,
    effect: descriptor.effect,
    piMode: descriptor.piMode,
    ...(descriptor.approvalClass ? { approvalClass: descriptor.approvalClass } : {}),
    hostInjected: descriptor.injected,
    inputSchema: modelInputSchema(descriptor),
    ...(descriptor.piMode === 'external-host-only' ? { example: descriptor.example } : {}),
  };
}

function commandProperties(descriptor: AwarenessCommandDescriptor): Record<string, unknown> {
  return record(descriptor.inputSchema['properties']) ?? {};
}

function pushFlag(args: string[], name: string, value: unknown): void {
  const flag = `--${name.replaceAll('_', '-')}`;
  if (value === undefined || value === null || value === false) return;
  if (value === true) {
    args.push(flag);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) args.push(flag, typeof item === 'string' ? item : JSON.stringify(item));
    return;
  }
  args.push(flag, typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function buildArgs(
  descriptor: AwarenessCommandDescriptor,
  params: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string[] {
  for (const key of Object.keys(params)) {
    if (RESERVED_PARAMS.has(key)) throw new Error(`${key} is host-injected and cannot be overridden`);
  }

  const args: string[] = [];
  if (descriptor.injected.includes('database')) {
    if (!env.OCTOCODE_AWARENESS_DB) throw new Error('Awareness database binding is unavailable');
    args.push('--db', env.OCTOCODE_AWARENESS_DB);
  }
  args.push(...descriptor.command.split(' '));

  const remaining = { ...params };
  for (const field of descriptor.positionals ?? []) {
    const value = remaining[field];
    delete remaining[field];
    if (value !== undefined) args.push(String(value));
  }

  const properties = commandProperties(descriptor);
  if (descriptor.injected.includes('workspace') && Object.hasOwn(properties, 'workspace')) {
    if (!env.OCTOCODE_AWARENESS_WORKSPACE) throw new Error('Awareness workspace binding is unavailable');
    pushFlag(args, 'workspace', env.OCTOCODE_AWARENESS_WORKSPACE);
  }
  if (descriptor.injected.includes('agent-id')) {
    if (!env.OCTOCODE_AGENT_ID) throw new Error('Awareness agent identity is unavailable');
    if (Object.hasOwn(properties, 'agent_id')) pushFlag(args, 'agent_id', env.OCTOCODE_AGENT_ID);
    else if (Object.hasOwn(properties, 'lead_agent_id')) pushFlag(args, 'lead_agent_id', env.OCTOCODE_AGENT_ID);
  }

  for (const [name, value] of Object.entries(remaining)) pushFlag(args, name, value);
  args.push('--compact');
  return args;
}

function parseOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function boundedOutput(raw: string): { text: string; totalChars: number; truncated: boolean } {
  if (raw.length <= AWARENESS_OUTPUT_MAX_CHARS) return { text: raw, totalChars: raw.length, truncated: false };
  const omitted = raw.length - AWARENESS_OUTPUT_HEAD_CHARS - AWARENESS_OUTPUT_TAIL_CHARS;
  return {
    text: `${raw.slice(0, AWARENESS_OUTPUT_HEAD_CHARS)}\n\n[… ${omitted.toLocaleString()} chars omitted; re-run a narrower paginated command.]\n\n${raw.slice(-AWARENESS_OUTPUT_TAIL_CHARS)}`,
    totalChars: raw.length,
    truncated: true,
  };
}

function approvalRequest(
  descriptor: AwarenessCommandDescriptor,
  params: Record<string, unknown>,
): { actionClass: ApprovalClass; title: string; detail: string } | undefined {
  if (!descriptor.approvalClass) return undefined;
  const parameterText = JSON.stringify(params);
  return {
    actionClass: descriptor.approvalClass,
    title: `Allow Awareness ${descriptor.command}?`,
    detail: `${descriptor.effect} command in ${descriptor.piMode} mode. Parameters: ${parameterText.slice(0, 1_000)}${parameterText.length > 1_000 ? '…' : ''}`,
  };
}

function listCommands(query: Record<string, unknown>): ToolCallResult {
  const noun = typeof query['noun'] === 'string' ? query['noun'].trim() : '';
  const effect = typeof query['effect'] === 'string' ? query['effect'] as AwarenessCommandEffect : undefined;
  const piMode = typeof query['piMode'] === 'string' ? query['piMode'] as AwarenessCommandPiMode : undefined;
  const page = typeof query['page'] === 'number' ? query['page'] : 1;
  const pageSize = typeof query['pageSize'] === 'number' ? query['pageSize'] : 25;
  const filtered = listAwarenessCommandDescriptors().filter((entry) =>
    (!noun || entry.command === noun || entry.command.startsWith(`${noun} `))
    && (!effect || entry.effect === effect)
    && (!piMode || entry.piMode === piMode));
  const start = (page - 1) * pageSize;
  const entries = filtered.slice(start, start + pageSize).map((entry) => ({
    command: entry.command,
    use: entry.use,
    effect: entry.effect,
    injected: entry.injected,
    approvalClass: entry.approvalClass,
    piMode: entry.piMode,
  }));
  const hasMore = start + entries.length < filtered.length;
  const next = hasMore
    ? { tool: 'awareness', query: { action: 'list', ...(noun ? { noun } : {}), ...(effect ? { effect } : {}), ...(piMode ? { piMode } : {}), page: page + 1, pageSize } }
    : undefined;
  const payload = { count: filtered.length, page, pageSize, entries, ...(next ? { next } : {}) };
  const modelPayload = {
    count: filtered.length,
    entries: entries.map((entry) => ({
      command: entry.command,
      use: entry.use,
      effect: entry.effect,
      ...(entry.piMode !== 'normal' ? { piMode: entry.piMode } : {}),
      ...(entry.approvalClass ? { approvalClass: entry.approvalClass } : {}),
    })),
    ...(next ? { next } : {}),
  };
  return result(JSON.stringify(modelPayload), { status: 'listed', ...payload });
}

const STIER_HINT = 'S-tier starting points: attend, memory recall, work start, work end, task ready, task claim, verify audit. Use action:"list" to discover all commands.';

function describeCommand(query: Record<string, unknown>): ToolCallResult {
  const command = String(query['command'] ?? '').trim();
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor) return result(`Unknown Awareness command: "${command}". ${STIER_HINT}`, { status: 'unknown', command }, true);
  const payload = { ...descriptor, inputSchema: nativeInputSchema(descriptor) };
  return result(JSON.stringify(modelDescriptor(descriptor)), { status: 'described', command, descriptor: payload });
}

async function callCommand(
  runner: AwarenessCommandRunner,
  query: Record<string, unknown>,
  signal?: AbortSignal,
  ctx?: PiContext,
): Promise<ToolCallResult> {
  assertPersistentAwarenessEnabled();
  const command = String(query['command'] ?? '').trim();
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor) return result(`Unknown Awareness command: "${command}". ${STIER_HINT}`, { status: 'unknown', command }, true);
  if (descriptor.piMode === 'external-host-only') {
    return result(
      `${command} is external-host-only and cannot run through Pi's native Awareness facade.`,
      { status: 'unsupported', command, piMode: descriptor.piMode },
      true,
    );
  }

  const params = record(query['params']) ?? {};
  const reservedOverride = Object.keys(params).find((key) => RESERVED_PARAMS.has(key));
  if (reservedOverride) {
    return result(
      `${reservedOverride} is host-injected and cannot be overridden`,
      { status: 'invalid', command, effect: descriptor.effect, field: reservedOverride },
      true,
    );
  }
  const validation = compileMcpSchemaValidator(nativeInputSchema(descriptor)).validate(params);
  if (!validation.valid) {
    return result(
      `Invalid parameters for Awareness ${command}: ${validation.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}`,
      { status: 'invalid', command, effect: descriptor.effect, errors: validation.errors },
      true,
    );
  }

  const request = approvalRequest(descriptor, params);
  if (request) {
    const approval = await requestApproval(ctx, request, signal);
    if (!approval.approved) {
      return result(`Approval declined for Awareness ${command}.`, { status: 'denied', command, effect: descriptor.effect, approval }, true);
    }
  }

  const env = buildAwarenessCliEnvironment(ctx);
  const args = buildArgs(descriptor, params, env);
  const timeoutMs = typeof query['timeoutMs'] === 'number' ? query['timeoutMs'] : undefined;
  let execution;
  try {
    execution = await runner(args, { cwd: ctx?.cwd ?? process.cwd(), env, signal, timeoutMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result(`Awareness ${command} failed: ${message}`, { status: signal?.aborted ? 'cancelled' : 'failed', command, effect: descriptor.effect, error: message }, true);
  }

  const rawText = execution.stdout.trim() || execution.stderr.trim() || `Awareness ${command} exited ${execution.code ?? 'unknown'}.`;
  const bounded = boundedOutput(rawText);
  const boundedStderr = execution.stderr.trim() ? boundedOutput(execution.stderr.trim()) : undefined;
  const parsedOutput = parseOutput(execution.stdout);
  const validReportExit = execution.code !== null
    && descriptor.resultExitCodes?.includes(execution.code) === true
    && record(parsedOutput)?.['ok'] === true;
  const accepted = !execution.killed && (execution.code === 0 || validReportExit);
  const status = execution.killed
    ? 'cancelled'
    : execution.code === 0
      ? 'ok'
      : validReportExit
        ? 'attention'
        : execution.code === 2
          ? 'blocked'
          : 'failed';
  return result(bounded.text, {
    status,
    command,
    effect: descriptor.effect,
    piMode: descriptor.piMode,
    code: execution.code,
    killed: Boolean(execution.killed),
    output: bounded.truncated
      ? { truncated: true, totalChars: bounded.totalChars }
      : parsedOutput,
    truncated: bounded.truncated,
    totalChars: bounded.totalChars,
    ...(boundedStderr ? { stderr: boundedStderr.text, stderrTruncated: boundedStderr.truncated } : {}),
  }, !accepted);
}

function preflightAwarenessQuery(query: Record<string, unknown>): void {
  const action = String(query['action'] ?? '');
  if (action === 'list') return;
  const command = String(query['command'] ?? '').trim();
  if (!command) throw new Error(`${action} requires a non-empty command`);
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor) throw new Error(`Unknown Awareness command: "${command}". ${STIER_HINT}`);
  if (action === 'describe') return;
  if (action !== 'call') throw new Error(`Unknown Awareness action: ${action}`);
  assertPersistentAwarenessEnabled();
  if (descriptor.piMode === 'external-host-only') {
    throw new Error(`${command} is external-host-only; use the bound CLI after approval`);
  }
  const params = record(query['params']) ?? {};
  const reservedOverride = Object.keys(params).find((key) => RESERVED_PARAMS.has(key));
  if (reservedOverride) throw new Error(`${reservedOverride} is host-injected and cannot be overridden`);
  const validation = compileMcpSchemaValidator(nativeInputSchema(descriptor)).validate(params);
  if (!validation.valid) {
    throw new Error(`Invalid parameters for Awareness ${command}: ${validation.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
  }
}

export function registerAwarenessTool(
  pi: PiInstance,
  registeredToolNames: Set<string>,
  registerFn: RegisterFn,
  runner: AwarenessCommandRunner = runAwarenessCommand,
): void {
  const itemSchema = z.object({
    action: z.enum(['list', 'describe', 'call']).describe('Discovery flow: list all commands (filter by noun/effect), describe one command to read its exact required fields, then call to execute. Never skip describe for unfamiliar commands.'),
    command: z.string().optional().describe('Exact command name from list, e.g. "attend", "memory recall", "work start", "verify audit". Required for describe and call.'),
    params: z.record(z.string(), z.unknown()).optional().describe('Call parameters exactly matching describe output. Pi auto-injects database, workspace, and actor — never include those fields here.'),
    noun: z.string().optional().describe('list filter by top-level noun.'),
    effect: z.enum(EFFECTS).optional().describe('list filter by command effect.'),
    piMode: z.enum(PI_MODES).optional().describe('list filter by Pi routing mode.'),
    page: z.number().int().min(1).optional().describe('list page, 1-based.'),
    pageSize: z.number().int().min(1).max(25).optional().describe('list results per page; maximum 25.'),
    timeoutMs: z.number().int().min(1).max(300_000).optional().describe('call timeout in milliseconds; default 120000.'),
  });
  const parameters = buildQueryEnvelopeSchema(itemSchema, {
    maxItems: 100,
    reasoningDescription: 'Concise reason this Awareness operation is necessary.',
  });

  registerFn(pi, registeredToolNames, {
    name: 'awareness',
    label: 'awareness',
    description: 'Coordinate shared state through the Awareness runtime: work presence, task ownership, locks, signals, memory, verification, and file history. action:"list" discovers all commands, action:"describe" reads exact input schema, action:"call" executes. Pi injects database, workspace, and actor automatically — never pass those fields.',
    promptSnippet: 'Start with attend (lobby), recall before any edit, work start before writing, work end after the check, verify mark the pending run, then verify audit before the final response. Use list → describe → call for unfamiliar commands.',
    promptGuidelines: [
      'Session start: call awareness("attend") first — it builds a bounded lobby of what is active, blocked, and next.',
      'Before planning or editing: call awareness("memory recall") — the highest-ROI command; consistently skipped and consistently missed.',
      'Before writing: call awareness("work list") to check peer ownership, then awareness("work start") with paths, rationale, and test-plan.',
      'After the declared check has an observed result, call awareness("work end") or awareness("task submit") to move the run to PENDING; closure alone does not prove success.',
      'Then call awareness("verify mark") for the PENDING run with observed status SUCCESS or FAILED — expiry, exit, closure, and ack never prove verification.',
      'Before the final response: always call awareness("verify audit") — find remaining debt. Settle or disclose; this gate is never optional.',
      'Long operations (>2 min): call awareness("task heartbeat") and awareness("work touch") periodically — expired leases orphan work.',
      'After handling any signal: call awareness("signal ack") — unacked signals accumulate noise. Reply with awareness("signal reply") using in_reply_to, never signal publish kind:reply.',
      'Locks: use awareness("lock acquire") for non-mergeable files only; exit 2 means conflict — wait or coordinate. lock release is not success.',
      'Use action:"list" or action:"describe" before any unfamiliar command — never guess parameters.',
      'Pi injects database, workspace, and actor. Never pass or override those reserved fields.',
      'Exit 2 is conflict or blocked, not success. External-host-only commands are unavailable through this facade; use the bound CLI after user approval.',
    ],
    parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return executeQueryBatch({
        raw: params,
        toolCallId,
        signal,
        onUpdate: onUpdate as ((value: ToolCallResult) => void) | undefined,
        ctx,
        passthroughSingle: true,
        summarize: (value, query) => {
          const resultDetails = record(value.details);
          const action = String(query['action'] ?? 'awareness');
          const command = typeof query['command'] === 'string' ? ` ${query['command']}` : '';
          return `${action}${command} · ${String(resultDetails?.['status'] ?? (value.isError ? 'failed' : 'ok'))}`;
        },
        preflight: (query) => preflightAwarenessQuery(query),
        execute: async (query) => {
          const action = String(query['action'] ?? '');
          if (action === 'list') return listCommands(query);
          if (action === 'describe') return describeCommand(query);
          if (action === 'call') return callCommand(runner, query, signal, ctx);
          return result(`Unknown Awareness action: ${action}`, { status: 'unknown', action }, true);
        },
      });
    },
    renderCall(args: unknown, theme?: PiTheme) {
      const queries = record(args)?.['queries'];
      const first = Array.isArray(queries) ? record(queries[0]) : undefined;
      const action = String(first?.['action'] ?? 'awareness');
      const command = typeof first?.['command'] === 'string' ? ` ${first['command']}` : '';
      return makeComponentRenderer((_props, { width }) => [truncateToWidth(
        `${paint(theme, 'brand', '◆ awareness')} ${paint(theme, 'dim', '·')} ${paint(theme, 'title', `${action}${command}`)}`,
        width,
      )], undefined);
    },
    renderResult(value: ToolCallResult, _opts, theme?: PiTheme) {
      const status = String(record(value.details)?.['status'] ?? (value.isError ? 'failed' : 'ok'));
      const icon = value.isError ? paint(theme, 'error', '✗') : paint(theme, 'success', '✓');
      return makeComponentRenderer((_props, { width }) => [truncateToWidth(
        `${icon} ${paint(theme, 'title', 'awareness')} ${paint(theme, 'dim', `· ${status}`)}`,
        width,
      )], undefined);
    },
  });
}
