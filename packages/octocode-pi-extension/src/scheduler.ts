import {
  executeAwarenessCommand,
  type AwarenessCommandCall,
} from '@octocodeai/octocode-awareness';
import { buildAwarenessContext } from './tools/awareness-context.js';
import type { PiContext } from './types.js';

const DEFAULT_JOB_TIMEOUT_MS = 60_000;
const DEFAULT_CRON_JOB_NAME = 'awareness-status';
export const DEFAULT_AWARENESS_STATUS_INTERVAL_MS = 30 * 60 * 1000;

export type OctocodeCronJobStatus =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface OctocodeCronJobDefinition {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  enabledByDefault: boolean;
  awarenessRequest(ctx: PiContext | undefined): AwarenessCommandCall;
}

export interface OctocodeCronJobSnapshot {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  enabled: boolean;
  status: OctocodeCronJobStatus;
  running: boolean;
  nextRunAt?: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastExitCode?: number | null;
  lastMessage?: string;
}

interface MutableJobState {
  definition: OctocodeCronJobDefinition;
  enabled: boolean;
  status: OctocodeCronJobStatus;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  nextRunAt?: number;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastExitCode?: number | null;
  lastMessage?: string;
}

export interface OctocodeCronRunResult {
  job: string;
  status: OctocodeCronJobStatus;
  exitCode?: number | null;
  message: string;
}

export interface OctocodeCronScheduler {
  start(ctx?: PiContext): void;
  stop(): void;
  cancel(jobName?: string): string[];
  runNow(
    jobName: string | undefined,
    ctx?: PiContext
  ): Promise<OctocodeCronRunResult[]>;
  list(): OctocodeCronJobSnapshot[];
}

export interface OctocodeCronSchedulerOptions {
  run?: typeof executeAwarenessCommand;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  /** Called after each job run (success or failure). Use for proactive TUI notifications or cache refreshes. */
  onJobComplete?: (
    result: OctocodeCronRunResult,
    ctx: PiContext | undefined
  ) => void;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultJobs(env: NodeJS.ProcessEnv): OctocodeCronJobDefinition[] {
  return [
    {
      name: 'awareness-status',
      label: 'Awareness status',
      description:
        'Report-first Awareness status summary (status prunes expired locks/work rows as a side effect).',
      intervalMs: parsePositiveInt(
        env['OCTOCODE_CRON_STATUS_INTERVAL_MS'],
        DEFAULT_AWARENESS_STATUS_INTERVAL_MS
      ),
      enabledByDefault: env['OCTOCODE_CRON_STATUS'] === '1',
      awarenessRequest: () => ({ command: 'status' }),
    },
  ];
}

function normalizeJobName(jobName: string | undefined): string {
  const trimmed = jobName?.trim();
  if (!trimmed || trimmed === 'default') return DEFAULT_CRON_JOB_NAME;
  return trimmed;
}

function selectJobs(
  states: Map<string, MutableJobState>,
  jobName: string | undefined
): MutableJobState[] {
  const normalized = normalizeJobName(jobName);
  if (normalized === 'all' || normalized === '*') return [...states.values()];
  const state = states.get(normalized);
  return state ? [state] : [];
}

function truncateOutput(text: string, maxChars = 1200): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

export function createOctocodeCronScheduler(
  options: OctocodeCronSchedulerOptions = {}
): OctocodeCronScheduler {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const run = options.run ?? executeAwarenessCommand;
  const states = new Map<string, MutableJobState>();
  let active = false;
  let lastCtx: PiContext | undefined;

  for (const definition of defaultJobs(env)) {
    states.set(definition.name, {
      definition,
      enabled: definition.enabledByDefault,
      status: definition.enabledByDefault ? 'idle' : 'cancelled',
      running: false,
    });
  }

  const clearTimer = (state: MutableJobState): void => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    state.nextRunAt = undefined;
  };

  const schedule = (state: MutableJobState): void => {
    clearTimer(state);
    if (!active || !state.enabled || state.running) return;
    const delay = state.definition.intervalMs;
    state.nextRunAt = now() + delay;
    state.status = 'scheduled';
    state.timer = setTimeout(() => {
      void runOne(state.definition.name, lastCtx, true);
    }, delay);
    (state.timer as { unref?: () => void }).unref?.();
  };

  const runOne = async (
    jobName: string,
    ctx: PiContext | undefined,
    rescheduleAfterRun: boolean
  ): Promise<OctocodeCronRunResult> => {
    const state = states.get(jobName);
    if (!state) {
      return {
        job: jobName,
        status: 'failed',
        message: `Unknown cron job: ${jobName}`,
      };
    }
    clearTimer(state);
    if (state.running) {
      return {
        job: jobName,
        status: 'skipped',
        message: `${state.definition.label} is already running.`,
      };
    }

    state.running = true;
    state.status = 'running';
    state.lastStartedAt = now();
    state.lastMessage = undefined;
    let runResult: OctocodeCronRunResult | undefined;
    try {
      const result = await run(state.definition.awarenessRequest(ctx), {
        ...buildAwarenessContext(ctx),
        signal: AbortSignal.timeout(DEFAULT_JOB_TIMEOUT_MS),
      });
      const output = truncateOutput(
        result.text ?? JSON.stringify(result.payload)
      );
      state.lastExitCode = result.exitCode;
      state.status = result.exitCode === 0 ? 'succeeded' : 'failed';
      state.lastMessage =
        output ||
        (result.exitCode === 0
          ? 'completed'
          : `exited with ${result.exitCode}`);
      runResult = {
        job: jobName,
        status: state.status,
        exitCode: result.exitCode,
        message: state.lastMessage,
      };
      return runResult;
    } catch (error) {
      state.lastExitCode = 1;
      state.status = 'failed';
      state.lastMessage =
        error instanceof Error ? error.message : String(error);
      runResult = {
        job: jobName,
        status: 'failed',
        exitCode: 1,
        message: state.lastMessage,
      };
      return runResult;
    } finally {
      state.running = false;
      state.lastFinishedAt = now();
      if (rescheduleAfterRun) schedule(state);
      if (runResult) options.onJobComplete?.(runResult, ctx);
    }
  };

  return {
    start(ctx?: PiContext): void {
      lastCtx = ctx;
      active = env['OCTOCODE_CRON'] !== '0';
      for (const state of states.values()) {
        if (active && state.enabled) schedule(state);
        else if (!active) {
          clearTimer(state);
          state.status = 'cancelled';
        }
      }
    },

    stop(): void {
      active = false;
      for (const state of states.values()) clearTimer(state);
    },

    cancel(jobName?: string): string[] {
      const targets = selectJobs(states, jobName);
      for (const state of targets) {
        state.enabled = false;
        state.status = 'cancelled';
        clearTimer(state);
      }
      return targets.map(state => state.definition.name);
    },

    async runNow(
      jobName?: string,
      ctx?: PiContext
    ): Promise<OctocodeCronRunResult[]> {
      lastCtx = ctx ?? lastCtx;
      const normalized = normalizeJobName(jobName);
      const targets = selectJobs(states, jobName);
      if (targets.length === 0) {
        return [
          {
            job: normalized,
            status: 'failed',
            message: `Unknown cron job: ${normalized}`,
          },
        ];
      }
      const results: OctocodeCronRunResult[] = [];
      for (const state of targets)
        results.push(
          await runOne(state.definition.name, lastCtx, active && state.enabled)
        );
      return results;
    },

    list(): OctocodeCronJobSnapshot[] {
      return [...states.values()].map(state => ({
        name: state.definition.name,
        label: state.definition.label,
        description: state.definition.description,
        intervalMs: state.definition.intervalMs,
        enabled: state.enabled && active,
        status: state.status,
        running: state.running,
        nextRunAt:
          state.nextRunAt === undefined
            ? undefined
            : new Date(state.nextRunAt).toISOString(),
        lastStartedAt:
          state.lastStartedAt === undefined
            ? undefined
            : new Date(state.lastStartedAt).toISOString(),
        lastFinishedAt:
          state.lastFinishedAt === undefined
            ? undefined
            : new Date(state.lastFinishedAt).toISOString(),
        lastExitCode: state.lastExitCode,
        lastMessage: state.lastMessage,
      }));
    },
  };
}
