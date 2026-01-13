/**
 * Dynamic hints for githubSearchPullRequests tool
 * @module tools/github_search_pull_requests/hints
 */

import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubSearchPullRequests';

// Note: Static hints already cover all common cases including "Multiple PRs? Look for patterns"
// Dynamic hints only for truly context-specific scenarios not covered by static
export const hints: ToolHintGenerators = {
  hasResults: (_ctx: HintContext = {}) => [],
  empty: (_ctx: HintContext = {}) => [],
  error: (_ctx: HintContext = {}) => [],
};
