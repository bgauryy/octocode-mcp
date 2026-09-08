import { buildPlanPrompt as buildSharedPlanPrompt } from '@octocodeai/agent-contracts/prompts';

/** Pi supplies exact tool syntax; agent-contracts owns the planning and authorization semantics. */
export function buildPlanPrompt(goal: string): string {
  return buildSharedPlanPrompt(goal, {
    proposalInstruction:
      'Show “Creating plan…” while preparing the review, then call plan with queries:[{reasoning:"Propose the reviewed plan.", action:"propose", steps, consequential, reason, rfcPath?}]. Use dependency-ordered, verifiable steps.',
    reviewInstruction:
      'After the plan tool presents its concise overview, use the askUser-backed review once. Do not echo plan steps or file links in your reply — the plan widget shows them.',
  });
}
