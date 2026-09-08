import assert from 'node:assert/strict';
import { test } from 'vitest';
import { selectStatusRows, type StatusDensity } from '../src/tui/status-policy.js';
import type { UxSnapshotV1 } from '../src/tools/ux-snapshot.js';

function snapshot(overrides: Partial<UxSnapshotV1> = {}): UxSnapshotV1 {
  return {
    version: 1,
    observedAt: 10_000,
    session: {
      phase: 'ready',
      activity: { kind: 'working', label: 'Working · task 2 Implement', since: 8_000 },
      elapsedMs: 9_000,
      contextPressure: 61,
      observationTime: 10_000,
    },
    goal: { text: 'Ship adaptive status', nextAction: 'Run verification' },
    plan: {
      id: 'plan-1', phase: 'executing', revision: 'rev-1', total: 4, displayTotal: 4,
      done: 1, active: 1, ready: 1, blocked: 1, verifying: 0, failed: 0,
      dynamic: false, progressMode: 'linear', detailRoute: 'plan',
    },
    tasks: [
      { id: 't1', index: 1, label: 'Research', status: 'done', dependencies: [], verification: 'passed', updatedAt: 10_000 },
      { id: 't2', index: 2, label: 'Implement', activeLabel: 'Implementing', status: 'doing', dependencies: [1], verification: 'pending', updatedAt: 10_000 },
    ],
    agents: [],
    attention: [],
    messages: { unread: 0, queued: 0, detailRoute: '/octocode-inbox' },
    provenance: [],
    ...overrides,
  };
}

function agent(index: number, state = 'running') {
  return {
    id: `agent-${index}`, label: `worker-${index}`, state, pendingMessages: 0,
    elapsedMs: 2_000, updatedAt: 10_000 - index,
  };
}

test('automatic density obeys the 15% soft budget and six-row hard maximum', () => {
  for (const [height, expected] of [[10, 1], [20, 3], [40, 6], [80, 6]] as const) {
    const result = selectStatusRows(snapshot({
      attention: [{
        id: 'context', kind: 'context_pressure', priority: 'P3', severity: 'warning', actor: 'Context',
        reason: '96% used', requiredAction: 'Compact', detailRoute: '/configuration', createdAt: 10_000,
      }],
      agents: Array.from({ length: 8 }, (_, index) => agent(index)),
    }), { width: 80, height, density: 'automatic' });
    assert.equal(result.maxRows, expected, `height ${height}`);
    assert.ok(result.rows.length <= expected, `height ${height}`);
  }
});

test('compact and expanded density override row targets without changing priority', () => {
  const source = snapshot({
    attention: [{
      id: 'input', kind: 'input', priority: 'P0', severity: 'warning', actor: 'Octocode',
      reason: 'Start plan?', requiredAction: 'Answer prompt', detailRoute: 'interaction', createdAt: 10_000,
    }],
  });
  const compact = selectStatusRows(source, { width: 80, height: 80, density: 'compact' });
  const expanded = selectStatusRows(source, { width: 80, height: 80, density: 'expanded' });
  assert.equal(compact.maxRows, 2);
  assert.ok(expanded.maxRows > compact.maxRows);
  assert.equal(compact.rowIds[0], 'attention:input');
  assert.equal(expanded.rowIds[0], 'attention:input');
});

test('normal agent count is bounded while blocked and failed agents are individually identifiable', () => {
  const result = selectStatusRows(snapshot({
    agents: [
      ...Array.from({ length: 100 }, (_, index) => agent(index)),
      { ...agent(101, 'blocked'), label: 'atlas' },
      { ...agent(102, 'failed'), label: 'nova' },
    ],
  }), { width: 120, height: 40, density: 'automatic' });
  const rowText = result.rows.map((row) => row.map((segment) => segment.text).join(' '));
  const text = rowText.join('\n');
  assert.ok(rowText.some((row) => /atlas.*blocked.*\/octocode-inbox/i.test(row)));
  assert.ok(rowText.some((row) => /nova.*failed.*\/octocode-inbox/i.test(row)));
  const summary = rowText.find((row) => /Agents 102.*100 running.*\/octocode-inbox/i.test(row));
  assert.ok(summary);
  assert.doesNotMatch(summary!, /blocked|failed/i, 'named attention states are not duplicated in the aggregate row');
  assert.ok(result.rows.length <= 6);
  assert.doesNotMatch(text, /worker-99/);
});

test('compact mode groups active outcome facts so worker attention stays visible', () => {
  const result = selectStatusRows(snapshot({
    agents: [
      { ...agent(1, 'blocked'), label: 'atlas' },
      { ...agent(2, 'failed'), label: 'nova' },
    ],
  }), { width: 80, height: 40, density: 'compact' });
  const text = result.rows.map((row) => row.map((segment) => segment.text).join(' ')).join('\n');
  assert.ok(result.rows.length <= 2);
  assert.match(text, /atlas blocked/);
  assert.match(text, /nova failed/);
  assert.match(text, /\/octocode-inbox/);
});

test('P0 attention preempts diagnostics and always preserves an action route', () => {
  const result = selectStatusRows(snapshot({
    attention: [{
      id: 'permission', kind: 'authorization', priority: 'P0', severity: 'warning', actor: 'Octocode',
      reason: 'Permission required', requiredAction: 'Review command', detailRoute: '/configuration', createdAt: 10_000,
    }],
  }), {
    width: 36,
    height: 10,
    density: 'automatic',
    diagnostics: [{ id: 'model', priority: 'P4', segments: [{ text: 'model openai/gpt-5.6' }] }],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rowIds[0], 'attention:permission');
  assert.match(result.rows[0]!.map((segment) => segment.text).join(' '), /Permission required.*\/configuration/);
});

test('dynamic progress reports state counts without a fixed denominator', () => {
  const source = snapshot({
    plan: {
      ...snapshot().plan!, progressMode: 'dynamic', dynamic: true, displayTotal: undefined,
      done: 3, active: 2, ready: 1, blocked: 2, total: 8,
    },
  });
  const result = selectStatusRows(source, { width: 120, height: 40, density: 'automatic' });
  const text = result.rows[result.rowIds.indexOf('plan:progress')]!.map((segment) => segment.text).join(' ');
  assert.match(text, /3 done.*2 active.*scope changing/);
  assert.doesNotMatch(text, /3\/8|%/);
});

test('heartbeat-only changes preserve selected row identities and height', () => {
  const before = selectStatusRows(snapshot(), { width: 80, height: 40, density: 'automatic' });
  const after = selectStatusRows(snapshot({
    observedAt: 11_000,
    session: { ...snapshot().session, elapsedMs: 10_000, observationTime: 11_000 },
  }), { width: 80, height: 40, density: 'automatic' });
  assert.deepEqual(after.rowIds, before.rowIds);
  assert.equal(after.rows.length, before.rows.length);
});

test('selection is deterministic for every density regardless of attention input order', () => {
  const attention = [
    { id: 'b', kind: 'messages' as const, priority: 'P2' as const, severity: 'info' as const, actor: 'Messages', reason: '2 pending', detailRoute: '/octocode-inbox', createdAt: 9_000 },
    { id: 'a', kind: 'input' as const, priority: 'P0' as const, severity: 'warning' as const, actor: 'Octocode', reason: 'Answer', detailRoute: 'interaction', createdAt: 10_000 },
  ];
  for (const density of ['automatic', 'compact', 'expanded'] as StatusDensity[]) {
    const normal = selectStatusRows(snapshot({ attention }), { width: 80, height: 40, density });
    const reversed = selectStatusRows(snapshot({ attention: [...attention].reverse() }), { width: 80, height: 40, density });
    assert.deepEqual(reversed.rowIds, normal.rowIds);
  }
});
