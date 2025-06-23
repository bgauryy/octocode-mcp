import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createResult,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';
import { NpmViewPackageParams, NpmViewPackageResult } from '../../types';

const TOOL_NAME = 'npm_view_package';

const DESCRIPTION = `Get comprehensive NPM package metadata efficiently. Returns repository URL, exports, dependencies, and version history. Essential for finding package source code and understanding project structure.`;

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
            'NPM package name to analyze. Returns complete package context including exports (critical for GitHub file discovery), repository URL, dependencies, and version history.'
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
      try {
        if (!args.packageName || args.packageName.trim() === '') {
          return createResult({
            error: 'Package name required - provide valid NPM package name'
          });
        }

        // Basic package name validation
        if (!/^[a-z0-9@._/-]+$/.test(args.packageName)) {
          return createResult({
            error: 'Invalid package name format - use standard NPM naming'
          });
        }

        const result = await npmViewPackage(args.packageName);
        return result;
      } catch (error) {
        return createResult({
          error: 'Failed to get package metadata - package may not exist'
        });
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

      return createResult({ data: viewResult });
    } catch (error) {
      return createResult({
        error: 'Failed to get package metadata - package may not exist'
      });
    }
  });
}
