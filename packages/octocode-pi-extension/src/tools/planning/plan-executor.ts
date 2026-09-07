/**
 * plan-executor — step-level mutations.
 * addStep, startStep, completeStep, removeStep, restorePlanSteps, activatePlan, hasActivePlanWork
 */

import {
  getPlan,
  getPlanLifecycle,
  phaseAllowsExecution,
  normalizeInput,
  dependencyIdsFromIndexes,
  planSetRawSteps,
  planSetRawLifecycle,
  planDeleteClearedScope,
  planMarkUpdated,
  planRunPersist,
  planRunEnsureLoaded,
} from './plan-store.js';
import { depsMet } from './plan-types.js';
import type { PlanStep, PlanStepInput } from './plan-types.js';

/** Promote an accepted draft and start its first runnable step. */
export function activatePlan(cwd: string): PlanStep[] {
  const list = getPlan(cwd).slice();
  if (list.length > 0 && !list.some((step) => step.status === 'doing')) {
    const next = list.findIndex((step) => step.status === 'todo' && depsMet(step, list));
    if (next >= 0) list[next] = { ...list[next]!, status: 'doing' };
  }
  planSetRawSteps(cwd, list);
  planSetRawLifecycle(cwd, 'executing');
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return list;
}

/**
 * Whether the scope has an actively owned in-progress step. Auto-compaction uses
 * this stricter signal so stale todo/blocked plan state after a finished turn
 * cannot trigger a surprise compaction; it should fire only while work is live.
 */
export function hasActivePlanWork(cwd: string): boolean {
  return getPlan(cwd).some((step) => step.status === 'doing');
}

export function addStep(cwd: string, input: PlanStepInput): PlanStep[] {
  const list = getPlan(cwd).slice();
  const normalized = normalizeInput(input);
  const MAX_STEPS = 40;
  if (normalized.text && list.length < MAX_STEPS) {
    const { dependsOn: inputDependencies, ...stable } = normalized;
    const dependsOnStepIds = dependencyIdsFromIndexes(inputDependencies, list, stable.id);
    list.push({ ...stable, status: 'todo', ...(dependsOnStepIds ? { dependsOnStepIds } : {}) });
  }
  planSetRawSteps(cwd, list);
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return list;
}

/**
 * Mark a step (1-based) doing.
 *
 * Starting a second runnable step intentionally does NOT demote an existing
 * doing step: independent plan lanes can run in parallel.
 */
export function startStep(cwd: string, index: number): PlanStep[] {
  const list = getPlan(cwd).slice();
  if (!phaseAllowsExecution(getPlanLifecycle(cwd))) return list;
  const i = index - 1;
  if (i >= 0 && i < list.length) list[i] = { ...list[i]!, status: 'doing' };
  planSetRawSteps(cwd, list);
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return list;
}

/** Restore an exact local step snapshot when a post-mutation shared projection fails. */
export function restorePlanSteps(cwd: string, snapshot: readonly PlanStep[]): PlanStep[] {
  planRunEnsureLoaded(cwd);
  const restored = snapshot.map((step) => ({
    ...step,
    ...(step.dependsOnStepIds ? { dependsOnStepIds: [...step.dependsOnStepIds] } : {}),
    ...(step.paths ? { paths: [...step.paths] } : {}),
  }));
  planSetRawSteps(cwd, restored);
  if (restored.length > 0) planDeleteClearedScope(cwd);
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return restored;
}

/** Mark a step (1-based) done and auto-advance the next todo to doing. */
export function completeStep(cwd: string, index: number): PlanStep[] {
  const list = getPlan(cwd).slice();
  if (!phaseAllowsExecution(getPlanLifecycle(cwd))) return list;
  const i = index - 1;
  if (i >= 0 && i < list.length) {
    list[i] = { ...list[i]!, status: 'done' };
    if (!list.some((s) => s.status === 'doing')) {
      const nextTodo = list.findIndex((s) => s.status === 'todo' && depsMet(s, list));
      if (nextTodo >= 0) list[nextTodo] = { ...list[nextTodo]!, status: 'doing' };
    }
  }
  planSetRawSteps(cwd, list);
  if (list.length > 0 && list.every((step) => step.status === 'done')) {
    planSetRawLifecycle(cwd, 'verifying');
  }
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return list;
}

/**
 * Remove a step (1-based). Dependencies are kept consistent: deps on the
 * removed step are dropped, deps pointing past it are renumbered. If the
 * removed step was the only active one, the next satisfiable todo auto-advances.
 */
export function removeStep(cwd: string, index: number): PlanStep[] {
  const list = getPlan(cwd).slice();
  const i = index - 1;
  if (i < 0 || i >= list.length) return list;
  const [removed] = list.splice(i, 1);
  const next = list.map((step) => {
    if (!step.dependsOnStepIds?.length || !removed) return step;
    const dependencies = step.dependsOnStepIds.filter((id) => id !== removed.id);
    const { dependsOnStepIds: _dropped, ...rest } = step;
    return dependencies.length ? { ...rest, dependsOnStepIds: dependencies } : rest;
  });
  if (phaseAllowsExecution(getPlanLifecycle(cwd)) && next.length > 0 && !next.some((s) => s.status === 'doing')) {
    const nextTodo = next.findIndex((s) => s.status === 'todo' && depsMet(s, next));
    if (nextTodo >= 0) next[nextTodo] = { ...next[nextTodo]!, status: 'doing' };
  }
  planSetRawSteps(cwd, next);
  planMarkUpdated(cwd);
  planRunPersist(cwd);
  return next;
}


