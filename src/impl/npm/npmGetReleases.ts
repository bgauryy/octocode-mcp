import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmData } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';
import { TOOL_NAMES } from '../../mcp/systemPrompts';

// Efficient type for minimal data return with official releases only
interface EfficientNpmTimeResult {
  packageName: string;
  lastModified: string;
  created: string;
  officialVersionCount: number;
  totalVersionCount: number;
  last10OfficialReleases: Array<{ version: string; releaseDate: string }>;
  nextSteps: string[];
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

      // Filter for official semantic versions only (major.minor.patch)
      // Excludes pre-release versions like alpha, beta, rc, dev, experimental, etc.
      const semanticVersionRegex = /^\d+\.\d+\.\d+$/;
      const officialVersionEntries = versionEntries.filter(([version]) =>
        semanticVersionRegex.test(version)
      );

      // Sort by release date (most recent first) and take last 10 official releases
      const sortedOfficialVersions = officialVersionEntries
        .sort(
          ([, dateA], [, dateB]) =>
            new Date(dateB).getTime() - new Date(dateA).getTime()
        )
        .slice(0, 10)
        .map(([version, releaseDate]) => ({ version, releaseDate }));

      // Create efficient result with only official releases
      const timeResult: EfficientNpmTimeResult = {
        packageName: npmData.name,
        lastModified: npmData.time.modified,
        created: npmData.time.created,
        officialVersionCount: officialVersionEntries.length,
        totalVersionCount: versionEntries.length,
        last10OfficialReleases: sortedOfficialVersions,
        nextSteps: [
          `${TOOL_NAMES.NPM_GET_EXPORTS} "${npmData.name}"`,
          `${TOOL_NAMES.GITHUB_SEARCH_REPOS} "${npmData.name}" stars:>10`,
          `${TOOL_NAMES.GITHUB_SEARCH_COMMITS} "${npmData.name}" sort:committer-date`,
        ],
      };

      return createSuccessResult(timeResult);
    } catch (error) {
      return createErrorResult('Failed to get npm release information', error);
    }
  });
}
