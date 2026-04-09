import {
  checkCommandAvailability,
  getMissingCommandError,
} from '../../utils/exec/commandAvailability.js';
import { applyWorkflowMode, type RipgrepQuery } from '@octocodeai/octocode-core';
import { createErrorResult } from '../../utils/file/toolHelpers.js';
import { LOCAL_TOOL_ERROR_CODES } from '../../errors/localToolErrors.js';
import { TOOL_NAMES } from '@octocodeai/octocode-core';
import type { SearchContentResult } from '../../utils/core/types.js';
import { ToolErrors } from '../../errors/errorFactories.js';
import {
  executeRipgrepSearchInternal,
  executeGrepSearch,
} from './ripgrepExecutor.js';

/**
 * Main entry point for ripgrep/grep search
 */
export async function searchContentRipgrep(
  query: RipgrepQuery
): Promise<SearchContentResult> {
  const configuredQuery = applyWorkflowMode(query);

  try {
    const rgAvailability = await checkCommandAvailability('rg');

    if (rgAvailability.available) {
      return await executeRipgrepSearchInternal(configuredQuery);
    }

    const grepAvailability = await checkCommandAvailability('grep');
    if (!grepAvailability.available) {
      const toolError = ToolErrors.commandNotAvailable(
        'rg or grep',
        `${getMissingCommandError('rg')} Alternatively, ensure grep is in PATH.`
      );
      return createErrorResult(toolError, configuredQuery, {
        toolName: TOOL_NAMES.LOCAL_RIPGREP,
      }) as SearchContentResult;
    }

    // Check for features that don't work with grep
    if (configuredQuery.multiline) {
      return createErrorResult(
        new Error(
          'multiline patterns require ripgrep (rg). Install ripgrep or remove multiline option.'
        ),
        configuredQuery,
        { toolName: TOOL_NAMES.LOCAL_RIPGREP }
      ) as SearchContentResult;
    }

    return await executeGrepSearch(configuredQuery);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Output size limit exceeded')) {
      return {
        status: 'error',
        error: errorMessage,
        errorCode: LOCAL_TOOL_ERROR_CODES.OUTPUT_TOO_LARGE,
        hints: [
          'Output exceeded 10MB - your pattern matched too broadly. Think about why results exploded:',
          'Is the pattern too generic? Make it specific to target what you actually need',
          'Searching everything? Add type filters or path restrictions to focus scope',
          'For node_modules: Target specific packages rather than searching the entire directory',
          'Need file names only? FIND_FILES searches metadata without reading content',
          'Strategy: Start with filesOnly=true to see what matched, then narrow before reading content',
        ],
      } as SearchContentResult;
    }

    return createErrorResult(error, configuredQuery, {
      toolName: TOOL_NAMES.LOCAL_RIPGREP,
    }) as SearchContentResult;
  }
}
