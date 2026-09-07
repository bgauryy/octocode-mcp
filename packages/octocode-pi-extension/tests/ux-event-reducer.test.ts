import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createUxEventState,
  reconcileUxEvents,
  reduceUxEvent,
  selectUxEvents,
  type UxEventV1,
} from '../src/tools/ux-event-reducer.js';
import type { UxSnapshotV1 } from '../src/tools/ux-snapshot.js';

function event(overrides: Partial<UxEventV1> = {}): UxEventV1 {
  return {
    version: 1,
    id: 'event-1',
    entityId: 'tool-1',
    entityKind: 'tool',
    nextState: 'running',
    source: 'runtime',
    sourceSequence: 1,
    observedAt: 1_000,
    expiresAt: 5_000,
    label: 'Indexing repository',
    severity: 'info',
    requiresAction: false,
    detailRoute: 'transcript',
    ...overrides,
  };
}

function snapshot(): UxSnapshotV1 {
  return {
    version: 1,
    observedAt: 10_000,
    session: { phase: 'ready', activity: { kind: 'idle', label: 'Idle', since: 10_000 }, elapsedMs: 9_000, observationTime: 10_000 },
    goal: {},
    plan: undefined,
    tasks: [{ id: 'task-1', index: 1, label: 'Ship', status: 'done', dependencies: [], verification: 'passed', updatedAt: 10_000 }],
    agents: [],
    attention: [],
    messages: { unread: 0, queued: 0, detailRoute: '/octocode-inbox' },
    provenance: [{ owner: 'plan', sequence: 3, observedAt: 10_000, stale: false }],
  };
}

test('rejects out-of-order events and coalesces same-state heartbeats', () => {
  let state = createUxEventState();
  state = reduceUxEvent(state, event());
  state = reduceUxEvent(state, event({ id: 'event-2', sourceSequence: 3, observedAt: 3_000 }));
  state = reduceUxEvent(state, event({ id: 'stale', sourceSequence: 2, observedAt: 4_000, nextState: 'complete' }));

  assert.equal(state.staleRejected, 1);
  assert.equal(state.coalesced, 1);
  assert.equal(selectUxEvents(state, 4_000)[0]?.sourceSequence, 3);
  assert.equal(selectUxEvents(state, 4_000)[0]?.nextState, 'running');
});

test('expires transient activity but never silently expires an actionable blocker', () => {
  let state = createUxEventState();
  state = reduceUxEvent(state, event());
  state = reduceUxEvent(state, event({
    id: 'blocked', entityId: 'agent-1', entityKind: 'agent', nextState: 'blocked',
    sourceSequence: 1, expiresAt: 2_000, severity: 'warning', requiresAction: true,
  }));

  const visible = selectUxEvents(state, 9_000);
  assert.deepEqual(visible.map((item) => item.id), ['blocked']);
});

test('reconciles task events against canonical snapshot state after reload', () => {
  let state = createUxEventState();
  state = reduceUxEvent(state, event({
    id: 'task-running', entityId: 'task-1', entityKind: 'task', nextState: 'doing',
    source: 'worker', sourceSequence: 8, expiresAt: undefined,
  }));
  state = reduceUxEvent(state, event({
    id: 'agent-blocked', entityId: 'agent-1', entityKind: 'agent', nextState: 'blocked',
    source: 'worker', sourceSequence: 2, requiresAction: true, expiresAt: undefined,
  }));

  state = reconcileUxEvents(state, snapshot());
  assert.equal(state.reconciledAt, 10_000);
  assert.deepEqual(selectUxEvents(state, 10_000).map((item) => item.id), ['agent-blocked']);
});
