import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { OptimizedNpmPackageResult } from '../../types';
import {
  createResult,
  toDDMMYYYY,
  humanizeBytes,
  simplifyRepoUrl,
} from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeNpmCommand } from '../../utils/exec';

export const NPM_VIEW_PACKAGE_TOOL_NAME = 'npmViewPackage';

const DESCRIPTION = `Get detailed NPM package information including version, description, repository URL, size, and download statistics. Essential for understanding package details before installation. Returns optimized metadata for package evaluation and code navigation.`;

export function registerNpmViewPackageTool(server: McpServer) {
  server.registerTool(
    NPM_VIEW_PACKAGE_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        packageName: z
          .string()
          .min(1)
          .describe(
            'NPM package name (e.g., "react", "express", "@types/node"). Include @ prefix for scoped packages.'
          ),
      },
      annotations: {
        title: 'NPM Package Analyzer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: { packageName: string }): Promise<CallToolResult> => {
      try {
        const result = await viewNpmPackage(args.packageName);

        if (result.isError) {
          return result;
        }

        const execResult = JSON.parse(result.content[0].text as string);
        const packageData = execResult.result;

        // Transform to optimized format
        const optimizedResult = transformToOptimizedFormat(packageData);

        return createResult({ data: optimizedResult });
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        if (errorMessage.includes('not found')) {
          return createResult({
            error:
              'Package not found. Check spelling and use exact package name from npm',
          });
        }

        if (errorMessage.includes('network')) {
          return createResult({
            error: 'Network error. Check internet connection and try again',
          });
        }

        return createResult({
          error:
            'Failed to fetch package information. Try again or check npm status',
        });
      }
    }
  );
}

/**
 * Transform NPM CLI response to optimized format for code analysis
 */
function transformToOptimizedFormat(
  packageData: any
): OptimizedNpmPackageResult {
  // Extract repository URL and simplify
  const repoUrl =
    packageData.repository?.url || packageData.repositoryGitUrl || '';
  const repository = repoUrl ? simplifyRepoUrl(repoUrl) : '';

  // Simplify exports to essential entry points only
  const exports = packageData.exports
    ? simplifyExports(packageData.exports)
    : undefined;

  // Get version timestamps from time object and limit to last 5
  const timeData = packageData.time || {};
  const versionList = Array.isArray(packageData.versions)
    ? packageData.versions
    : [];
  const recentVersions = versionList.slice(-5).map((version: string) => ({
    version,
    date: timeData[version] ? toDDMMYYYY(timeData[version]) : 'Unknown',
  }));

  const result: OptimizedNpmPackageResult = {
    name: packageData.name,
    version: packageData.version,
    description: packageData.description || '',
    license: packageData.license || 'Unknown',
    repository,
    size: humanizeBytes(packageData.dist?.unpackedSize || 0),
    created: timeData.created ? toDDMMYYYY(timeData.created) : 'Unknown',
    updated: timeData.modified ? toDDMMYYYY(timeData.modified) : 'Unknown',
    versions: recentVersions,
    stats: {
      total_versions: versionList.length,
      weekly_downloads: packageData.weeklyDownloads,
    },
  };

  // Add exports only if they exist and are useful
  if (exports && Object.keys(exports).length > 0) {
    result.exports = exports;
  }

  return result;
}

/**
 * Simplify exports to show only essential entry points for code navigation
 */
function simplifyExports(exports: any): {
  main: string;
  types?: string;
  [key: string]: any;
} {
  if (typeof exports === 'string') {
    return { main: exports };
  }

  if (typeof exports === 'object') {
    const simplified: any = {};

    // Extract main entry point
    if (exports['.']) {
      const mainExport = exports['.'];
      if (typeof mainExport === 'string') {
        simplified.main = mainExport;
      } else if (mainExport.default) {
        simplified.main = mainExport.default;
      } else if (mainExport.import) {
        simplified.main = mainExport.import;
      }
    }

    // Extract types if available with safe property access
    if (
      exports['./types'] ||
      (exports['.'] && typeof exports['.'] === 'object' && exports['.'].types)
    ) {
      simplified.types = exports['./types'] || (exports['.'] as any).types;
    }

    // Add a few other important exports (max 3 total)
    let count = 0;
    for (const [key, value] of Object.entries(exports)) {
      if (count >= 3 || key === '.' || key === './types') continue;
      if (key.includes('package.json') || key.includes('node_modules'))
        continue;

      simplified[key] =
        typeof value === 'object' ? (value as any).default || value : value;
      count++;
    }

    return simplified;
  }

  return { main: 'index.js' };
}

export async function viewNpmPackage(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const result = await executeNpmCommand('view', [packageName, '--json'], {
        cache: false,
      });
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';

      if (errorMessage.includes('404')) {
        return createResult({
          error:
            'Package not found on NPM registry. Verify the exact package name',
        });
      }

      return createResult({
        error: 'Failed to execute NPM command. Check npm installation',
      });
    }
  });
}
