import { assembleContextSegments, INITIAL_CONTEXT_TOKEN_BUDGET } from './context-segments.js';

const SEGMENTS = [
  { id: 'octocode-product-policy', kind: 'product-policy', origin: 'octocode-harness', authority: 'product', visibility: 'hidden-policy', rehydrate: 'always', tokenBudget: 20_000 },
  { id: 'mcp-tool-contracts', kind: 'tool-contract', origin: 'octocode-harness', authority: 'product', visibility: 'inspectable', rehydrate: 'always', tokenBudget: 30_000 },
  { id: 'runtime-tool-contracts', kind: 'tool-contract', origin: 'octocode-harness', authority: 'product', visibility: 'inspectable', rehydrate: 'always', tokenBudget: 10_000 },
  { id: 'dynamic-tool-contracts', kind: 'tool-contract', origin: 'octocode-harness', authority: 'product', visibility: 'inspectable', rehydrate: 'always', tokenBudget: 20_000 },
  { id: 'available-skills', kind: 'skill', origin: 'installed-skills', authority: 'project', visibility: 'inspectable', rehydrate: 'on-trigger', tokenBudget: 20_000 },
  { id: 'session-artifact-contract', kind: 'tool-contract', origin: 'octocode-harness', authority: 'product', visibility: 'inspectable', rehydrate: 'always', tokenBudget: 1_000 },
  { id: 'awareness-cli-runtime', kind: 'tool-contract', origin: 'octocode-harness', authority: 'product', visibility: 'inspectable', rehydrate: 'always', tokenBudget: 2_000 },
] as const;

export type SessionPromptContents = Record<(typeof SEGMENTS)[number]['id'], string>;

/** One policy/budget contract for initial prompts and recovery source validation. */
export function assembleSessionPromptContext(contents: SessionPromptContents) {
  return {
    ...assembleContextSegments(SEGMENTS.map(segment => ({ ...segment, scope: 'session', content: contents[segment.id] })), { totalTokenBudget: INITIAL_CONTEXT_TOKEN_BUDGET }),
    contents,
  };
}
