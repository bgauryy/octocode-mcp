import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { createErrorResult, createSuccessResult } from '../util';
import { NpmViewPackageResult } from '../../types';

// Helper function to get last 10 semantic versions with release dates
function getLastTenVersionsWithDates(
  time: Record<string, string>
): Array<{ version: string; releaseDate: string }> {
  // Extract only version entries (exclude 'created' and 'modified')
  const versionEntries = Object.entries(time).filter(
    ([key]) => key !== 'created' && key !== 'modified'
  );

  // Filter for official semantic versions only (major.minor.patch)
  const semanticVersionRegex = /^\d+\.\d+\.\d+$/;
  const officialVersionEntries = versionEntries.filter(([version]) =>
    semanticVersionRegex.test(version)
  );

  // Sort by release date (most recent first) and take last 10 official releases
  return officialVersionEntries
    .sort(
      ([, dateA], [, dateB]) =>
        new Date(dateB).getTime() - new Date(dateA).getTime()
    )
    .slice(0, 10)
    .map(([version, releaseDate]) => ({ version, releaseDate }));
}

export async function npmViewPackage(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view-package', { packageName });

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
      const npmData = JSON.parse(commandOutput.result);

      // Get version statistics
      const versionEntries = Object.entries(npmData.time || {}).filter(
        ([key]) => key !== 'created' && key !== 'modified'
      );
      const semanticVersionRegex = /^\d+\.\d+\.\d+$/;
      const officialVersionEntries = versionEntries.filter(([version]) =>
        semanticVersionRegex.test(version)
      );

      // Extract registry URL from tarball
      const tarballUrl = npmData.dist?.tarball || '';
      const registryUrl = tarballUrl.match(/^(https?:\/\/[^/]+)/)?.[1] || '';

      // Extract the required fields
      const viewResult: NpmViewPackageResult = {
        name: npmData.name,
        latest: npmData['dist-tags']?.latest || '',
        license: npmData.license || '',
        timeCreated: npmData.time?.created || '',
        timeModified: npmData.time?.modified || '',
        repositoryGitUrl: npmData.repository?.url || '',
        registryUrl,
        description: npmData.description || '',
        size: npmData.dist?.unpackedSize || 0,
        dependencies: npmData.dependencies || {},
        devDependencies: npmData.devDependencies || {},
        exports: npmData.exports || {},
        versions: getLastTenVersionsWithDates(npmData.time || {}),
        versionStats: {
          total: versionEntries.length,
          official: officialVersionEntries.length,
        },
      };

      return createSuccessResult(viewResult);
    } catch (error) {
      return createErrorResult('Failed to get npm package metadata', error);
    }
  });
}
