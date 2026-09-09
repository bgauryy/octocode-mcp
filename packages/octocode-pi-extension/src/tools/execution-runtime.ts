import { randomUUID } from 'node:crypto';
import type { PiContext, PiInstance } from '../types.js';
import type { RuntimeStore } from './runtime-store.js';
import { runtimeStoreFor } from './runtime-renderer.js';
import {
  EXECUTION_ENTRY_TYPE,
  isExecutionEvent,
  type ExecutionEvent,
  type ExecutionPayloads,
  type ExecutionState,
} from './execution-events.js';
import type { PlanReadModelV1 } from './plan-read-model.js';
import type { AgentFooterEntry } from '../ui-extras.js';
import { effectiveAgentStatus } from './agents/display-state.js';

interface Journal {
  sessionId: string;
  runId: string;
  turnId?: string;
  persist?: (event: ExecutionEvent) => void;
}
const journals = new WeakMap<RuntimeStore, Journal>();

function journalFor(store: RuntimeStore, ctx: PiContext): Journal {
  let journal = journals.get(store);
  if (!journal) {
    const sessionId = ctx.sessionManager?.getSessionId?.() || randomUUID();
    journal = { sessionId, runId: `${sessionId}:main` };
    journals.set(store, journal);
  }
  return journal;
}

/** Pi's append-only state channel owns persistence; it never enters model context. */
export function bindExecutionJournal(pi: PiInstance, ctx: PiContext): void {
  const store = runtimeStoreFor(ctx);
  if (!store) return;
  const journal = journalFor(store, ctx);
  journal.persist = event => pi.appendEntry?.(EXECUTION_ENTRY_TYPE, event);
  restoreExecutionJournal(ctx);
  emitExecution(ctx, 'session.started', {
    cwd: ctx.cwd,
    model: ctx.model?.id,
    provider: ctx.model?.provider,
  });
}

export function readExecutionEvents(ctx: PiContext): ExecutionEvent[] {
  return (ctx.sessionManager?.getBranch?.() ?? []).flatMap(entry => {
    const value = entry as {
      type?: string;
      customType?: string;
      data?: unknown;
    };
    if (value.type !== 'custom' || value.customType !== EXECUTION_ENTRY_TYPE)
      return [];
    if (!isExecutionEvent(value.data))
      throw new Error('Cannot read an invalid execution event');
    return [value.data];
  });
}

/** Tree navigation replaces the projection with its selected ancestry before publishing new facts. */
export function restoreExecutionJournal(ctx: PiContext): void {
  const store = runtimeStoreFor(ctx);
  if (!store) return;
  let events: ExecutionEvent[];
  try {
    events = readExecutionEvents(ctx);
  } catch (error) {
    store
      .getState()
      .setStatus(
        'octocode-event-log',
        'Cannot replay an invalid execution event'
      );
    throw error;
  }
  store.getState().restoreExecution(events);
  const journal = journalFor(store, ctx);
  journal.turnId = store.getState().execution.activeTurnId;
  if (journal.turnId)
    emitExecution(
      ctx,
      'session.completed',
      { reason: 'interrupted before resume' },
      'debug'
    );
  expireExecutionInteractions(ctx);
}

/** Observe an expired durable request on resume, sampling, or explicit inspection. */
export function expireExecutionInteractions(
  ctx: PiContext | undefined,
  now = Date.now()
): void {
  const state: ExecutionState | undefined =
    runtimeStoreFor(ctx)?.getState().execution;
  if (!state) return;
  for (const item of Object.values(state.interactions)) {
    if (
      item.status === 'waiting' &&
      item.persistent &&
      item.expiresAt !== undefined &&
      item.expiresAt <= now
    )
      emitExecution(
        ctx,
        `${item.kind}.resolved`,
        { id: item.id, decision: 'timed_out' },
        'transcript'
      );
  }
}

export function emitExecution<K extends keyof ExecutionPayloads>(
  ctx: PiContext | undefined,
  type: K,
  payload: ExecutionPayloads[K],
  visibility: ExecutionEvent['visibility'] = 'activity'
): ExecutionEvent | undefined {
  const store = runtimeStoreFor(ctx);
  if (
    !store ||
    !ctx ||
    store.getState().phase === 'disposed' ||
    store.getState().phase === 'disposing'
  )
    return undefined;
  const journal = journalFor(store, ctx);
  if (type === 'turn.started') journal.turnId = randomUUID();
  const event = {
    version: 1,
    id: randomUUID(),
    sessionId: journal.sessionId,
    runId: journal.runId,
    ...(journal.turnId ? { turnId: journal.turnId } : {}),
    sequence: store.getState().execution.sequence + 1,
    timestamp: Date.now(),
    visibility,
    type,
    payload,
  } as ExecutionEvent;
  store.getState().recordExecution(event);
  try {
    journal.persist?.(event);
  } catch {
    store
      .getState()
      .setStatus(
        'octocode-event-log',
        'Event history unavailable; live activity continues'
      );
  }
  if (type === 'turn.completed' || type === 'session.completed')
    journal.turnId = undefined;
  return event;
}

/** Capture changed canonical plan/worker facts on events and ticks, never during rendering. */
export function syncExecutionEntities(
  ctx: PiContext,
  plan: PlanReadModelV1,
  workers: readonly AgentFooterEntry[]
): void {
  const state = runtimeStoreFor(ctx)?.getState().execution;
  if (!state) return;
  const projectedPlan = {
    id: plan.planId,
    phase: plan.phase,
    revision: plan.revision,
    tasks: plan.tasks.map(task => ({
      id: task.id,
      title: task.text,
      status: task.status,
    })),
  };
  if (
    (plan.tasks.length > 0 || state.plan) &&
    JSON.stringify(state.plan) !== JSON.stringify(projectedPlan)
  )
    emitExecution(ctx, 'plan.updated', projectedPlan, 'transcript');
  for (const worker of workers) {
    const projected = {
      id: worker.agentId,
      name: worker.name,
      parentRunId: state.runId ?? 'main',
      status: effectiveAgentStatus(worker),
      task: worker.task,
      activity: worker.activeTool,
      startedAt: Date.parse(worker.startedAt) || undefined,
      updatedAt: Date.parse(worker.updatedAt) || 0,
    };
    if (
      JSON.stringify(state.agents[worker.agentId]) !== JSON.stringify(projected)
    )
      emitExecution(ctx, 'agent.updated', projected, 'activity');
  }
}
