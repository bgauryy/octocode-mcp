import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeNpmCommand } from '../../utils/exec';
import { NpmSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmSearch(
  args: NpmSearchParams
): Promise<CallToolResult> {
  const { query, json = true, searchlimit = 50 } = args;

  try {
    // Build CLI arguments for the `npm search` command. Renamed to avoid
    // shadowing the function parameter `args`.
    const cmdArgs = [query, `--searchlimit=${searchlimit}`];
    if (json) cmdArgs.push('--json');

    const result = await executeNpmCommand('search', cmdArgs, {
      cache: true,
    });

    if (result.isError) {
      return result;
    }

    if (json) {
      try {
        // Ensure we actually received text content to parse
        if (
          !result.content ||
          result.content.length === 0 ||
          typeof result.content[0].text !== 'string'
        ) {
          return createErrorResult(
            'npm search returned no parseable content',
            new Error('Try npm_search_packages with different query terms')
          );
        }

        // Parse the wrapper object and then the actual npm output
        const wrapper = JSON.parse(result.content[0].text as string);
        const commandOutput: any =
          typeof wrapper.result === 'string'
            ? JSON.parse(wrapper.result)
            : wrapper.result;

        // npm search --json output formats differ between npm versions.
        // Handle the most common shapes:
        // 1. Direct array of packages
        // 2. { objects: [ { package: {...} } ] }
        // 3. { results: [...] }
        let searchResults: any[] = [];

        if (Array.isArray(commandOutput)) {
          searchResults = commandOutput;
        } else if (commandOutput && typeof commandOutput === 'object') {
          if (Array.isArray(commandOutput.objects)) {
            // Older npm output nests the actual package info under `package`
            searchResults = commandOutput.objects.map(
              (o: any) => o.package || o
            );
          } else if (Array.isArray(commandOutput.results)) {
            searchResults = commandOutput.results;
          }
        }

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
        return createErrorResult(
          'npm search JSON parse failed',
          new Error('Raw npm output may still be accessible')
        );
      }
    }

    return result;
  } catch (error) {
    return createErrorResult('npm search execution failed', error);
  }
}
