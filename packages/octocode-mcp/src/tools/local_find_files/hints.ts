/**
 * Dynamic hints for localFindFiles tool
 * @module tools/local_find_files/hints
 *
 * API dynamic keys available: manyResults, configFiles, sourceFiles, recentChanges
 */

import { getMetadataDynamicHints } from '../../hints/static.js';
import type { HintContext, ToolHintGenerators } from '../../types/metadata.js';

export const TOOL_NAME = 'localFindFiles';

export const hints: ToolHintGenerators = {
  hasResults: (ctx: HintContext = {}) => {
    const hints: (string | undefined)[] = [];
    if (ctx.fileCount && ctx.fileCount > 20) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'manyResults'));
    }
    if ((ctx as Record<string, unknown>).hasConfigFiles) {
      hints.push(...getMetadataDynamicHints(TOOL_NAME, 'configFiles'));
    }
    return hints;
  },

  empty: (_ctx: HintContext = {}) => [],

  error: (_ctx: HintContext = {}) => [],
};
