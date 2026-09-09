import {
  getAwarenessCommandDescriptor,
  listAwarenessCommandDescriptors,
  type AwarenessCommandDescriptor,
  type AwarenessCommandEffect,
  type AwarenessCommandPiMode,
} from '@octocodeai/octocode-awareness';
import type { ApprovalClass } from '@octocodeai/agent-contracts/protocols';
import { z } from 'zod';
import type {
  PiContext,
  PiInstance,
  PiTheme,
  ToolCallResult,
} from '../types.js';
import {
  DIRECT_TOOL_DESCRIPTIONS,
  type registerUniqueTool,
} from './octocode-tools.js';
import {
  buildQueryEnvelopeSchema,
  executeQueryBatch,
} from './query-envelope.js';
import { buildAwarenessContext } from './awareness-context.js';
import { assertPersistentAwarenessEnabled } from './storage-policy.js';
import { requestApproval } from './approval.js';
import {
  runAwarenessCommand,
  type AwarenessCommandRunner,
} from './awareness-command-runner.js';
import { makeComponentRenderer } from './render-helpers.js';
import { compileMcpSchemaValidator } from './mcp/schema-validator.js';
import { truncateToWidth } from '../tui/width.js';
import { paint } from '../tui/palette.js';

type RegisterFn = typeof registerUniqueTool;
const RESERVED_PARAMS = new Set([
  'db',
  'database',
  'workspace',
  'agent_id',
  'lead_agent_id',
  'compact',
]);
const EFFECTS = [
  'read',
  'coordination-write',
  'workspace-write',
  'host-config-write',
  'destructive-admin',
] as const;
const PI_MODES = ['normal', 'recovery', 'external-host-only'] as const;
const AWARENESS_OUTPUT_MAX_CHARS = 12_000;

function result(
  text: string,
  details: Record<string, unknown>,
  isError = false
): ToolCallResult {
  return { content: [{ type: 'text', text }], details, isError };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nativeInputSchema(
  descriptor: AwarenessCommandDescriptor
): Record<string, unknown> {
  const schema = structuredClone(descriptor.inputSchema) as Record<
    string,
    unknown
  >;
  const removeBindings = (variant: Record<string, unknown>): void => {
    const properties = record(variant['properties']);
    if (properties)
      for (const field of RESERVED_PARAMS) delete properties[field];
    if (Array.isArray(variant['required'])) {
      const required = variant['required'].filter(
        field => typeof field === 'string' && !RESERVED_PARAMS.has(field)
      );
      if (required.length) variant['required'] = required;
      else delete variant['required'];
    }
    for (const kind of ['oneOf', 'anyOf', 'allOf']) {
      const branches = variant[kind];
      if (Array.isArray(branches))
        for (const branch of branches) {
          const child = record(branch);
          if (child) removeBindings(child);
        }
    }
  };
  removeBindings(schema);
  schema['x-pi-host-injected'] = descriptor.injected;
  return schema;
}

function modelInputSchema(
  descriptor: AwarenessCommandDescriptor
): Record<string, unknown> {
  const schema = nativeInputSchema(descriptor);
  delete schema['$schema'];
  delete schema['description'];
  for (const key of Object.keys(schema)) {
    if (key.startsWith('x-')) delete schema[key];
  }
  return schema;
}

function modelDescriptor(
  descriptor: AwarenessCommandDescriptor
): Record<string, unknown> {
  return {
    command: descriptor.command,
    use: descriptor.use,
    effect: descriptor.effect,
    piMode: descriptor.piMode,
    ...(descriptor.approvalClass
      ? { approvalClass: descriptor.approvalClass }
      : {}),
    hostInjected: descriptor.injected,
    inputSchema: modelInputSchema(descriptor),
  };
}

function nativeContinuations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(nativeContinuations);
  const object = record(value);
  if (!object) return value;
  if (
    typeof object.command === 'string' &&
    record(object.params) &&
    getAwarenessCommandDescriptor(object.command)
  ) {
    const params = Object.fromEntries(
      Object.entries(record(object.params)!).filter(
        ([key]) => !RESERVED_PARAMS.has(key)
      )
    );
    return {
      tool: 'awareness',
      queries: [
        {
          reasoning: 'Continue the requested Awareness results',
          action: 'call',
          command: object.command,
          params,
        },
      ],
    };
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      nativeContinuations(child),
    ])
  );
}

function boundedOutput(
  raw: string,
  retry?: Record<string, unknown>
): { text: string; totalChars: number; truncated: boolean } {
  if (raw.length <= AWARENESS_OUTPUT_MAX_CHARS)
    return { text: raw, totalChars: raw.length, truncated: false };
  return {
    text: JSON.stringify({
      partial: true,
      partialReasons: ['output_limit'],
      diagnostic: {
        kind: retry ? 'output-limit' : 'terminal-limit',
        code: 'AWARENESS_OUTPUT_LIMIT',
        totalChars: raw.length,
        limit: AWARENESS_OUTPUT_MAX_CHARS,
      },
      ...(retry ? { next: { retry } } : {}),
      hint: 'The response exceeds the native output limit. Describe this command and narrow its limit, filters or detail options before retrying. This is not a complete result page.',
    }),
    totalChars: raw.length,
    truncated: true,
  };
}

function approvalRequest(
  descriptor: AwarenessCommandDescriptor,
  params: Record<string, unknown>
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
  const effect =
    typeof query['effect'] === 'string'
      ? (query['effect'] as AwarenessCommandEffect)
      : undefined;
  const piMode =
    typeof query['piMode'] === 'string'
      ? (query['piMode'] as AwarenessCommandPiMode)
      : undefined;
  const page = typeof query['page'] === 'number' ? query['page'] : 1;
  const pageSize =
    typeof query['pageSize'] === 'number' ? query['pageSize'] : 25;
  const filtered = listAwarenessCommandDescriptors().filter(
    entry =>
      (!noun ||
        entry.command === noun ||
        entry.command.startsWith(`${noun} `)) &&
      (!effect || entry.effect === effect) &&
      (!piMode || entry.piMode === piMode)
  );
  const start = (page - 1) * pageSize;
  const entries = filtered.slice(start, start + pageSize).map(entry => ({
    command: entry.command,
    use: entry.use,
    effect: entry.effect,
    injected: entry.injected,
    approvalClass: entry.approvalClass,
    piMode: entry.piMode,
  }));
  const hasMore = start + entries.length < filtered.length;
  const next = hasMore
    ? {
        tool: 'awareness',
        query: {
          action: 'list',
          ...(noun ? { noun } : {}),
          ...(effect ? { effect } : {}),
          ...(piMode ? { piMode } : {}),
          page: page + 1,
          pageSize,
        },
      }
    : undefined;
  const payload = {
    count: filtered.length,
    page,
    pageSize,
    entries,
    ...(next ? { next } : {}),
  };
  const modelPayload = {
    count: filtered.length,
    entries: entries.map(entry => ({
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

const STIER_HINT =
  'Use action:"list" with a noun filter to discover the needed command, then action:"describe" for its schema.';

function describeCommand(query: Record<string, unknown>): ToolCallResult {
  const command = String(query['command'] ?? '').trim();
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor)
    return result(
      `Unknown Awareness command: "${command}". ${STIER_HINT}`,
      { status: 'unknown', command },
      true
    );
  const payload = { ...descriptor, inputSchema: nativeInputSchema(descriptor) };
  return result(JSON.stringify(modelDescriptor(descriptor)), {
    status: 'described',
    command,
    descriptor: payload,
  });
}

async function callCommand(
  runner: AwarenessCommandRunner,
  query: Record<string, unknown>,
  signal?: AbortSignal,
  ctx?: PiContext
): Promise<ToolCallResult> {
  assertPersistentAwarenessEnabled();
  const command = String(query['command'] ?? '').trim();
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor)
    return result(
      `Unknown Awareness command: "${command}". ${STIER_HINT}`,
      { status: 'unknown', command },
      true
    );
  if (descriptor.piMode === 'external-host-only') {
    return result(
      `${command} is external-host-only and cannot run through Pi's native Awareness facade.`,
      { status: 'unsupported', command, piMode: descriptor.piMode },
      true
    );
  }

  const params = record(query['params']) ?? {};
  const reservedOverride = Object.keys(params).find(key =>
    RESERVED_PARAMS.has(key)
  );
  if (reservedOverride) {
    return result(
      `${reservedOverride} is host-injected and cannot be overridden`,
      {
        status: 'invalid',
        command,
        effect: descriptor.effect,
        field: reservedOverride,
      },
      true
    );
  }
  const validation = compileMcpSchemaValidator(
    nativeInputSchema(descriptor)
  ).validate(params);
  if (!validation.valid) {
    return result(
      `Invalid parameters for Awareness ${command}: ${validation.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`,
      {
        status: 'invalid',
        command,
        effect: descriptor.effect,
        errors: validation.errors,
      },
      true
    );
  }

  const request = approvalRequest(descriptor, params);
  if (request) {
    const approval = await requestApproval(ctx, request, signal);
    if (!approval.approved) {
      return result(
        `Approval declined for Awareness ${command}.`,
        { status: 'denied', command, effect: descriptor.effect, approval },
        true
      );
    }
  }

  const bindings = buildAwarenessContext(ctx);
  const timeoutMs =
    typeof query['timeoutMs'] === 'number' ? query['timeoutMs'] : undefined;
  let execution;
  try {
    execution = await runner(
      { command, params },
      { ...bindings, signal, timeoutMs }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result(
      `Awareness ${command} failed: ${message}`,
      {
        status: signal?.aborted ? 'cancelled' : 'failed',
        command,
        effect: descriptor.effect,
        error: message,
      },
      true
    );
  }

  const parsedOutput = nativeContinuations(execution.payload);
  const rawText = execution.text ?? JSON.stringify(parsedOutput);
  const diagnostics = execution.diagnostics?.join('\n');
  const narrower = { ...params, limit: 1 };
  const canRetry =
    rawText.length > AWARENESS_OUTPUT_MAX_CHARS &&
    params['limit'] !== 1 &&
    Object.hasOwn(
      record(descriptor.inputSchema['properties']) ?? {},
      'limit'
    ) &&
    compileMcpSchemaValidator(nativeInputSchema(descriptor)).validate(narrower)
      .valid;
  const bounded = boundedOutput(
    rawText,
    canRetry
      ? {
          tool: 'awareness',
          queries: [
            {
              reasoning: 'Read a smaller Awareness page',
              action: 'call',
              command,
              params: narrower,
            },
          ],
        }
      : undefined
  );
  const boundedStderr = diagnostics ? boundedOutput(diagnostics) : undefined;
  const validReportExit =
    execution.exitCode !== null &&
    descriptor.resultExitCodes?.includes(execution.exitCode) === true &&
    record(parsedOutput)?.['ok'] === true;
  const accepted =
    !execution.cancelled && (execution.exitCode === 0 || validReportExit);
  const status = execution.cancelled
    ? 'cancelled'
    : execution.exitCode === 0
      ? 'ok'
      : validReportExit
        ? 'attention'
        : execution.exitCode === 2
          ? 'blocked'
          : 'failed';
  return result(
    bounded.text,
    {
      status,
      command,
      effect: descriptor.effect,
      piMode: descriptor.piMode,
      code: execution.exitCode,
      killed: Boolean(execution.cancelled),
      output: bounded.truncated
        ? { truncated: true, totalChars: bounded.totalChars }
        : parsedOutput,
      truncated: bounded.truncated,
      totalChars: bounded.totalChars,
      ...(boundedStderr
        ? {
            stderr: boundedStderr.text,
            stderrTruncated: boundedStderr.truncated,
          }
        : {}),
    },
    !accepted
  );
}

function preflightAwarenessQuery(query: Record<string, unknown>): void {
  const action = String(query['action'] ?? '');
  if (action === 'list') return;
  const command = String(query['command'] ?? '').trim();
  if (!command) throw new Error(`${action} requires a non-empty command`);
  const descriptor = getAwarenessCommandDescriptor(command);
  if (!descriptor)
    throw new Error(`Unknown Awareness command: "${command}". ${STIER_HINT}`);
  if (action === 'describe') return;
  if (action !== 'call') throw new Error(`Unknown Awareness action: ${action}`);
  assertPersistentAwarenessEnabled();
  if (descriptor.piMode === 'external-host-only') {
    throw new Error(
      `${command} is external-host-only; this callback is invoked by the host lifecycle`
    );
  }
  const params = record(query['params']) ?? {};
  const reservedOverride = Object.keys(params).find(key =>
    RESERVED_PARAMS.has(key)
  );
  if (reservedOverride)
    throw new Error(
      `${reservedOverride} is host-injected and cannot be overridden`
    );
  const validation = compileMcpSchemaValidator(
    nativeInputSchema(descriptor)
  ).validate(params);
  if (!validation.valid) {
    throw new Error(
      `Invalid parameters for Awareness ${command}: ${validation.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`
    );
  }
}

export function registerAwarenessTool(
  pi: PiInstance,
  registeredToolNames: Set<string>,
  registerFn: RegisterFn,
  runner: AwarenessCommandRunner = runAwarenessCommand
): void {
  const itemSchema = z.object({
    action: z
      .enum(['list', 'describe', 'call'])
      .describe(
        'list: discover commands by noun/effect. describe: read an unfamiliar command schema once. call: execute with that schema.'
      ),
    command: z
      .string()
      .optional()
      .describe(
        'Exact command name from list, e.g. "attend", "memory recall", "work start", "verify audit". Required for describe and call.'
      ),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Call parameters exactly matching describe output. Pi auto-injects database, workspace, and actor — never include those fields here.'
      ),
    noun: z.string().optional().describe('list filter by top-level noun.'),
    effect: z
      .enum(EFFECTS)
      .optional()
      .describe('list filter by command effect.'),
    piMode: z
      .enum(PI_MODES)
      .optional()
      .describe('list filter by Pi routing mode.'),
    page: z.number().int().min(1).optional().describe('list page, 1-based.'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('list results per page; maximum 25.'),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(300_000)
      .optional()
      .describe(
        'Cooperative call deadline in milliseconds; default 120000. Atomic operations finish before cancellation is reported.'
      ),
  });
  const parameters = buildQueryEnvelopeSchema(itemSchema, {
    maxItems: 100,
    reasoningDescription:
      'Concise reason this Awareness operation is necessary.',
  });

  registerFn(pi, registeredToolNames, {
    name: 'awareness',
    label: 'awareness',
    description: DIRECT_TOOL_DESCRIPTIONS.awareness!,
    promptSnippet:
      'Access shared Awareness commands on demand. Native events deliver peer messages; the <awareness> policy owns the workflow.',
    promptGuidelines: [
      'Use queries[] with reasoning and action. If the command name is known, describe it directly; list with a noun/effect filter only when discovery is needed. Reuse an observed schema.',
      'Example: {"queries":[{"reasoning":"Discover workspace peers","action":"describe","command":"attend"}]}. Execute with action:"call" and params matching the returned schema.',
      'Pi injects database, workspace, and actor. Never pass or override those reserved fields. Follow executable next continuations when more results are needed.',
      'Exit 2 means conflict or blocked. Internal hook callbacks belong to the host lifecycle. Other commands execute directly through the Awareness package API; setup changes retain their approval checks.',
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
          const command =
            typeof query['command'] === 'string' ? ` ${query['command']}` : '';
          return `${action}${command} · ${String(resultDetails?.['status'] ?? (value.isError ? 'failed' : 'ok'))}`;
        },
        preflight: query => preflightAwarenessQuery(query),
        execute: async query => {
          const action = String(query['action'] ?? '');
          if (action === 'list') return listCommands(query);
          if (action === 'describe') return describeCommand(query);
          if (action === 'call') return callCommand(runner, query, signal, ctx);
          return result(
            `Unknown Awareness action: ${action}`,
            { status: 'unknown', action },
            true
          );
        },
      });
    },
    renderCall(args: unknown, theme?: PiTheme) {
      const queries = record(args)?.['queries'];
      const first = Array.isArray(queries) ? record(queries[0]) : undefined;
      const action = String(first?.['action'] ?? 'awareness');
      const command =
        typeof first?.['command'] === 'string' ? ` ${first['command']}` : '';
      return makeComponentRenderer(
        (_props, { width }) => [
          truncateToWidth(
            `${paint(theme, 'brand', '◆ awareness')} ${paint(theme, 'dim', '·')} ${paint(theme, 'title', `${action}${command}`)}`,
            width
          ),
        ],
        undefined
      );
    },
    renderResult(value: ToolCallResult, _opts, theme?: PiTheme) {
      const status = String(
        record(value.details)?.['status'] ?? (value.isError ? 'failed' : 'ok')
      );
      const icon = value.isError
        ? paint(theme, 'error', '✗')
        : paint(theme, 'success', '✓');
      return makeComponentRenderer(
        (_props, { width }) => [
          truncateToWidth(
            `${icon} ${paint(theme, 'title', 'awareness')} ${paint(theme, 'dim', `· ${status}`)}`,
            width
          ),
        ],
        undefined
      );
    },
  });
}
