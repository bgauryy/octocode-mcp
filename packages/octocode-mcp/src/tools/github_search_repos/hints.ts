/**
 * Dynamic hints for githubSearchRepositories tool
 * @module tools/github_search_repos/hints
 */

import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubSearchRepositories';

export const hints: ToolHintGenerators = {
  hasResults: (_ctx: HintContext = {}) => [
    // Context-aware hints - static hints cover generic cases
    // Metadata dynamic hints (topicsHasResults, etc.) are loaded separately via extraHints
  ],
  empty: (_ctx: HintContext = {}) => [
    // Static hints cover "Try broader terms", metadata dynamic hints cover topics/keywords
  ],
  error: (_ctx: HintContext = {}) => [],
};
