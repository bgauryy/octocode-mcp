import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeNpmCommand } from '../../utils/exec';
import { NpmSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmSearch(
  args: NpmSearchParams
): Promise<CallToolResult> {
  const { query, json = true, searchlimit = 50 } = args;

  try {
    const args = [`"${query}"`, `--searchlimit=${searchlimit}`];
    if (json) args.push('--json');

    const result = await executeNpmCommand('search', args, {
      cache: true,
    });

    if (result.isError) {
      return result;
    }

    if (json) {
      try {
        const commandOutput = JSON.parse(result.content[0].text as string);
        const searchResults = commandOutput.result;

        const enhancedResults = {
          searchQuery: query,
          resultCount: Array.isArray(searchResults) ? searchResults.length : 0,
          searchLimitApplied: searchlimit,
          results: searchResults,
          searchTips:
            !searchResults ||
            (Array.isArray(searchResults) && searchResults.length === 0)
              ? "Try broader terms like 'react', 'cli', or 'typescript'"
              : Array.isArray(searchResults) &&
                  searchResults.length >= searchlimit
                ? 'Results limited. Use more specific terms to narrow down.'
                : 'Good result set size for analysis.',
          timestamp: new Date().toISOString(),
        };
        return createSuccessResult(enhancedResults);
      } catch (parseError) {
        // Fallback to raw output if JSON parsing fails
        return result;
      }
    }

    return result;
  } catch (error) {
    return createErrorResult('Failed to execute npm search', error);
  }
}
