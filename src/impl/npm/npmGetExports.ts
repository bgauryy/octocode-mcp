import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmExportsResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmGetExports(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-exports', { packageName });

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

      // Extract only exports data
      const exportsResult: NpmExportsResult = {
        packageName: npmData.name,
        exports: npmData.exports || {},
      };

      return createSuccessResult(exportsResult);
    } catch (error) {
      return createErrorResult('Failed to get npm exports information', error);
    }
  });
}
