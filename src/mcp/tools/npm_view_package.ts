import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createErrorResult, createSuccessResult } from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmViewPackageParams, NpmViewPackageResult } from '../../types';

const TOOL_NAME = 'npm_view_package';

const DESCRIPTION = `Get comprehensive package metadata for research. Returns repo URL, exports, dependencies, and version history. Essential for GitHub discovery workflow.`;

export function registerNpmViewPackageTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        packageName: z
          .string()
          .min(1, 'Package name is required')
          .describe(
            'NPM package name. Returns complete metadata including GitHub repo URL, exports structure, and dependency analysis.'
          ),
      },
      annotations: {
        title: 'NPM Package Metadata Analysis',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: NpmViewPackageParams): Promise<CallToolResult> => {
      return npmViewPackage(args.packageName);
    }
  );
}

// Helper function to process versions from the 'time' field in npm view output
function processVersions(time: Record<string, string> | undefined) {
  if (!time) {
    return {
      recent: null,
      stats: null,
    };
  }

  const semanticVersionRegex = /^\d+\.\d+\.\d+$/; // Matches stable versions like 1.2.3

  // Filter out 'created' and 'modified', keep only version entries,
  // then filter for actual semantic versions, and sort descending by date.
  const versions = Object.entries(time)
    .filter(([key]) => key !== 'created' && key !== 'modified')
    .filter(([version]) => semanticVersionRegex.test(version)) // Consider only official releases for "recent"
    .sort(
      ([, aDate], [, bDate]) =>
        new Date(bDate).getTime() - new Date(aDate).getTime()
    );

  const totalVersionsInTime = Object.keys(time).filter(
    key => key !== 'created' && key !== 'modified'
  ).length;

  return {
    recent: versions
      .slice(0, 10) // Get top 10 most recent official releases
      .map(([version, releaseDate]) => ({ version, releaseDate })),
    stats: {
      total: totalVersionsInTime, // Total versions listed (including pre-releases etc. in 'time')
      official: versions.length, // Count of official semantic versions found in 'time'
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

      if (result.isError || !result.content?.[0]?.text) {
        return result.isError
          ? result
          : createErrorResult(
              `Failed to fetch package data for "${packageName}". Output was empty or invalid.`
            );
      }

      let npmData: any;
      try {
        // Parse the response - it's wrapped in an object with a 'result' field
        const responseData = JSON.parse(result.content[0].text as string);
        npmData = JSON.parse(responseData.result);
      } catch (parseError) {
        return createErrorResult(
          `Invalid JSON response from npm view for package "${packageName}".`
        );
      }

      // Process versions using the 'time' field from npmData
      const versionData = processVersions(npmData.time);

      // Extract registry URL from tarball (if available)
      const registryUrl =
        npmData.dist?.tarball?.match(/^(https?:\/\/[^/]+)/)?.[1] || null;

      // Build result according to the updated NpmViewPackageResult interface
      const viewResult: NpmViewPackageResult = {
        name: npmData.name || packageName, // Fallback to packageName if name is missing
        latest: npmData['dist-tags']?.latest || null,
        license: npmData.license || null,
        timeCreated: npmData.time?.created || null,
        timeModified: npmData.time?.modified || null,
        repository: npmData.repository || null,
        registryUrl: registryUrl,
        description: npmData.description || null,
        size: npmData.dist?.unpackedSize || null,
        dependencies: npmData.dependencies || null,
        devDependencies: npmData.devDependencies || null,
        peerDependencies: npmData.peerDependencies || null, // New
        exports: npmData.exports || null,
        versions:
          versionData.recent && versionData.recent.length > 0
            ? versionData.recent
            : null,
        versionStats: versionData.stats,
        homepage: npmData.homepage || null, // New
        keywords: npmData.keywords || null, // New
        maintainers: npmData.maintainers || null, // New
        bugs: npmData.bugs || null, // New
        main: npmData.main || null, // New
        engines: npmData.engines || null, // New
      };

      return createSuccessResult(viewResult);
    } catch (error) {
      // General error catch for issues within the withCache block or unexpected errors
      return createErrorResult(
        `Package metadata retrieval failed for "${packageName}".`
      );
    }
  });
}
