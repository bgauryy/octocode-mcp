import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmIdResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmGetId(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-id', { packageName });

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

      // Extract only _id data (name@latestVersion format)
      const idResult: NpmIdResult = {
        packageName: npmData.name,
        id: npmData._id,
      };

      return createSuccessResult(idResult);
    } catch (error) {
      return createErrorResult('Failed to get npm ID information', error);
    }
  });
}
