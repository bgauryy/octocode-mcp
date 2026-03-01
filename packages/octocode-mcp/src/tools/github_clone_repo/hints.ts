/**
 * Dynamic hints for githubCloneRepo tool
 * @module tools/github_clone_repo/hints
 *
 * Note: Primary hints (clone type, cache, sparse) are handled inline in
 * execution.ts via extraHints. This module provides supplementary
 * context-aware hints through the standard ToolHintGenerators interface.
 */

import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'githubCloneRepo';

export const hints: ToolHintGenerators = {
  hasResults: (_ctx: HintContext = {}) => [
    // Primary hints are injected in execution.ts (FULL_CLONE_HINTS / SPARSE_CLONE_HINTS)
  ],

  empty: (_ctx: HintContext = {}) => [
    // Clone always returns hasResults or error, empty is unlikely
  ],

  error: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.errorType === 'permission') {
      hints.push(
        'Check that your token has repository read access for this repo.'
      );
    }
    if (ctx.errorType === 'not_found') {
      hints.push(
        'Verify the owner/repo name and branch. The repository may be private or deleted.'
      );
    }
    if (ctx.errorType === 'timeout') {
      hints.push(
        'Clone timed out. Try using sparse_path to clone only a subdirectory.'
      );
    }
    return hints;
  },
};
