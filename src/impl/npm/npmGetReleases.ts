import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

// Efficient type for minimal data return
interface EfficientNpmTimeResult {
  packageName: string;
  lastModified: string;
  created: string;
  versionCount: number;
  last10Releases: Array<{ version: string; releaseDate: string }>;
}

export async function npmGetReleases(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-get-releases', { packageName });

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

      // Extract only version entries (exclude 'created' and 'modified')
      const versionEntries = Object.entries(npmData.time).filter(
        ([key]) => key !== 'created' && key !== 'modified'
      );

      // Sort by release date (most recent first) and take last 10
      const sortedVersions = versionEntries
        .sort(
          ([, dateA], [, dateB]) =>
            new Date(dateB).getTime() - new Date(dateA).getTime()
        )
        .slice(0, 10)
        .map(([version, releaseDate]) => ({ version, releaseDate }));

      // Create efficient result with only requested data
      const timeResult: EfficientNpmTimeResult = {
        packageName: npmData.name,
        lastModified: npmData.time.modified,
        created: npmData.time.created,
        versionCount: versionEntries.length,
        last10Releases: sortedVersions,
      };

      return createSuccessResult(timeResult);
    } catch (error) {
      return createErrorResult('Failed to get npm time information', error);
    }
  });
}
