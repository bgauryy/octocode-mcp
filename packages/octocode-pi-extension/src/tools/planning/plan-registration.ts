/**
 * plan-registration — tool schema, execute handler, and registration.
 * Owns: inferConsequential, executePlanQuery (tool execute), registerPlanTool.
 * Imports from planning module split; does not import from active-plan or plan-tool.
 */

import path from 'node:path';
import type { ToolDefinition, ToolCallResult, PiContext, PiTheme, RenderResultOptions } from '../../types.js';
import type { registerUniqueTool } from '../octocode-tools.js';
import { CLI_STATUS_TEXT } from '../../tui/cli-design.js';
import { runAskPrompt, type AskOutcome } from '../ask-user-tool.js';
import {
  consumeHumanAuthorizationReceipt,
  createHumanAuthorizationReceipt,
  createHumanAuthorizationReceiptFromInteraction,
} from '../interaction-broker.js';
import { planArtifactsDir } from '../plan-html.js';
import {
  PLAN_APPROVE_DESC,
  PLAN_APPROVE_LABEL,
  PLAN_APPROVAL_HEADER,
  PLAN_PROPOSE_HINT,
  PLAN_REJECT_DESC,
  PLAN_REJECT_LABEL,
  PLAN_RFC_REVIEW_HEADER,
} from '../../tui/content.js';
import { buildQueryCallBlocks, buildToolView } from '../render-helpers.js';
import { setManagedActivity } from '../runtime-renderer.js';
import {
  completeExternalPlanTask,
  finalizeExternalPlan,
  type ObservedCheckReceipt,
  type ExternalPlanScope,
} from '@octocodeai/octocode-awareness';
import { getAwarenessAgentId } from '../awareness-shared.js';
import { assertPersistentAwarenessEnabled } from '../storage-policy.js';
import { buildQueryEnvelopeSchema, executeQueryBatch, type QueryRecord } from '../query-envelope.js';
import { appendSessionAuditForContext } from '../session-audit.js';

// ─── Planning modules ────────────────────────────────────────────────────────
import {
  activePlanScope,
  setPlan,
  setPlanLifecycle,
  finishPlanVerification,
  clearPlan,
  getPlan,
  getPlanReviewState,
  getPlanCoordination,
  updatePlanCoordination,
  setPlanAwarenessMappings,
  resolveRfcPath,
  setPlanRfc,
  getPlanRfc,
  addPlanDecision,
  getPlanDecisions,
} from './plan-store.js';
import { activatePlan, addStep, startStep, restorePlanSteps, completeStep, removeStep } from './plan-executor.js';
import {
  proposePlanReview,
  acceptPlanReview,
  requestPlanChanges,
  startAcceptedPlan,
  rollbackAcceptedPlanStart,
} from './plan-lifecycle.js';
import {
  renderList,
  planPresentation,
  planWorkspace,
  configurePlanScope,
  requestedPlanScope,
  ensureUnifiedProjection,
  buildRfcReviewTldr,
  projectPlanIndexes,
  writeCurrentPlanArtifacts,
  sharedStartContractError,
} from './plan-presentation.js';
import {
  tearDownPlanHtml,
  refreshPlanUi,
  startReviewedPlan,
  buildPlanStartAuthorizationOptionId,
  setPlanBrowserMessageSender,
} from './plan-command.js';
import { stepLabel, depsMet, type PlanStep, type StepInput } from './plan-types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** At/above this step count a plan is treated as consequential regardless of self-report. */
const CONSEQUENTIAL_STEP_COUNT = 5;
/** Risk vocabulary that flags consequential work in a step's text. */
const RISK_RE = /\b(migrat|schema|auth|delete|\bdrop\b|truncate|rename|breaking|public[\s-]?api|secret|credential|\btoken\b|encrypt|permission|rollback|backfill|lockfile|release)\w*/i;

/** Cap on questions per clarify call — a bounded interview, not an interrogation. */
const MAX_CLARIFY = 3;

type TypeBoxBuilder = (typeof import('typebox'))['Type'];
type RegisterFn = typeof registerUniqueTool;
type PlanAction = 'set' | 'propose' | 'clarify' | 'add' | 'start' | 'complete' | 'remove' | 'clear' | 'show';

/** One clarify-phase question: a prompt plus optional multiple-choice options. */
interface ClarifyQuestion {
  prompt: string;
  options?: Array<{ value?: string; label: string; description?: string; recommended?: boolean; pros?: string[]; cons?: string[] }>;
}

interface PlanParams extends QueryRecord {
  action: PlanAction;
  scope?: ExternalPlanScope;
  receipt?: ObservedCheckReceipt;
  steps?: StepInput[];
  text?: string;
  activeForm?: string;
  dependsOn?: number[];
  paths?: string[];
  taskReasoning?: string;
  acceptance?: string;
  checkCommand?: string;
  index?: number;
  /** For reviewed action:start — the exact displayed RFC revision. */
  revision?: string;
  /** For noninteractive reviewed action:start — the answered authorization interaction. */
  authorizationInteractionId?: string;
  /** For propose: require RFC review when true; false plus reason may justify overriding heuristic inference. */
  consequential?: boolean;
  /** For set/propose: path to the reviewable RFC (a `.octocode/rfc/<name>/` dir or its RFC.md). Renders on the plan page. */
  rfcPath?: string;
  /** For action:clarify — up to 3 high-impact questions to ask the user before proposing. */
  questions?: ClarifyQuestion[];
  /** Required with consequential:false to override the heuristic. */
  reason?: string;
  /** For shared scope: coordination metadata. */
  localReason?: string;
  coordinationWorkspace?: string;
}

// ─── Exported helpers ─────────────────────────────────────────────────────

/**
 * Heuristic "does this look consequential?" from the proposed steps alone — step
 * count and risk vocabulary. Pure and exported for testing. Returns the verdict
 * plus the human-readable signals that fired (for the gate's block message).
 */
export function inferConsequential(steps: StepInput[]): { consequential: boolean; signals: string[] } {
  const texts = steps.map((s) => (typeof s === 'string' ? s : s?.text ?? ''));
  const signals: string[] = [];
  if (texts.length >= CONSEQUENTIAL_STEP_COUNT) signals.push(`${texts.length} steps`);
  const hits = new Set<string>();
  for (const t of texts) {
    const m = t.match(RISK_RE);
    if (m) hits.add(m[0].toLowerCase());
  }
  if (hits.size) signals.push(`risk terms: ${[...hits].slice(0, 4).join(', ')}`);
  return { consequential: signals.length > 0, signals };
}

// ─── Private execute helpers ──────────────────────────────────────────────────

function auditPlanEvent(
  ctx: PiContext | undefined,
  scope: string,
  event: string,
  detail: Record<string, unknown> = {},
): void {
  const review = getPlanReviewState(scope);
  appendSessionAuditForContext(ctx, {
    event: `plan.${event}`,
    detail: {
      phase: review.phase,
      generation: review.generation,
      steps: getPlan(scope).length,
      ...detail,
    },
  });
}

/**
 * Core per-query plan executor — the body of what was the monolithic `execute`.
 * Handles one action (PlanParams) against the given ctx and returns a
 * ToolCallResult. Called from inside `executeQueryBatch` per query.
 */
async function executePlanQuery(p: PlanParams, ctx: PiContext | undefined): Promise<ToolCallResult> {
  const scope = activePlanScope(ctx);
  let steps: PlanStep[];
  // Reject unavailable shared writes before changing the local plan or its scope.
  if (p.action !== 'show' && p.action !== 'clarify'
    && (requestedPlanScope(scope, p.scope) === 'shared' || getPlanCoordination(scope).awarenessPlanId)) {
    assertPersistentAwarenessEnabled();
  }

  // ── Clarify phase (interview) ───────────────────────────────────────────
  if (p.action === 'clarify') {
    const clarifyResult = (text: string, isError = false, extraDetails: Record<string, unknown> = {}): ToolCallResult => ({
      content: [{ type: 'text' as const, text }],
      ...(isError ? { isError: true } : {}),
      details: { action: 'clarify', decisions: getPlanDecisions(scope), ...extraDetails },
    }) as unknown as ToolCallResult;
    const questions = (Array.isArray(p.questions) ? p.questions : []).filter((q) => q && String(q.prompt ?? '').trim()).slice(0, MAX_CLARIFY);
    if (questions.length === 0) {
      return clarifyResult('[PLAN] clarify needs a questions[] list (≤3 high-impact questions the repo cannot answer). Skip clarify for obvious work.', true);
    }
    if (!ctx) {
      return clarifyResult(`[PLAN] this host cannot prompt — ask these inline and continue:\n${questions.map((q, i) => `${i + 1}. ${q.prompt}`).join('\n')}`);
    }
    const recorded: string[] = [];
    let halted: string | undefined;
    let pendingInteraction: AskOutcome['interaction'] | undefined;
    // Use a mutable index so back-navigation can revisit a prior question.
    let qi = 0;
    while (qi < questions.length) {
      const q = questions[qi]!;
      const prompt = String(q.prompt).trim();
      const outcome = await runAskPrompt(ctx, {
        question: prompt,
        options: q.options?.map((o) => ({
          value: o.value ?? o.label,
          label: o.label,
          description: o.description,
          recommended: o.recommended,
          pros: o.pros,
          cons: o.cons,
        })),
      });
      if (outcome.status === 'pending') {
        pendingInteraction = outcome.interaction;
        halted = `[PLAN] clarify paused pending continuation (correlation=${outcome.interaction?.correlationId ?? 'unavailable'})`;
        break;
      }
      if (outcome.status === 'unavailable') {
        // Host cannot prompt; store the question as-is and move on.
        addPlanDecision(scope, prompt, '(awaiting user reply)');
        recorded.push(prompt);
        qi++;
        continue;
      }
      const answer = outcome.status === 'text' ? (outcome.value ?? '').trim() : outcome.status === 'selected' ? String(outcome.value ?? '') : '';
      if (!answer) { qi++; continue; }
      addPlanDecision(scope, prompt, answer);
      recorded.push(prompt);
      qi++;
    }
    if (recorded.length > 0) auditPlanEvent(ctx, scope, 'clarify', { decisionsRecorded: recorded.length });
    const decisionsText = recorded.length > 0
      ? `[PLAN] ${recorded.length} decision(s) recorded. Proceed to propose.`
      : '[PLAN] no new decisions recorded.';
    if (halted) {
      return clarifyResult(halted, false, {
        pendingInteraction: {
          version: pendingInteraction!.version,
          interactionId: pendingInteraction!.interactionId,
          correlationId: pendingInteraction!.correlationId,
          sessionId: pendingInteraction!.sessionId,
        },
        continuation: { version: 1, adapter: 'interaction-broker', resumeOn: ['answer', 'session_start'] },
      });
    }
    return clarifyResult(decisionsText);
  }

  // ── RFC gate (set/propose only) ───────────────────────────────────────
  const resolveGate = (): { rfc?: string; hasNewRfc: boolean; error?: ToolCallResult } => {
    const gateError = (text: string, error = 'rfc-gate'): ToolCallResult => ({
      content: [{ type: 'text' as const, text }],
      isError: true,
      details: { action: p.action, error },
    }) as unknown as ToolCallResult;
    const supplied = typeof p.rfcPath === 'string' ? p.rfcPath.trim() : '';
    if (supplied) {
      const res = resolveRfcPath(planWorkspace(scope), supplied);
      if (res.error) {
        return { hasNewRfc: false, error: gateError(`[PLAN] rfcPath ${supplied} could not be resolved: ${res.error}`, 'rfc-unresolvable') };
      }
      const existingRfc = getPlanRfc(scope);
      return { rfc: res.path!, hasNewRfc: res.path !== existingRfc };
    }
    const existingRfc = getPlanRfc(scope);
    if (existingRfc) return { rfc: existingRfc, hasNewRfc: false };
    if (p.action === 'propose' || (p.action === 'set' && p.consequential !== false)) {
      const steps = Array.isArray(p.steps) ? p.steps : [];
      const consequence = inferConsequential(steps);
      const isConsequential = p.consequential ?? consequence.consequential;
      if (isConsequential) {
        const signals = consequence.signals.join('; ');
        return {
          hasNewRfc: false,
          error: gateError(
            `[PLAN] consequential proposal requires a reviewable RFC (${signals}). Create or update .octocode/rfc/<name>/RFC.md and pass rfcPath, or set consequential:false with a non-empty reason that justifies the override.`,
            'rfc-required',
          ),
        };
      }
    }
    return { rfc: existingRfc, hasNewRfc: false };
  };

  switch (p.action) {
    case 'set': {
      const gate = resolveGate();
      if (gate.error) return gate.error;
      steps = setPlan(scope, Array.isArray(p.steps) ? p.steps : []);
      configurePlanScope(scope, p.scope);
      if (gate.hasNewRfc) setPlanRfc(scope, gate.rfc);
      ensureUnifiedProjection(scope, p.scope, ctx);
      steps = getPlan(scope);
      writeCurrentPlanArtifacts(ctx, scope, 'active');
      break;
    }
    case 'propose': {
      ctx?.ui?.notify?.('Creating plan…', 'info');
      setManagedActivity(ctx, { kind: 'planning', planScope: scope, detail: 'Creating plan…' });
      const gate = resolveGate();
      if (gate.error) {
        refreshPlanUi(ctx);
        return gate.error;
      }
      steps = setPlan(scope, Array.isArray(p.steps) ? p.steps : [], 'draft');
      configurePlanScope(scope, p.scope);
      if (gate.hasNewRfc) setPlanRfc(scope, gate.rfc);

      if (gate.rfc) {
        const proposed = proposePlanReview(scope);
        if (!proposed.ok) {
          return {
            content: [{ type: 'text' as const, text: `[PLAN] could not enter RFC review: ${proposed.message}` }],
            isError: true,
            details: { action: p.action, error: proposed.code, steps: proposed.steps },
          } as unknown as ToolCallResult;
        }
        steps = proposed.steps;
        const revision = proposed.state.revision!;
        const artifacts = writeCurrentPlanArtifacts(ctx, scope, 'draft');
        refreshPlanUi(ctx);
        setManagedActivity(ctx, { kind: 'reviewing', planScope: scope, revision });
        const summary = buildRfcReviewTldr(scope, steps, revision, artifacts);
        const planId = getPlanCoordination(scope).sourcePlanKey;
        const startOptionId = buildPlanStartAuthorizationOptionId(planId, revision);
        auditPlanEvent(ctx, scope, 'propose', { revision });
        const outcome = ctx
          ? await runAskPrompt(ctx, {
              question: `Plan overview ready · rev ${revision.slice(0, 8)} · ${steps.length} step${steps.length === 1 ? '' : 's'} — start implementation?`,
              headerLabel: PLAN_RFC_REVIEW_HEADER,
              kind: 'authorization',
              freeTextLabel: 'Request changes',
              options: [
                {
                  value: 'start',
                  brokerId: startOptionId,
                  label: PLAN_APPROVE_LABEL,
                  description: 'approve this exact RFC revision and begin the first runnable step',
                  recommended: true,
                  preview: summary,
                },
                {
                  value: 'changes',
                  label: PLAN_REJECT_LABEL,
                  description: PLAN_REJECT_DESC,
                  preview: summary,
                },
              ],
            })
          : undefined;

        if (outcome?.status === 'selected' && outcome.value === 'start') {
          const started = startReviewedPlan(scope, revision, ctx);
          if (!started.ok) {
            return {
              content: [{ type: 'text', text: `[PLAN] implementation did not start: ${started.message}\n\n${summary}` }],
              isError: true,
              details: { action: p.action, ...planPresentation(ctx, scope), error: 'start-failed', revision },
            } as unknown as ToolCallResult;
          }
          steps = started.steps;
          const activeArtifacts = writeCurrentPlanArtifacts(ctx, scope, 'active');
          refreshPlanUi(ctx);
          const verdict = `[PLAN] approved and started · rev ${revision.slice(0, 8)}`;
          auditPlanEvent(ctx, scope, 'start', { revision, source: 'propose' });
          return {
            content: [{ type: 'text', text: `${verdict}\n${renderList(steps)}` }],
            details: { action: p.action, ...planPresentation(ctx, scope), verdict, revision, decision: 'start', ...(activeArtifacts ? { artifacts: activeArtifacts } : {}) },
          } as unknown as ToolCallResult;
        }

        if (outcome?.status === 'selected' && outcome.value === 'changes') {
          const changed = requestPlanChanges(scope);
          if (changed.ok) writeCurrentPlanArtifacts(ctx, scope, 'draft');
          refreshPlanUi(ctx);
          const verdict = '[PLAN] changes requested — revise the RFC and re-propose.';
          auditPlanEvent(ctx, scope, 'changes', { revision, feedbackProvided: false });
          return {
            content: [{ type: 'text', text: `${verdict}\n${summary}` }],
            details: {
              action: p.action,
              ...planPresentation(ctx, scope),
              verdict,
              revision,
              decision: outcome?.status ?? 'unavailable',
              ...(artifacts ? { artifacts } : {}),
            },
          } as unknown as ToolCallResult;
        }

        if (outcome?.status === 'text' && outcome.value) {
          const feedback = outcome.value.trim();
          const changed = requestPlanChanges(scope);
          if (changed.ok) writeCurrentPlanArtifacts(ctx, scope, 'draft');
          refreshPlanUi(ctx);
          const verdict = `[PLAN] adjust requested: ${feedback}\nRevise the RFC and re-propose.`;
          auditPlanEvent(ctx, scope, 'changes', { revision, feedbackProvided: Boolean(feedback) });
          return {
            content: [{ type: 'text', text: `${verdict}\n${summary}` }],
            details: {
              action: p.action,
              ...planPresentation(ctx, scope),
              verdict,
              revision,
              decision: outcome.status,
              ...(artifacts ? { artifacts } : {}),
            },
          } as unknown as ToolCallResult;
        }

        const verdict = (() => {
          if (!outcome || outcome.status === 'unavailable') {
            return '[PLAN] proposed for RFC review — this host cannot prompt. The plan is ready; issue \'Start\' explicitly when ready.';
          }
          if (outcome.status === 'pending') {
            return `[PLAN] approval pending (correlation=${outcome.interaction?.correlationId ?? 'unavailable'}) — do not execute until the durable host continuation records approval.`;
          }
          return '[PLAN] rejected — do not execute. Ask the user how to proceed.';
        })();

        let pageNote = artifacts
          ? `\nPlan doc: ${artifacts.mdPath}`
          : '\nPlan doc could not be written — continuing with the in-terminal plan.';
        return {
          content: [{ type: 'text', text: `${verdict}\n${renderList(steps)}${pageNote}` }],
          details: {
            action: p.action,
            ...planPresentation(ctx, scope),
            verdict,
            revision,
            decision: outcome?.status ?? 'unavailable',
            ...(outcome?.status === 'pending' && outcome.interaction ? {
              pendingInteraction: {
                version: outcome.interaction.version,
                interactionId: outcome.interaction.interactionId,
                correlationId: outcome.interaction.correlationId,
                sessionId: outcome.interaction.sessionId,
              },
              continuation: { version: 1, adapter: 'interaction-broker', resumeOn: ['answer', 'session_start'] },
            } : {}),
            ...(artifacts ? { artifacts } : {}),
          },
        } as unknown as ToolCallResult;
      }

      // Non-RFC propose (simple approval gate)
      const artifacts = writeCurrentPlanArtifacts(ctx, scope, 'draft');
      refreshPlanUi(ctx);
      auditPlanEvent(ctx, scope, 'propose');
      const outcome = ctx
        ? await runAskPrompt(ctx, {
            question: `${steps.length} step${steps.length === 1 ? '' : 's'} in the panel below — ${PLAN_PROPOSE_HINT}`,
            headerLabel: PLAN_APPROVAL_HEADER,
            options: [
              {
                value: 'start',
                label: PLAN_APPROVE_LABEL,
                description: PLAN_APPROVE_DESC,
                recommended: true,
              },
              {
                value: 'reject',
                label: PLAN_REJECT_LABEL,
                description: PLAN_REJECT_DESC,
              },
            ],
          })
        : undefined;
      const approved = outcome?.status === 'selected' && outcome.value === 'start';
      if (approved) {
        steps = activatePlan(scope);
        ensureUnifiedProjection(scope, p.scope, ctx);
        steps = getPlan(scope);
        refreshPlanUi(ctx);
        auditPlanEvent(ctx, scope, 'start', { source: 'propose' });
      }
      const proposeVerdict = (() => {
        if (!outcome || outcome.status === 'unavailable') {
          return '[PLAN] proposed, but this host cannot prompt — present the plan inline and get approval in your reply before executing.';
        }
        if (outcome.status === 'pending') {
          return `[PLAN] approval pending (correlation=${outcome.interaction?.correlationId ?? 'unavailable'}) — do not execute until the durable host continuation records approval.`;
        }
        if (approved) {
          return '[PLAN] approved and started — keep steps updated via complete.';
        }
        if (outcome.status === 'text' && outcome.value) {
          return `[PLAN] adjust requested: ${outcome.value}\nRevise the plan and re-propose.`;
        }
        return '[PLAN] rejected — do not execute. Ask the user how to proceed.';
      })();

      let pageNote = artifacts
        ? `\nPlan doc: ${artifacts.mdPath}`
        : '\nPlan doc could not be written — continuing with the in-terminal plan.';
      if (approved) {
        const approvedArtifacts = writeCurrentPlanArtifacts(ctx, scope, 'approved');
        pageNote = approvedArtifacts
          ? `\nPlan doc: ${approvedArtifacts.mdPath}\nPlan HTML: ${approvedArtifacts.htmlPath}\n/octocode-plan html opens the visual plan.`
          : '\n/octocode-plan html opens the visual plan.';
      }
      return {
        content: [{ type: 'text', text: `${proposeVerdict}\n${renderList(steps)}${pageNote}` }],
        details: {
          action: p.action,
          ...planPresentation(ctx, scope),
          verdict: proposeVerdict,
          ...(outcome?.status === 'pending' && outcome.interaction ? {
            pendingInteraction: {
              version: outcome.interaction.version,
              interactionId: outcome.interaction.interactionId,
              correlationId: outcome.interaction.correlationId,
              sessionId: outcome.interaction.sessionId,
            },
            continuation: { version: 1, adapter: 'interaction-broker', resumeOn: ['answer', 'session_start'] },
          } : {}),
        },
      } as unknown as ToolCallResult;
    }
    case 'add':
      steps = addStep(scope, {
        text: String(p.text ?? ''),
        ...(p.activeForm ? { activeForm: p.activeForm } : {}),
        ...(p.dependsOn ? { dependsOn: p.dependsOn } : {}),
        ...(p.paths ? { paths: p.paths } : {}),
        ...(p.taskReasoning ? { reasoning: p.taskReasoning } : {}),
        ...(p.acceptance ? { acceptance: p.acceptance } : {}),
        ...(p.checkCommand ? { checkCommand: p.checkCommand } : {}),
      });
      if (getPlanCoordination(scope).awarenessPlanId) {
        ensureUnifiedProjection(scope, p.scope, ctx);
        steps = getPlan(scope);
      }
      writeCurrentPlanArtifacts(ctx, scope, 'active');
      break;
    case 'start':
    case 'complete':
    case 'remove': {
      const current = getPlan(scope);
      const planError = (msg: string, error: string) => ({
        content: [{ type: 'text' as const, text: `${msg}\n${renderList(current)}` }],
        isError: true,
        details: { action: p.action, ...planPresentation(ctx, scope), error },
      }) as unknown as ToolCallResult;
      if (current.length === 0) {
        return planError(`[PLAN] no active plan — nothing to ${p.action}. Use plan set first.`, 'invalid-index');
      }
      const reviewState = getPlanReviewState(scope);
      const reviewPhase = reviewState.phase;
      if (p.action === 'start' && (reviewPhase === 'in_review' || reviewPhase === 'accepted')) {
        const revision = p.revision?.trim();
        const interactionId = p.authorizationInteractionId?.trim();
        const recoveringAcceptedStart = reviewPhase === 'accepted' && !interactionId;
        if (!revision || p.index !== undefined || (reviewPhase === 'in_review' && !interactionId)) {
          return planError('[PLAN] reviewed implementation Start requires the exact revision; an in-review plan also requires authorizationInteractionId from the answered human Start interaction. index is not valid for this transition.', 'authorization-required');
        }
        if (recoveringAcceptedStart && !reviewState.acceptAuthorizationReceiptId) {
          return planError('[PLAN] the accepted plan has no persisted human authorization receipt and cannot be resumed without a new answered Start interaction.', 'authorization-required');
        }
        const planId = getPlanCoordination(scope).sourcePlanKey;
        const started = startReviewedPlan(scope, revision, ctx, interactionId ? {
          interactionId,
          expectedOptionId: buildPlanStartAuthorizationOptionId(planId, revision),
        } : undefined);
        if (!started.ok) {
          refreshPlanUi(ctx);
          return planError(`[PLAN] implementation did not start: ${started.message}`, 'authorization-required');
        }
        steps = started.steps;
        writeCurrentPlanArtifacts(ctx, scope, 'active');
        refreshPlanUi(ctx);
        auditPlanEvent(ctx, scope, 'start', { revision, source: recoveringAcceptedStart ? 'accepted-recovery' : 'interaction' });
        return {
          content: [{ type: 'text' as const, text: `[PLAN] approved and started · rev ${revision.slice(0, 8)}\n${renderList(steps)}` }],
          details: { action: p.action, ...planPresentation(ctx, scope), revision, decision: 'start' },
        } as unknown as ToolCallResult;
      }
      if (p.action === 'start' && reviewPhase !== 'executing' && reviewPhase !== 'verifying') {
        return planError(`[PLAN] implementation cannot start from ${reviewPhase}; propose the plan for review and obtain an explicit human Start decision first.`, 'authorization-required');
      }
      if (p.action === 'complete' && reviewPhase !== 'executing' && reviewPhase !== 'verifying' && reviewPhase !== 'complete') {
        return planError(`[PLAN] a step cannot complete while the plan is ${reviewPhase}; Start implementation first.`, 'phase-not-executing');
      }
      let idx: number;
      if (p.index === undefined || p.index === null) {
        if (p.action === 'start') {
          idx = current.findIndex((s) => s.status === 'todo' && depsMet(s, current)) + 1;
        } else {
          const doing = current.map((s, i) => ({ step: s, index: i + 1 })).filter(({ step }) => step.status === 'doing');
          if (doing.length > 1) {
            return planError(`[PLAN] multiple steps are in progress (${doing.map((d) => d.index).join(', ')}); pass index to complete or remove the target step.`, 'ambiguous-index');
          }
          idx = (doing[0]?.index ?? 0);
        }
        if (idx < 1) {
          return planError(`[PLAN] no dependency-ready step to ${p.action}. Pass index to target a specific step.`, 'no-runnable-step');
        }
      } else {
        idx = p.index;
      }
      if (idx < 1 || idx > current.length) {
        return planError(`[PLAN] no such step ${p.index} — plan has ${current.length} step(s). Run plan show for indices.`, 'invalid-index');
      }
      if (p.action === 'start' && !depsMet(current[idx - 1]!, current)) {
        return planError(`[PLAN] step ${idx} is blocked by dependencies — complete its prerequisites before starting it.`, 'blocked-step');
      }
      const target = current[idx - 1]!;
      if (p.action === 'remove' && target.awarenessTaskId) {
        return planError('[PLAN] mapped shared steps cannot be removed in place; abandon or revise the shared plan explicitly.', 'shared-remove');
      }
      if (p.action === 'complete' && target.awarenessTaskId) {
        const coordination = getPlanCoordination(scope);
        try {
          assertPersistentAwarenessEnabled();
          const shared = completeExternalPlanTask({
            workspace: coordination.coordinationWorkspace || planWorkspace(scope),
            taskId: target.awarenessTaskId,
            agentId: getAwarenessAgentId(ctx),
            ...(p.receipt ? { receipt: p.receipt } : {}),
          });
          if (!shared.verified) {
            return planError(`[PLAN] observed check failed; shared task ${shared.task.taskId} has verification debt and the local step remains in progress.`, 'check-failed');
          }
        } catch (error) {
          return planError(`[PLAN] shared completion blocked: ${error instanceof Error ? error.message : String(error)}`, 'shared-completion');
        }
      }
      const beforeStart = p.action === 'start' ? current.map((step) => ({ ...step })) : undefined;
      steps = p.action === 'start' ? startStep(scope, idx) : p.action === 'complete' ? completeStep(scope, idx) : removeStep(scope, idx);
      if ((p.action === 'start' || p.action === 'complete') && getPlanCoordination(scope).awarenessPlanId) {
        try {
          ensureUnifiedProjection(scope, p.scope, ctx);
        } catch (error) {
          if (p.action !== 'start' || !beforeStart) throw error;
          restorePlanSteps(scope, beforeStart);
          return planError(`[PLAN] step did not start; local status and Awareness mapping were restored after shared projection failed: ${error instanceof Error ? error.message : String(error)}`, 'shared-start-projection');
        }
        steps = getPlan(scope);
      }
      if (p.action === 'complete' && steps.every((step) => step.status === 'done')) {
        refreshPlanUi(ctx);
        const coordination = getPlanCoordination(scope);
        let verified = true;
        if (coordination.awarenessPlanId) {
          assertPersistentAwarenessEnabled();
          verified = finalizeExternalPlan({
            workspace: coordination.coordinationWorkspace || planWorkspace(scope),
            planId: coordination.awarenessPlanId,
            agentId: getAwarenessAgentId(ctx),
          });
        }
        if (verified) finishPlanVerification(scope, true, 'All declared task checks passed');
        else setPlanLifecycle(scope, 'blocked', 'Shared tasks still have verification debt');
        steps = getPlan(scope);
      }
      writeCurrentPlanArtifacts(ctx, scope, 'active');
      break;
    }
    case 'clear': {
      const current = getPlan(scope);
      if (current.some((step) => step.awarenessTaskId) && current.some((step) => step.status !== 'done')) {
        return {
          content: [{ type: 'text' as const, text: '[PLAN] mapped shared plans cannot be cleared while work is unfinished; complete or abandon the shared work first.' }],
          isError: true,
          details: { action: p.action, error: 'shared-clear', ...planPresentation(ctx, scope) },
        } as unknown as ToolCallResult;
      }
      clearPlan(scope);
      tearDownPlanHtml(scope);
      projectPlanIndexes(ctx, undefined);
      steps = [];
      break;
    }
    case 'show':
    default:
      steps = getPlan(scope);
      break;
  }
  refreshPlanUi(ctx);
  if (p.action !== 'show') {
    auditPlanEvent(ctx, scope, p.action, p.index === undefined ? {} : { index: p.index });
  }
  const done = steps.filter((s) => s.status === 'done').length;
  const header = p.action === 'clear' ? '[PLAN] cleared' : `[PLAN] ${done}/${steps.length} done`;
  const artifactHint = (p.action === 'set' || p.action === 'add' || p.action === 'start' || p.action === 'complete' || p.action === 'remove') && steps.length > 0
    ? `\nPlan doc: ${path.join(planArtifactsDir(scope), 'plan.md')}`
    : '';
  const baseNote = artifactHint;
  const taskIds = steps.length > 0
    ? `\nTask IDs for agent.planStep: ${steps.map((step, index) => `${index + 1}=${step.id}`).join(', ')}`
    : '';
  return {
    content: [{ type: 'text', text: `${header}\n${renderList(steps)}${taskIds}${baseNote}` }],
    details: { action: p.action, ...planPresentation(ctx, scope) },
  } as unknown as ToolCallResult;
}

// ─── Tool registration ─────────────────────────────────────────────────────────

export function registerPlanTool(
  pi: {
    registerTool?(def: ToolDefinition): void;
    sendUserMessage?(message: string, options?: { deliverAs?: 'steer' | 'followUp'; expandPromptTemplates?: boolean }): void | Promise<void>;
  },
  Type: TypeBoxBuilder,
  registeredToolNames: Set<string>,
  registerFn: RegisterFn,
): void {
  setPlanBrowserMessageSender(pi.sendUserMessage
    ? (message) => pi.sendUserMessage!(message, {
        deliverAs: 'followUp',
        expandPromptTemplates: false,
      })
    : undefined);
  registerFn(pi, registeredToolNames, {
    name: 'plan',
    label: 'Plan',
    description: [
      'Track a canonical, compaction-durable checklist for non-trivial multi-step or risky work; skip obvious single-step tasks. The footer shows progress/current work, while show and generated plan artifacts retain full detail.',
      'Every call uses queries:[{reasoning, action, ...}]. Put lifecycle fields inside each query item; root-level action fields are invalid.',
      'Use clarify only for unresolved decision-changing blockers; set for already-authorized work; propose with an RFC for review; add/start/complete/remove to keep execution truthful; clear when done or abandoned.',
      'RFC review uses one user decision: Start approves the exact displayed bytes and begins implementation; Request changes returns the plan to draft.',
      'Multiple independent steps may be doing in parallel. Use scope:"shared" for persistent multi-agent execution; it automatically projects stable steps, dependencies, ownership, and verification receipts into Awareness from one internal call. Shared tasks can only be completed via action:"complete" with an observed check receipt.',
      'action:"start" without index begins the first dependency-ready todo step. action:"complete" without index completes the current doing step. action:"remove" without index removes the current doing step.',
      'Shared task IDs are returned in the response and in the plan footer. The agent.planStep tool (if available) reads them for task-level Awareness operations; the plan tool handles ownership and projection automatically, so avoid duplicating that work once the task is done or abandoned. Shared task projection, ownership, dependencies, check receipts, and finalization are internal to plan; there is no separate public task tool.',
      'For independent lanes, encode ordering with dependsOn, start runnable lanes with action:"start" and index:N before batching or spawning, and pass explicit indices when completing parallel steps.',
      'Give active steps a concise activeForm (for example, "Editing file"). The footer shows plan progress and current or blocking work; action:"show", plan.md, and plan.html retain the complete checklist.',
      'Plan lifecycle prompts are reserved for clarification, proposal approval, and consequential RFC review. Actions "set", "start", and "complete" never interrupt execution with presentation-only questions; use /octocode-plan html only when the user asks for the visual plan. The tool returns plan.md and plan.html paths for explicit review.',
    ],
    parameters: buildQueryEnvelopeSchema(Type, Type.Object({
      action: Type.Unsafe({ type: 'string', enum: ['set', 'propose', 'clarify', 'add', 'start', 'complete', 'remove', 'clear', 'show'], description: 'Plan lifecycle operation; use the matching action branch and fields.' }),
      scope: Type.Optional(Type.Unsafe({ type: 'string', enum: ['auto', 'session', 'shared'], description: 'Projection policy. auto stays local unless safely adopting existing shared ownership.' })),
      receipt: Type.Optional(Type.Object({
        command: Type.String({ minLength: 1, description: 'The exact declared check command that was actually run.' }),
        status: Type.Unsafe({ type: 'string', enum: ['SUCCESS', 'FAILED'], description: 'Observed check result.' }),
        message: Type.String({ minLength: 1, description: 'Concise observed result, such as test counts or failure cause.' }),
      }, { additionalProperties: false, description: 'For action:complete on shared tasks, the observed check receipt recorded atomically with completion.' })),
      steps: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({
              text: Type.String(),
              activeForm: Type.Optional(Type.String({ description: 'Present-continuous label shown while this step runs, e.g. "Editing file".' })),
              dependsOn: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), { description: '1-based indices of steps that must be done first; converted to stable step identities when stored.' })),
              paths: Type.Optional(Type.Array(Type.String(), { description: 'Workspace-relative paths this task may change.' })),
              reasoning: Type.Optional(Type.String({ description: 'Why this task exists or may omit paths.' })),
              acceptance: Type.Optional(Type.String({ description: 'Observable done state for this task.' })),
              checkCommand: Type.Optional(Type.String({ description: 'Command that verifies this task after DONE.' })),
            }),
          ]),
          { minItems: 1, maxItems: 100, description: 'Non-empty replacement checklist for set/propose; strings are shorthand for {text}.' },
        ),
      ),
      text: Type.Optional(Type.String({ description: 'Step text for action:add.' })),
      activeForm: Type.Optional(Type.String({ description: 'Present-continuous form for action:add, e.g. "Editing file".' })),
      dependsOn: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), { description: '1-based indices for action:add step dependencies.' })),
      paths: Type.Optional(Type.Array(Type.String(), { description: 'Paths for action:add.' })),
      taskReasoning: Type.Optional(Type.String({ description: 'Why the step exists or why it has no path scope. For action:add.' })),
      acceptance: Type.Optional(Type.String({ description: 'Observable done state for action:add.' })),
      checkCommand: Type.Optional(Type.String({ description: 'Verification command for action:add.' })),
      index: Type.Optional(Type.Integer({ minimum: 1, description: '1-based step index for start/complete/remove when targeting a specific step.' })),
      revision: Type.Optional(Type.String({ description: 'For reviewed action:start — the exact displayed RFC revision string.' })),
      authorizationInteractionId: Type.Optional(Type.String({ description: 'For noninteractive reviewed action:start — the interaction ID from the answered human Start interaction.' })),
      consequential: Type.Optional(Type.Boolean({ description: 'For propose: true requires RFC review; false with a non-empty reason overrides heuristic inference.' })),
      rfcPath: Type.Optional(Type.String({ description: 'For set/propose: path to the RFC file or directory. Required for consequential proposals.' })),
      questions: Type.Optional(Type.Array(Type.Object({
        prompt: Type.String({ description: 'The clarification question.' }),
        options: Type.Optional(Type.Array(Type.Object({
          value: Type.Optional(Type.String()),
          label: Type.String(),
          description: Type.Optional(Type.String()),
          recommended: Type.Optional(Type.Boolean()),
          pros: Type.Optional(Type.Array(Type.String())),
          cons: Type.Optional(Type.Array(Type.String())),
        }))),
      }), { maxItems: 3, description: 'For action:clarify — up to 3 high-impact questions.' })),
      reason: Type.Optional(Type.String({ description: 'For consequential:false — required justification for overriding the heuristic.' })),
      localReason: Type.Optional(Type.String({ description: 'For scope:shared — human-readable reason why a local scope is preferred.' })),
      coordinationWorkspace: Type.Optional(Type.String({ description: 'For scope:shared — explicit Awareness workspace path.' })),
    }, { additionalProperties: false })),
    validate(query) {
      const action = String(query['action'] ?? '');
      if (!['set', 'propose', 'clarify', 'add', 'start', 'complete', 'remove', 'clear', 'show'].includes(action)) {
        throw new Error(`Unknown plan action: ${action}.`);
      }
      if (query['scope'] !== undefined && !['auto', 'session', 'shared'].includes(String(query['scope']))) {
        throw new Error(`Invalid scope: ${String(query['scope'])}. Must be auto, session, or shared.`);
      }
      if (action === 'set' || action === 'propose') {
        if (!Array.isArray(query['steps'])) throw new Error(`action:${action} — steps must be an array.`);
        if (query['steps'].length === 0) throw new Error(`action:${action} — steps must not be empty; use action:clear to remove a plan.`);
      }
      if (action === 'add') {
        const text = typeof query['text'] === 'string' ? query['text'].trim() : '';
        if (!text) throw new Error('action:add requires a non-empty text field.');
      }
      if (query['receipt'] !== undefined) {
        const receipt = query['receipt'];
        if (action !== 'complete' || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
          throw new Error('receipt is only valid as an object for action:complete.');
        }
        const record = receipt as Record<string, unknown>;
        if (typeof record['command'] !== 'string' || !record['command'].trim()) throw new Error('receipt.command is required.');
        if (record['status'] !== 'SUCCESS' && record['status'] !== 'FAILED') throw new Error('receipt.status must be SUCCESS or FAILED.');
        if (typeof record['message'] !== 'string' || !record['message'].trim()) throw new Error('receipt.message is required.');
      }
      if (action === 'start') {
        const hasRevision = typeof query['revision'] === 'string' && query['revision'].trim().length > 0;
        const hasInteraction = typeof query['authorizationInteractionId'] === 'string' && query['authorizationInteractionId'].trim().length > 0;
        if (hasInteraction && !hasRevision) {
          throw new Error('reviewed action:start authorizationInteractionId requires revision.');
        }
        if (hasRevision && query['index'] !== undefined) {
          throw new Error('reviewed action:start cannot include index.');
        }
      }
      if ((action === 'start' || action === 'complete' || action === 'remove') && query['index'] != null) {
        const idx = Number(query['index']);
        if (!Number.isInteger(idx) || idx < 1) {
          throw new Error(`action:${action} — index must be a positive integer when provided (got ${String(query['index'])}).`);
        }
      }
    },
    async execute(query, _queryIndex, _itemId, _sig, _upd, queryCtx) {
      return executePlanQuery(query as PlanParams, queryCtx);
    },
    summarize(result, query) {
      const action = String(query['action'] ?? 'unknown');
      const firstLine = (result.content.find((c) => c.type === 'text') as { text?: string } | undefined)?.text?.split('\n').find(Boolean)?.trim();
      return firstLine ?? (result.isError ? `plan(${action}) failed` : `plan(${action}) ok`);
    },
  });

  return;

  // Suppress unused-import warnings for registerFn and Type when tree-shaken.
  void (registerFn satisfies RegisterFn);
  void (Type satisfies TypeBoxBuilder);
}

// Re-export renderResult and renderCall hooks separately for IDE discoverability
export function renderPlanCall(raw: unknown, theme?: PiTheme) {
  return buildQueryCallBlocks(raw, theme, (singleArgs) => {
    const queries = Array.isArray(singleArgs['queries'])
      ? singleArgs['queries'] as Record<string, unknown>[]
      : [];
    const q = (queries[0] ?? {}) as unknown as PlanParams;
    const extra = q.action === 'set' || q.action === 'propose'
      ? ` (${(q.steps ?? []).length} steps)`
      : q.index ? ` #${q.index}` : '';
    return buildToolView({
      name: 'plan',
      state: 'request',
      segments: [
        { text: q.action, token: 'bright' },
        ...(extra ? [{ text: extra.trim().replace(/^\(|\)$/g, ''), token: 'count' as const }] : []),
      ],
    }, theme);
  });
}

export function renderPlanResult(result: ToolCallResult, opts: RenderResultOptions, theme?: PiTheme) {
  if (opts.isPartial) {
    return buildToolView(() => ({ name: 'plan', state: 'running', status: CLI_STATUS_TEXT.running }), theme);
  }
  const r = result as ToolCallResult & { details?: { steps?: PlanStep[]; action?: string; results?: unknown[] } };
  const resultText = r.content?.find((part) => part.type === 'text')?.text ?? '';
  if (r.isError) {
    return buildToolView({
      name: 'plan',
      state: 'error',
      segments: [{ text: resultText || 'plan operation failed', token: 'error' }],
    }, theme);
  }
  if (Array.isArray(r?.details?.results)) {
    const count = r.details!.results!.length;
    return buildToolView({ name: 'plan', state: 'success', segments: [{ text: `${count} operation${count === 1 ? '' : 's'}`, token: 'count' }] }, theme);
  }
  const steps = r?.details?.steps ?? [];
  if (r?.details?.action === 'clear') {
    return buildToolView({ name: 'plan', state: 'success', segments: [{ text: 'cleared', token: 'dim' }] }, theme);
  }
  if (steps.length === 0) {
    return buildToolView({ name: 'plan', state: 'neutral', segments: [{ text: resultText || 'no active plan', token: 'dim' }] }, theme);
  }
  const done = steps.filter((s) => s.status === 'done').length;
  const current = steps.find((s) => s.status === 'doing') ?? steps.find((s) => s.status === 'todo');
  return buildToolView({
    name: 'plan',
    state: done === steps.length ? 'success' : 'neutral',
    segments: [
      { text: `${done}/${steps.length}`, token: 'count' },
      ...(current ? [{ text: stepLabel(current), token: 'bright' as const }] : []),
    ],
  }, theme);
}
