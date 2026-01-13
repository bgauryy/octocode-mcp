/**
 * Dynamic hints for localViewStructure tool
 * @module tools/local_view_structure/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'localViewStructure';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.entryCount && ctx.entryCount > 10) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'parallelize'));
    }
    return hints;
  },

  empty: (_ctx: HintContext = {}) => [
    // Base hints come from HOST
  ],

  error: (ctx: HintContext = {}) => {
    if (ctx.errorType === 'size_limit' && ctx.entryCount) {
      return [
        `Directory has ${ctx.entryCount} entries${ctx.tokenEstimate ? ` (~${ctx.tokenEstimate.toLocaleString()} tokens)` : ''}.`,
        ...getMetadataDynamicHints(TOOL_NAME, 'largeDirectory'),
      ];
    }
    return [];
  },
};
