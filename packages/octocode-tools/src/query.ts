/**
 * Wraps a CLI query with required research context fields.
 * The octocode-mcp Zod schemas require id, researchGoal, reasoning
 * (and mainResearchGoal for GitHub tools).
 */

export function withContext<T extends Record<string, unknown>>(
  query: T,
  id = 'cli-query'
): T & { id: string; mainResearchGoal: string; researchGoal: string; reasoning: string } {
  return {
    id,
    mainResearchGoal: 'CLI query',
    researchGoal: 'CLI query',
    reasoning: 'CLI invocation',
    ...query,
  };
}
