export const LOCAL_BASE_HINTS = {
  hasResults: [
    "Follow 'mainResearchGoal', 'researchGoal', 'reasoning', 'hints' to navigate research",
    'Do findings answer your question? If partial, identify gaps and continue',
    'Got 3+ examples? Consider stopping to avoid over-research',
    'Check last modified dates - skip stale content',
  ],
  empty: [
    'Try broader terms or related concepts',
    'Remove filters one at a time to find what blocks results',
    'Separate concerns into multiple simpler queries',
    '<AGENT_INSTRUCTION>If stuck in loop - STOP and ask user</AGENT_INSTRUCTION>',
  ],
} as const;
