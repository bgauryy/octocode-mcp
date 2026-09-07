/**
 * plan-lifecycle — review-phase transitions.
 * propose → accept → start → (rollback) → executing
 */

import {
  currentRfcRevision,
  clearPlanAwarenessMappings,
  cleanContractText,
  getPlan,
  getPlanReviewState,
  planApplyReviewTransition,
  planBuildTransitionError,
  planHasUnresolvedBlockers,
} from './plan-store.js';
import { depsMet } from './plan-types.js';
import type { PlanReviewTransitionResult } from './plan-types.js';

/** Enter review and bind the displayed revision to the exact current RFC bytes. */
export function proposePlanReview(cwd: string): PlanReviewTransitionResult {
  const state = getPlanReviewState(cwd);
  if (state.phase !== 'draft' && state.phase !== 'in_review') {
    return planBuildTransitionError(cwd, 'invalid_transition', `review.propose is not valid from ${state.phase}`);
  }
  if (planHasUnresolvedBlockers(state)) {
    return planBuildTransitionError(cwd, 'unresolved_blockers', 'review.propose requires all blocking questions and comments to be resolved');
  }
  const current = currentRfcRevision(cwd);
  if (!current.revision) {
    const code = current.error ?? 'rfc_unreadable';
    return planBuildTransitionError(cwd, code, code === 'missing_rfc' ? 'review.propose requires a linked RFC' : 'the linked RFC could not be read');
  }
  const todoSteps = getPlan(cwd).map((step) => ({ ...step, status: 'todo' as const }));
  return planApplyReviewTransition(cwd, 'in_review', {
    branchSnapshotId: state.branchSnapshotId,
    generation: state.generation,
    revision: current.revision,
    blockingQuestions: state.blockingQuestions,
    comments: state.comments,
  }, todoSteps, 'review');
}

/** Accept an in-review RFC revision with an optional authorization receipt. */
export function acceptPlanReview(cwd: string, displayedRevision: string, authorizationReceiptId?: string): PlanReviewTransitionResult {
  const state = getPlanReviewState(cwd);
  if (state.phase !== 'in_review') {
    return planBuildTransitionError(cwd, 'invalid_transition', `review.accept is not valid from ${state.phase}`);
  }
  if (planHasUnresolvedBlockers(state)) {
    return planBuildTransitionError(cwd, 'unresolved_blockers', 'review.accept requires all blocking questions and comments to be resolved');
  }
  const current = currentRfcRevision(cwd);
  if (!current.revision) {
    const code = current.error ?? 'rfc_unreadable';
    return planBuildTransitionError(cwd, code, code === 'missing_rfc' ? 'review.accept requires a linked RFC' : 'the linked RFC could not be read');
  }
  const displayed = displayedRevision.trim();
  if (!displayed || displayed !== state.revision || displayed !== current.revision) {
    return planBuildTransitionError(cwd, 'revision_changed', 'the displayed RFC revision no longer matches the canonical RFC bytes');
  }
  return planApplyReviewTransition(cwd, 'accepted', {
    branchSnapshotId: state.branchSnapshotId,
    generation: state.generation,
    revision: current.revision,
    acceptedRevision: current.revision,
    ...(authorizationReceiptId?.trim() ? { acceptAuthorizationReceiptId: authorizationReceiptId.trim() } : {}),
    acceptedAt: new Date().toISOString(),
    blockingQuestions: state.blockingQuestions,
    comments: state.comments,
  }, getPlan(cwd).map((step) => ({ ...step, status: 'todo' as const })));
}

/** Return an in-review or accepted RFC to draft; feedback always clears acceptance. */
export function requestPlanChanges(cwd: string): PlanReviewTransitionResult {
  const state = getPlanReviewState(cwd);
  if (state.phase !== 'in_review' && state.phase !== 'accepted') {
    return planBuildTransitionError(cwd, 'invalid_transition', `review.request_changes is not valid from ${state.phase}`);
  }
  return planApplyReviewTransition(cwd, 'draft', {
    branchSnapshotId: state.branchSnapshotId,
    generation: state.generation,
    revision: state.revision,
    blockingQuestions: state.blockingQuestions,
    comments: state.comments,
  }, getPlan(cwd).map((step) => ({ ...step, status: 'todo' as const })));
}

/** Start an accepted current revision and activate exactly one dependency-ready step. */
export function startAcceptedPlan(cwd: string, authorizationReceiptId: string): PlanReviewTransitionResult {
  const state = getPlanReviewState(cwd);
  if (state.phase !== 'accepted') {
    return planBuildTransitionError(cwd, 'invalid_transition', `implementation.start is not valid from ${state.phase}`);
  }
  if (planHasUnresolvedBlockers(state)) {
    return planBuildTransitionError(cwd, 'unresolved_blockers', 'implementation.start requires all blocking questions and comments to be resolved');
  }
  const receiptId = authorizationReceiptId.trim();
  if (!receiptId) {
    return planBuildTransitionError(cwd, 'authorization_required', 'implementation.start requires a valid human Start authorization receipt');
  }
  const current = currentRfcRevision(cwd);
  if (!current.revision || !state.acceptedRevision || current.revision !== state.acceptedRevision) {
    // Canonical bytes changed after acceptance. Return to draft.
    planApplyReviewTransition(cwd, 'draft', {
      branchSnapshotId: state.branchSnapshotId,
      generation: state.generation,
      blockingQuestions: state.blockingQuestions,
      comments: state.comments,
    }, getPlan(cwd).map((step) => ({ ...step, status: 'todo' as const })));
    return planBuildTransitionError(cwd, current.error ?? 'revision_changed', 'the accepted RFC revision no longer matches the canonical RFC bytes');
  }
  const steps = getPlan(cwd).map((step) => step.status === 'done' ? step : { ...step, status: 'todo' as const });
  const next = steps.findIndex((step) => step.status === 'todo' && depsMet(step, steps));
  if (next < 0) return planBuildTransitionError(cwd, 'no_runnable_step', 'implementation.start requires one dependency-ready step');
  steps[next] = { ...steps[next]!, status: 'doing' };
  return planApplyReviewTransition(cwd, 'executing', {
    branchSnapshotId: state.branchSnapshotId,
    generation: state.generation,
    revision: state.revision,
    acceptedRevision: state.acceptedRevision,
    acceptAuthorizationReceiptId: state.acceptAuthorizationReceiptId,
    startAuthorizationReceiptId: receiptId,
    acceptedAt: state.acceptedAt,
    startedAt: new Date().toISOString(),
    blockingQuestions: state.blockingQuestions,
    comments: state.comments,
  }, steps);
}

/** Recover a failed Start attempt without losing exact-revision acceptance. */
export function rollbackAcceptedPlanStart(cwd: string, reason: string): PlanReviewTransitionResult {
  const state = getPlanReviewState(cwd);
  clearPlanAwarenessMappings(cwd);
  if (!state.acceptedRevision) return planBuildTransitionError(cwd, 'invalid_transition', reason);
  return planApplyReviewTransition(cwd, 'accepted', {
    branchSnapshotId: state.branchSnapshotId,
    generation: state.generation,
    revision: state.revision,
    acceptedRevision: state.acceptedRevision,
    acceptAuthorizationReceiptId: state.acceptAuthorizationReceiptId,
    acceptedAt: state.acceptedAt,
    outcomeReason: cleanContractText(reason),
    blockingQuestions: state.blockingQuestions,
    comments: state.comments,
  }, getPlan(cwd).map((step) => {
    const { awarenessTaskId: _mapping, ...rest } = step;
    return { ...rest, status: 'todo' as const };
  }), 'compensate_start_failure');
}
