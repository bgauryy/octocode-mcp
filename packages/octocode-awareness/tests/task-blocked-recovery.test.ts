import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb } from '../src/db-init.js';
import { createPlan, updatePlanStatus } from '../src/plans.js';
import { getTask } from '../src/tasks-catalog.js';
import { addTaskDependency, createTask, listReadyTasks } from '../src/tasks-ready.js';
import { claimTask, releaseTaskClaim, retryTask } from '../src/tasks-claims.js';

describe('explicit blocked task recovery', () => {
  let db: DatabaseSync;
  let workspace: string;
  let planId: string;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    initDb(db);
    workspace = mkdtempSync(join(tmpdir(), 'oc-blocked-recovery-'));
    planId = createPlan(db, {
      name: 'Recover blocked work', objective: 'Resume after an external blocker clears.',
      leadAgentId: 'lead', workspacePath: workspace,
    }).plan.plan_id;
  });

  afterEach(() => {
    db.close();
    rmSync(workspace, { recursive: true, force: true });
  });

  function task(title: string) {
    return createTask(db, {
      planId, title, reasoning: 'External prerequisite', acceptanceCriteria: 'Check passes',
      paths: [`src/${title}.ts`], createdBy: 'lead',
    }).task;
  }

  function blockedTask() {
    const created = task('blocked');
    const claim = claimTask(db, { taskId: created.task_id, agentId: 'worker' });
    if (!claim.ok) throw new Error(claim.error);
    releaseTaskClaim(db, {
      taskId: created.task_id, runId: claim.run.run_id, agentId: 'worker',
      blockedReason: 'Waiting for external input',
    });
    return { taskId: created.task_id, previousRunId: claim.run.run_id };
  }

  it('requires an explicit lead retry, preserves the failed run, and permits a fresh claim', () => {
    const { taskId, previousRunId } = blockedTask();
    expect(getTask(db, taskId)?.status).toBe('BLOCKED');
    expect(listReadyTasks(db, { planId })).toHaveLength(0);
    expect(() => retryTask(db, { taskId, agentId: 'worker' })).toThrow(/only lead agent lead/);
    expect(getTask(db, taskId)?.status).toBe('BLOCKED');

    expect(retryTask(db, { taskId, agentId: 'lead', message: 'External input received' }).status).toBe('OPEN');
    const resumed = claimTask(db, { taskId, agentId: 'worker' });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.run.run_id).not.toBe(previousRunId);
    expect(db.prepare('SELECT status FROM task_runs WHERE run_id = ?').get(previousRunId))
      .toEqual({ status: 'FAILED' });
  });

  it('preserves unmet dependency gates when the lead reopens a blocked task', () => {
    const { taskId } = blockedTask();
    const dependency = task('dependency');
    addTaskDependency(db, { taskId, dependsOnTaskId: dependency.task_id, agentId: 'lead' });
    retryTask(db, { taskId, agentId: 'lead' });
    expect(getTask(db, taskId)?.dependencies).toEqual([dependency.task_id]);
    expect(listReadyTasks(db, { planId }).map(row => row.task_id)).toEqual([dependency.task_id]);
    expect(claimTask(db, { taskId, agentId: 'worker' })).toMatchObject({
      ok: false, error: 'task is blocked by unfinished dependencies',
    });
  });

  it('does not let retry bypass a paused plan', () => {
    const { taskId } = blockedTask();
    updatePlanStatus(db, { planId, agentId: 'lead', status: 'PAUSED' });
    expect(() => retryTask(db, { taskId, agentId: 'lead' })).toThrow(/plan status is PAUSED/);
    expect(getTask(db, taskId)?.status).toBe('BLOCKED');
  });
});
