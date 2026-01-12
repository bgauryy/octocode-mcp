/**
 * Dynamic hints for localFindFiles tool
 * @module tools/local_find_files/hints
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'localFindFiles';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    // Add batchParallel hints for multiple results
    if (ctx.fileCount && ctx.fileCount > 3) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'batchParallel'));
    }
    // Add manyResults hints for large result sets
    if (ctx.fileCount && ctx.fileCount > 20) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'manyResults'));
    }
    // Add configFiles hints when config files are found
    if ((ctx as Record<string, unknown>).hasConfigFiles) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'configFiles'));
    }
    return hints;
  },

  empty: (_ctx: HintContext = {}) => [
    // Base hints come from HOST
  ],

  error: (_ctx: HintContext = {}) => [],
};
