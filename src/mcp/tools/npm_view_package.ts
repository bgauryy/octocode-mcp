import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createErrorResult,
  createResult,
  createSuccessResult,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmViewPackageParams, NpmViewPackageResult } from '../../types';

const TOOL_NAME = 'npm_view_package';

const DESCRIPTION = `use npm view to get package metadata. You can get the package
name from search results or user input. This tool is effieicnt since it gets important package metadata
on a package fast to optimize tools calls. get package git repository path easily without need to search it (using repo/code search tools),
exported files of a package are there, along with dependencies and version history.`;

export function registerNpmViewPackageTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    {
      packageName: z
        .string()
        .min(1, 'Package name is required')
        .describe(
          'NPM package name to analyze. Returns complete package context including exports (critical for GitHub file discovery), repository URL, dependencies, and version history.'
        ),
    },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: NpmViewPackageParams) => {
      try {
        if (!args.packageName || args.packageName.trim() === '') {
          return createResult(
            'Package name is required - provide a valid NPM package name',
            true
          );
        }

        // Basic package name validation
        if (!/^[a-z0-9@._/-]+$/.test(args.packageName)) {
          return createResult(
            'Invalid package name format - use standard NPM naming (e.g., "package-name" or "@scope/package")',
            true
          );
        }

        const result = await npmViewPackage(args.packageName);
        return result;
      } catch (error) {
        return createResult(
          'Failed to get package metadata - verify package exists on NPM registry',
          true
        );
      }
    }
  );
}

// Helper function to process versions
function processVersions(time: Record<string, string>) {
  const semanticVersionRegex = /^\d+\.\d+\.\d+$/;

  const versions = Object.entries(time || {})
    .filter(([key]) => key !== 'created' && key !== 'modified')
    .filter(([version]) => semanticVersionRegex.test(version))
    .sort(([, a], [, b]) => new Date(b).getTime() - new Date(a).getTime());

  return {
    recent: versions
      .slice(0, 10)
      .map(([version, releaseDate]) => ({ version, releaseDate })),
    stats: {
      total: Object.keys(time || {}).length - 2, // exclude 'created' and 'modified'
      official: versions.length,
    },
  };
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

      // Process versions
      const versionData = processVersions(npmData.time);

      // Extract registry URL from tarball
      const registryUrl =
        npmData.dist?.tarball?.match(/^(https?:\/\/[^/]+)/)?.[1] || '';

      // Build result
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
        versions: versionData.recent,
        versionStats: versionData.stats,
      };

      return createSuccessResult(viewResult);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm package metadata - package may not exist or registry unavailable',
        error
      );
    }
  });
}
