import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmViewResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmView(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const result = await executeNpmCommand('view', [packageName, '--json'], {
        cache: true,
      });

      if (result.isError) {
        return result;
      }

      // Parse the result from the executed command
      const commandOutput = JSON.parse(result.content[0].text as string);
      // The result is a JSON string from npm that needs to be parsed again
      const npmData: NpmData = JSON.parse(commandOutput.result);

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
          // Parse the JSON string to get the actual time data
          const timeData = JSON.parse(versionsOutput.result);
          const versionCount = Object.keys(timeData).length - 2; // Subtract 'created' and 'modified'
          popularityData = `Package versions released: ${versionCount}`;
        }
      } catch {
        // Popularity data is optional
      }

      // Create the properly typed result with npmData as proper object
      const enhancedResult: NpmViewResult = {
        npmData: npmData,
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
