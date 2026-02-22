import {
  checkCommandAvailability,
  getMissingCommandError,
} from '../../utils/exec/index.js';
import { applyWorkflowMode, type RipgrepQuery } from './scheme.js';
import { createErrorResult } from '../../utils/file/toolHelpers.js';
import { LOCAL_TOOL_ERROR_CODES } from '../../errorCodes.js';
import { TOOL_NAMES } from '../toolMetadata/index.js';
import type { SearchContentResult } from '../../utils/core/types.js';
import { ToolErrors } from '../../errorCodes.js';
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
    // Check if ripgrep is available
    const rgAvailability = await checkCommandAvailability('rg');

    if (rgAvailability.available) {
      // Use ripgrep (preferred - faster, more features)
      return await executeRipgrepSearchInternal(configuredQuery);
    }

    // rg not available - try grep fallback
    const grepAvailability = await checkCommandAvailability('grep');
    if (!grepAvailability.available) {
      // Neither rg nor grep available
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

    // Use grep fallback
    return await executeGrepSearch(configuredQuery);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Output size limit exceeded')) {
      return {
        status: 'error',
        errorCode: LOCAL_TOOL_ERROR_CODES.OUTPUT_TOO_LARGE,
        path: configuredQuery.path,
        researchGoal: configuredQuery.researchGoal,
        reasoning: configuredQuery.reasoning,
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

// Re-export functions from executor module
export {
  executeRipgrepSearchInternal,
  executeGrepSearch,
} from './ripgrepExecutor.js';

// Re-export functions from parser module
export {
  parseFilesOnlyOutput,
  parseRipgrepOutput,
  parseGrepOutputWrapper,
} from './ripgrepParser.js';

// Re-export functions from result builder module
export {
  buildSearchResult,
  getFileModifiedTime,
} from './ripgrepResultBuilder.js';
