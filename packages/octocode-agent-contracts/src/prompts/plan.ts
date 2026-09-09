/** Host-neutral no-mutation contract used when an Octocode plan starts. */

export const PLAN_USAGE_GUIDANCE = 'Use a plan only for complex work: coupled dependencies, coordinated owners, consequential risk, or substantial work spanning sessions. Skip routine fixes, straightforward steps, and simple delegation; honor an explicit planning request.';

export const PLAN_PROMPT_MAX_GOAL = 2000;
export const PLAN_PROMPT_TRUNCATION_MARKER =
  `[Goal truncated at ${PLAN_PROMPT_MAX_GOAL} characters; ask the user to restate omitted constraints before proposing.]`;

export interface PlanPromptHostAdapter {
  /** Exact host syntax for proposing a plan. Stable plan semantics remain in this package. */
  proposalInstruction?: string;
  /** Optional host-specific review-surface instruction after proposal. */
  reviewInstruction?: string;
}

/** Build a bounded planning request; the host adapter owns only field-level call syntax. */
export function buildPlanPrompt(goal: string, adapter: PlanPromptHostAdapter = {}): string {
  const normalized = goal.replace(/\r\n?/g, '\n').trim();
  const formatted = normalized.includes('\n') ? normalized : normalized.replace(/\s+/g, ' ');
  const truncated = formatted.length > PLAN_PROMPT_MAX_GOAL;
  const clean = formatted.slice(0, PLAN_PROMPT_MAX_GOAL);
  const renderedGoal = clean.includes('\n') ? `Goal:\n${clean}` : `Goal: ${clean}`;
  const target = clean
    ? `${renderedGoal}${truncated ? `\n${PLAN_PROMPT_TRUNCATION_MARKER}` : ''}`
    : 'Goal: (ask the user for the goal before planning)';
  const proposalInstruction = adapter.proposalInstruction
    ?? 'Use the host plan proposal capability with dependency-ordered, independently verifiable steps and a final real-world check.';
  const reviewInstruction = adapter.reviewInstruction
    ?? 'Present the concise proposal and its reviewable artifact through the host review surface.';

  return [
    '[PLAN MODE] Build a reviewable plan collaboratively. The host review owns one Start implementation decision; consume its result without asking again.',
    target,
    '',
    '1. Establish only the evidence that changes scope, dependencies, risk, or acceptance. Use the live Octocode tool catalog for repository, code, history, package, graph, and semantic research; load a matching Octocode skill for specialized research, evaluation, or RFC work. Do not substitute shell search or direct CLI invocations. Keep simple requests brief; for shared or cross-cutting work, trace callers and contracts.',
    '2. Use the RFC workflow and create or update a reviewable RFC when architecture, migration, or public-contract choices need user review. Otherwise keep a lightweight plan; put its brief rationale in the proposal fields, without a separate explanation or approval round.',
    '3. Ask bounded clarification only when a decision-changing material choice cannot be answered from repository evidence. Do not turn reversible implementation details into questions. Cancellation, timeout, or unavailable interaction never authorizes a default.',
    `4. ${proposalInstruction} A consequential proposal links its exact RFC revision; a lightweight proposal omits the RFC path and retains the reason it is lightweight. ${reviewInstruction}`,
    '5. The review has one decision: Start implementation or Request changes. Start binds the exact displayed revision and begins the first runnable step in one action; there is no separate Accept action. Feedback means revise and re-propose; rejection means stop; unavailable interaction leaves the proposal pending.',
    '',
    'Planning does not disable tools; use only research and artifact-authoring effects before Start. Return the plan result, main risk, and excluded scope. Do not implement product code before Start.',
  ].join('\n');
}
