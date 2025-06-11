import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData, NpmVersionsResult } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function npmGetVersions(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-versions', { packageName });

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

      // Filter versions to include only official semantic versions (major.minor.patch)
      // Excludes pre-release versions like alpha, beta, rc, dev, experimental, etc.
      const semanticVersionRegex = /^\d+\.\d+\.\d+$/;
      const officialVersions = npmData.versions.filter(version =>
        semanticVersionRegex.test(version)
      );

      // Extract only versions data with filtered official versions
      const versionsResult: NpmVersionsResult = {
        packageName: npmData.name,
        versions: officialVersions,
        latestVersion: npmData['dist-tags'].latest,
        versionCount: officialVersions.length,
      };

      return createSuccessResult(versionsResult);
    } catch (error) {
      return createErrorResult('Failed to get npm versions information', error);
    }
  });
}
