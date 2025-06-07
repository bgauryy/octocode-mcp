import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../utils/cache';
import { executeNpmCommand, CommandBuilder } from '../utils/exec';
import { NpmRepositoryResult, NpmSearchParams } from '../types';

export async function npmView(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = CommandBuilder.npmView(packageName);
      const result = await executeNpmCommand(command, args, {
        json: true,
        cache: true,
      });

      if (result.isError) {
        return result;
      }

      // Parse the result from the executed command
      const commandOutput = JSON.parse(result.content[0].text as string);
      const npmData: NpmRepositoryResult = commandOutput.result;

      let popularityData = '';
      try {
        // Get version count as popularity indicator
        const versionsResult = await executeNpmCommand('view', [
          packageName,
          'time',
          '--json',
        ]);
        if (!versionsResult.isError) {
          const versionsOutput = JSON.parse(
            versionsResult.content[0].text as string
          );
          const timeData = versionsOutput.result;
          const versionCount = Object.keys(timeData).length - 2; // Subtract 'created' and 'modified'
          popularityData = `Package versions released: ${versionCount}`;
        }
      } catch {
        // Popularity data is optional
      }

      const enhancedResult = {
        ...npmData,
        popularityInfo: popularityData,
        lastAnalyzed: new Date().toISOString(),
      };

      return createSuccessResult(enhancedResult);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm repository information',
        error
      );
    }
  });
}

export async function npmSearch(
  args: NpmSearchParams
): Promise<CallToolResult> {
  const { query, json = true, searchlimit = 50 } = args;

  try {
    const { command, args: cmdArgs } = CommandBuilder.npmSearch(query, {
      limit: searchlimit,
      json,
    });

    const result = await executeNpmCommand(command, cmdArgs, {
      json,
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

export async function npmPackageStats(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-stats', { packageName });

  return withCache(cacheKey, async () => {
    try {
      // Execute multiple commands in parallel using executeNpmCommand
      const commands = [
        executeNpmCommand('view', [packageName, 'time', '--json']),
        executeNpmCommand('view', [packageName, 'versions', '--json']),
        executeNpmCommand('view', [packageName, 'dist-tags', '--json']),
      ];

      const results = await Promise.allSettled(commands);

      const stats = {
        packageName,
        releaseHistory:
          results[0].status === 'fulfilled' && !results[0].value.isError
            ? JSON.parse(results[0].value.content[0].text as string).result
            : null,
        versions:
          results[1].status === 'fulfilled' && !results[1].value.isError
            ? JSON.parse(results[1].value.content[0].text as string).result
            : null,
        distTags:
          results[2].status === 'fulfilled' && !results[2].value.isError
            ? JSON.parse(results[2].value.content[0].text as string).result
            : null,
        analyzedAt: new Date().toISOString(),
      };

      return createSuccessResult(stats);
    } catch (error) {
      return createErrorResult('Failed to get npm package statistics', error);
    }
  });
}

function createSuccessResult(data: any): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}

function createErrorResult(message: string, error: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${message}: ${(error as Error).message}`,
      },
    ],
    isError: true,
  };
}
