/**
 * Dynamic hints for packageSearch tool
 * @module tools/package_search/hints
 */

import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'packageSearch';

export const hints: ToolHintGenerators = {
  hasResults: (_ctx: HintContext = {}) => [
    // Package-specific hints are generated in the tool itself (deprecation, install, explore)
  ],
  empty: (_ctx: HintContext = {}) => [
    // Package-specific empty hints are generated in the tool itself
  ],
  error: (_ctx: HintContext = {}) => [],
};
