/**
 * tool.ts — Unified agent tool facade.
 *
 * Registers the single public `agent` tool that wraps spawn/inspect/wait/
 * message/steer/abort/kill operations. Schema, validation, rendering, and
 * query-batch dispatch only; all business logic lives in sibling modules.
 *
 * Imports plan-integration (triggers side-effect registration) and lifecycle
 * (owns executeSpawnQuery and executeAgentLifecycle).
 */

import type {
  ToolDefinition,
  ToolCallResult,
  PiContext,
  PiTheme,
} from '../../types.js';
import type { registerUniqueTool } from '../octocode-tools.js';
import {
  AGENT_PROFILES,
  AGENT_OPERATIONS,
  type AgentOperation,
  rejectCrossBatchReference,
} from './plan-integration.js';
import { executeSpawnQuery, executeAgentLifecycle } from './lifecycle.js';
import { isSubagentProcess } from './registry.js';
import {
  buildQueryEnvelopeSchema,
  executeQueryBatch,
  type QueryRecord,
} from '../query-envelope.js';
import { makeComponentRenderer } from '../render-helpers.js';
import { truncateToWidth } from '../../tui/width.js';
import { CLI_GLYPH } from '../../tui/cli-design.js';
import { paint } from '../../tui/palette.js';

import { z } from 'zod';
type RegisterFn = typeof registerUniqueTool;

/** Register the single public agent tool. */
export function registerUnifiedAgentTool(
  pi: { registerTool?(def: ToolDefinition): void },
  registeredToolNames: Set<string>,
  registerFn: RegisterFn,
): void {
  // Workers cannot spawn workers — never register this tool inside a subagent process.
  if (isSubagentProcess()) return;

  // ── Item schema ──────────────────────────────────────────────────────────────────────────────────
  const itemSchema = z.looseObject({
    type: z.enum(AGENT_OPERATIONS as unknown as [string, ...string[]]).describe('Operation: spawn | inspect | wait | message | steer | abort | kill.'),
    name: z.string().optional().describe('Worker display name.'),
    task: z.string().optional().describe('Worker assignment/instructions for spawn; not a plan task record.'),
    context: z.string().optional().describe('Evidence or constraints prepended to the worker assignment.'),
    profile: z.enum(AGENT_PROFILES as unknown as [string, ...string[]]).optional().describe('Spawn profile: researcher | planner | architect | browser | custom.'),
    model: z.string().optional().describe('Model id from `pi -ne --list-models`.'),
    provider: z.string().optional().describe('Provider name (required when model id collides with a builtin namespace).'),
    thinking: z.string().optional().describe('Thinking level: off|minimal|low|medium|high|xhigh.'),
    noSession: z.boolean().optional().describe('Pass --no-session to the spawned worker (default true).'),
    isolation: z.enum(['shared', 'worktree']).optional().describe('Filesystem isolation for spawn. shared (default) uses current cwd; worktree creates an isolated git worktree.'),
    includeUncommitted: z.boolean().optional().describe('With isolation:worktree, apply uncommitted tracked changes.'),
    planStep: z.string().optional().describe('Stable task ID from the current plan (spawn with plan assignment).'),
    // browser profile
    url: z.string().optional().describe('URL to pass to the browser profile (spawn/browser).'),
    port: z.number().int().optional().describe('Chrome remote debug port (spawn/browser, default 9222).'),
    launch: z.boolean().optional().describe('Launch Chrome for initial browser analysis (default false).'),
    headless: z.boolean().optional().describe('Launch Chrome headless for initial browser analysis (default true).'),
    runNow: z.boolean().optional().describe('Run routed initial browser analysis before spawning (default true).'),
    durationMs: z.number().int().optional().describe('Initial browser scheme observation window in milliseconds (default 5000).'),
    workspaceCwd: z.string().optional().describe('Workspace root for browser screenshots and session paths.'),
    // custom profile
    tools: z.array(z.string()).optional().describe('Tool allowlist for custom profile. Defaults to MCPTool, skill, and bash; [] requests no tools.'),
    systemPrompt: z.string().optional().describe('Extra system prompt for custom profile (spawn).'),
    resourceMode: z.enum(['lean', 'octocode', 'default']).optional().describe('Resource mode for custom profile. octocode is the default; lean disables extensions and skills.'),
    // lifecycle fields
    agentId: z.string().optional().describe('Target agent id (inspect/wait/message/steer/abort/kill).'),
    message: z.string().optional().describe('Message text (message/steer).'),
    delivery: z.enum(['send', 'followUp']).optional().describe('Message delivery: send starts a new idle turn; followUp queues after the current turn.'),
    timeoutMs: z.number().int().optional().describe('Wait silence budget in milliseconds (default 300000).'),
    remove: z.boolean().optional().describe('Remove the worker record after wait/kill when safe.'),
    full: z.boolean().optional().describe('Return full retained history for inspect/wait/abort/kill.'),
  });

  const parameters = buildQueryEnvelopeSchema(itemSchema, {
    reasoningDescription: 'Concise reason this agent operation is necessary.',
  });

  registerFn(pi, registeredToolNames, {
    name: 'agent',
    label: 'Agent',
    description: [
      'Unified agent facade. Spawn typed/custom/browser workers and manage their lifecycle.',
      '',
      'Operations (type field):',
      '  spawn   — create a new worker. Returns agentId.',
      '  inspect — list all agents (no agentId) or show status (with agentId).',
      '  wait    — wait for the current turn, returning a live snapshot after a quiet gap.',
      '  message — send or queue a message (delivery: send|followUp).',
      '  steer   — redirect in-flight turn or queue follow-up.',
      '  abort   — gracefully interrupt the active worker turn without killing the process.',
      '  kill    — terminate a worker process.',
      '',
      'Profiles for spawn:',
      '  researcher — web/GitHub/npm/local research specialist.',
      '  planner    — implementation-planning specialist.',
      '  architect  — local-code / root-cause specialist.',
      '  browser    — Chrome DevTools Protocol specialist; routes task to CDP domains.',
      '  custom     — Octocode-capable worker by default; accepts explicit tools/systemPrompt/resourceMode.',
      '',
      'Same-batch rule: spawn and lifecycle ops with explicit agentIds cannot coexist.',
      'Spawn first, then use the returned agentId in a subsequent call.',
    ].join('\n'),

    promptSnippet:
      'Spawn/manage researcher, planner, architect, browser, or custom workers. Spawn first; use agentId later. Workers use MCPTool for repository research and the harness Awareness CLI for coordination; other shell access follows their role.',
    promptGuidelines: [
      'Use agent when a task needs independent context, its own tools, or parallel execution. Do NOT use agent for tasks a direct tool call, bash, or skill workflow already handles — prefer the simplest surface.',
      'Profile routing: researcher (web+GitHub+local research), planner (implementation planning), architect (root-cause/design), browser (CDP automation), custom (explicit tools/systemPrompt).',
      'Never mix spawn and agentId-bearing lifecycle queries in the same batch — spawn first, lifecycle next call.',
      'Provide a labelled task packet (Goal/Context/Scope/Acceptance/Return) in the task field to avoid vague handoffs.',
      'Use type:wait to collect the current turn before trusting a worker is complete. After wait or inspect, verify any key finding, distill it into session memory.md, and update the user when it changes the hypothesis, plan, risk, or next action; never persist or repeat a raw handback.',
      'Use type:kill after collecting results to free resources.',
      'Use type:inspect without agentId to list all agents; with agentId to check status.',
      'For plan work, start a runnable step first, then pass its stable task id as planStep so the worker receives paths, acceptance, and check contract.',
    ],

    parameters,

    async execute(
      toolCallId: string,
      rawParams: Record<string, unknown>,
      signal?: AbortSignal,
      onUpdate?: unknown,
      ctx?: PiContext,
    ): Promise<ToolCallResult> {
      // Cross-batch reference guard: checked before any item executes.
      const queriesRaw = Array.isArray(rawParams['queries'])
        ? (rawParams['queries'] as QueryRecord[])
        : [];
      rejectCrossBatchReference(queriesRaw);

      return executeQueryBatch({
        toolCallId,
        raw: rawParams,
        signal,
        onUpdate: onUpdate as ((update: ToolCallResult) => void) | undefined,
        ctx,
        passthroughSingle: true,
        preflight: async (query, index) => {
          const type = query['type'] as string | undefined;
          if (!type || !(AGENT_OPERATIONS as readonly string[]).includes(type)) {
            throw new Error(
              `queries[${index}].type must be one of: ${AGENT_OPERATIONS.join(', ')}.`,
            );
          }
          if (type === 'spawn') {
            const task = String(query['task'] ?? '').trim();
            if (!task) throw new Error(`queries[${index}]: spawn requires a non-empty task.`);
            const profile = String(query['profile'] ?? 'custom');
            if (!(AGENT_PROFILES as readonly string[]).includes(profile)) {
              throw new Error(`queries[${index}].profile must be one of: ${AGENT_PROFILES.join(', ')}.`);
            }
            return;
          }
          const agentId = String(query['agentId'] ?? '').trim();
          if (type !== 'inspect' && !agentId) {
            throw new Error(`queries[${index}]: ${type} requires agentId.`);
          }
          if ((type === 'message' || type === 'steer') && !String(query['message'] ?? '').trim()) {
            throw new Error(`queries[${index}]: ${type} requires a non-empty message.`);
          }
        },

        async execute(
          query: QueryRecord,
          _index: number,
          _itemId: string,
          itemSignal?: AbortSignal,
          _itemUpdate?: unknown,
          itemCtx?: PiContext,
        ): Promise<ToolCallResult> {
          const type = query['type'] as AgentOperation;
          if (type === 'spawn') return executeSpawnQuery(query, itemCtx, itemSignal);

          return executeAgentLifecycle(query, itemSignal, itemCtx);
        },

        summarize(result: ToolCallResult, query: QueryRecord) {
          const type = query['type'] as string;
          const text =
            (result.content.find((p) => p.type === 'text') as { text?: string } | undefined)
              ?.text ?? '';
          return `${type}: ${text.split('\n').find(Boolean)?.trim().slice(0, 80) ?? 'ok'}`;
        },
      });
    },

    renderCall(rawParams: unknown) {
      const raw = rawParams as {
        queries?: Array<{ type?: string; profile?: string; agentId?: string; task?: string }>;
      };
      const first = raw?.queries?.[0];
      const op = first?.type ?? '…';
      const detail = first?.profile
        ? ` profile:${first.profile}`
        : first?.agentId
          ? ` id:${String(first.agentId).slice(0, 8)}`
          : first?.task
            ? ` "${String(first.task).slice(0, 36)}${String(first.task).length > 36 ? '…' : ''}"`
            : '';
      const extra =
        (raw?.queries?.length ?? 0) > 1
          ? ` +${(raw.queries?.length ?? 1) - 1}`
          : '';
      return makeComponentRenderer((_props, { width: w }) =>
        [truncateToWidth(`agent(${op}${detail})${extra}`, w)], undefined,
      );
    },

    renderResult(result: unknown, _opts: unknown, theme?: PiTheme) {
      const r = result as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      const ok = !r?.isError;
      const text =
        (r?.content?.find((p) => p.type === 'text') as { text?: string } | undefined)?.text ?? '';
      const firstLine = text.split('\n').find(Boolean)?.trim() ?? (ok ? 'done' : 'failed');
      const glyph = ok
        ? paint(theme, 'success', CLI_GLYPH.success)
        : paint(theme, 'error', CLI_GLYPH.error);
      return makeComponentRenderer((_props, { width: w }) =>
        [truncateToWidth(`${glyph} agent · ${firstLine}`, w)], undefined,
      );
    },
  } satisfies ToolDefinition);
}
