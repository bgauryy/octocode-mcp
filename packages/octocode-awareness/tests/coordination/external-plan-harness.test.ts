import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectExternalPlan, type ExternalPlanProjectionInput } from '../../src/coordination/external-plan.js';
import { openAwarenessStore } from '../../src/coordination/open.js';
import { defaultDbPath } from '../../src/coordination/coordination-shared.js';
import { writeWorkspacePolicy } from '../../src/workspace-policy.js';
import { connectDb } from '../../src/db-runtime.js';

let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'aw-harness-entities-'));
  vi.stubEnv('OCTOCODE_HOME', join(workspace, 'home'));
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });

const step = (id: string, status: 'todo' | 'doing' = 'doing') => ({
  id, status, text: `Implement ${id}`, paths: [`src/${id}.ts`],
  reasoning: 'Independent host execution lane.', acceptance: 'Observed check passes.', checkCommand: 'node --version',
});
const input = (): ExternalPlanProjectionInput => ({ requestedScope: 'shared', workspace, sourceKind: 'pi',
  sourcePlanKey: 'host-plan', title: 'Parallel host plan', goal: 'One ledger for both execution lanes.',
  agentId: 'pi:owner', steps: [step('one'), step('two')] });

it('claims every parallel doing step with distinct runs and reuses identities on replay', () => {
  const first = projectExternalPlan(input());
  const repeated = projectExternalPlan(input());
  expect(repeated.taskIdsByStepId).toEqual(first.taskIdsByStepId);
  const store = openAwarenessStore({ workspace });
  try {
    const tasks = store.listTasks({ planId: first.awarenessPlanId });
    expect(tasks).toHaveLength(2);
    expect(tasks.map(task => task.status)).toEqual(['IN_PROGRESS', 'IN_PROGRESS']);
    expect(new Set(tasks.map(task => task.runId)).size).toBe(2);
    expect(tasks.every(task => task.agentId === 'pi:owner')).toBe(true);
  } finally { store.close(); }
});

it('does not silently accept a terminal database task as a doing host step', () => {
  const original = projectExternalPlan(input());
  const store = openAwarenessStore({ workspace });
  try {
    const task = store.getTask(original.taskIdsByStepId!.one!);
    store.releaseTask({ taskId: task.taskId, runId: task.runId!, agentId: 'pi:owner', blockedReason: 'Cannot continue yet' });
  } finally { store.close(); }
  expect(() => projectExternalPlan(input())).toThrow(/BLOCKED/);
});

it('rolls back materialization and earlier claims when a later parallel step is blocked', () => {
  const invalid = input();
  invalid.steps = [step('one'), { ...step('two'), dependsOnStepIds: ['one'] }];
  expect(() => projectExternalPlan(invalid)).toThrow(/blocked/);
  const store = openAwarenessStore({ workspace });
  try {
    expect(store.listPlans()).toEqual([]);
    expect(store.listTasks({})).toEqual([]);
    expect(store.auditChecks({ agentId: 'pi:owner' }).pending).toEqual([]);
    const db = connectDb(store.dbPath);
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM task_runs').get()).toMatchObject({ count: 0 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM task_claims').get()).toMatchObject({ count: 0 });
    } finally { db.close(); }
  } finally { store.close(); }
});

it('uses workspace repository policy for native adapters, preserving explicit overrides', () => {
  writeWorkspacePolicy(workspace, { version: 1, storage: { repository: 'repo', memory: 'repo' }, hooks: { profile: 'full' } });
  const projected = projectExternalPlan(input());
  const repo = openAwarenessStore({ workspace, scope: 'repo' });
  try { expect(repo.listTasks({ planId: projected.awarenessPlanId })).toHaveLength(2); }
  finally { repo.close(); }
  expect(existsSync(defaultDbPath(workspace, 'global'))).toBe(false);
  const explicit = openAwarenessStore({ workspace, scope: 'global' });
  try { expect(explicit.listPlans()).toEqual([]); } finally { explicit.close(); }
  const custom = openAwarenessStore({ workspace, dbPath: join(workspace, 'custom.sqlite3') });
  try { expect(custom.dbPath).toBe(join(workspace, 'custom.sqlite3')); } finally { custom.close(); }
});

it('keeps an existing mapped plan shared when automatic scope has no active claim', () => {
  const draft = { ...input(), steps: [step('one', 'todo')] };
  const original = projectExternalPlan(draft);
  expect(projectExternalPlan({ ...draft, requestedScope: 'auto', awarenessPlanId: original.awarenessPlanId,
    steps: [{ ...draft.steps[0]!, awarenessTaskId: original.taskIdsByStepId!.one }] }))
    .toMatchObject({ scope: 'shared', awarenessPlanId: original.awarenessPlanId, taskIdsByStepId: original.taskIdsByStepId });
});
