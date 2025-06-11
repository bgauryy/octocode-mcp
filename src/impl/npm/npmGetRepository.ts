import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmRepositoryInfoResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmGetRepository(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-repository', { packageName });

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

      // Extract only repository-related data
      const repositoryResult: NpmRepositoryInfoResult = {
        packageName: npmData.name,
        description: npmData.description,
        repository: npmData.repository,
        homepage: npmData.homepage,
      };

      return createSuccessResult(repositoryResult);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm repository information',
        error
      );
    }
  });
}
