import {
  PLAN_PROMPT_MAX_GOAL,
  PLAN_PROMPT_TRUNCATION_MARKER,
} from '@octocodeai/agent-contracts/prompts';

export function buildPlanPrompt(goal: string): string {
  const normalized = goal.replace(/\r\n?/g, '\n').trim();
  const formatted = normalized.includes('\n') ? normalized : normalized.replace(/\s+/g, ' ');
  const bounded = formatted.slice(0, PLAN_PROMPT_MAX_GOAL);
  const goalBlock = [
    bounded ? `Goal:${bounded.includes('\n') ? '\n' : ' '}${bounded}` : 'Goal: ask the user for the goal',
    formatted.length > PLAN_PROMPT_MAX_GOAL ? PLAN_PROMPT_TRUNCATION_MARKER : '',
  ].filter(Boolean).join('\n');
  return `[PLAN MODE] Build a reviewable plan collaboratively, then ask once whether to Start implementation.
${goalBlock}

1. Check the request and repository first — research proportionally to establish only what changes scope, dependencies, risk, or acceptance criteria. Keep it brief for simple requests; trace callers and contracts for cross-cutting work.
2. For consequential, architectural, or public-contract work, load the octocode-rfc-generator skill and produce a reviewable RFC under .octocode/rfc/. For lightweight changes, state briefly why an RFC is not needed.
3. Use the askUser widget only when a decision-changing question remains and the repository cannot answer it; otherwise continue without an interview. Always include a free-text (discussion) option alongside any choices so the user can add context or override.
4. Show the user "Creating plan…" while preparing the review. Create or update a reviewable RFC under .octocode/rfc/, then call plan with queries:[{reasoning:"Propose the reviewed plan.", action:"propose", rfcPath, steps}] using dependency-ordered, verifiable steps. After the plan tool presents its overview, send a message listing the RFC document links so the user can open the full details before deciding.
5. The plan tool owns one decision: Start implementation or Request changes, and presents the concise overview. The decision widget always includes a free-text discussion option for feedback. Choosing Start approves the exact RFC revision and begins implementation in one action. If interaction is unavailable, leave the plan pending; never infer approval from prose. There is no separate Accept step.

Planning does not disable tools. Use the tools needed to research and author the RFC, but do not implement the proposed source changes before the user chooses Start.`;
}
