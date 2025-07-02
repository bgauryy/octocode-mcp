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

const DESCRIPTION = `Analyze NPM packages for repository discovery and dependency insights. BRIDGE to GitHub ecosystem.

PACKAGE ANALYSIS CAPABILITIES:
- Repository URL discovery for GitHub exploration
- Version history and release patterns
- Export analysis for implementation understanding
- Dependency metadata for ecosystem mapping

GITHUB INTEGRATION:
- Provides repository links for GitHub repository tools
- Connects package metadata to source code analysis
- Enables package-to-implementation research workflows
- Essential for dependency and alternative evaluation

USE CASES:
- Repository discovery from package names
- Version analysis and security assessment
- Export structure for integration planning
- Dependency research and ecosystem exploration`;

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

        // Package not found with smart discovery
        if (
          errorMessage.includes('not found') ||
          errorMessage.includes('404')
        ) {
          const packageName = args.packageName;
          const suggestions = [];

          // Check for common naming patterns
          if (packageName.includes('_')) {
            suggestions.push(
              `• Try with dashes: "${packageName.replace(/_/g, '-')}"`
            );
          }
          if (packageName.includes('-')) {
            suggestions.push(
              `• Try without dashes: "${packageName.replace(/-/g, '')}"`
            );
          }
          if (!packageName.startsWith('@') && packageName.includes('/')) {
            suggestions.push(`• Try scoped package: "@${packageName}"`);
          }
          if (packageName.startsWith('@')) {
            suggestions.push(
              `• Try without scope: "${packageName.split('/')[1]}"`
            );
          }

          // Add discovery alternatives
          suggestions.push('• Use npm_package_search for discovery');
          suggestions.push(
            '• Use github_search_repos to find source repository'
          );
          suggestions.push('• Check exact spelling on npmjs.com');

          return createResult({
            error: `Package "${packageName}" not found on NPM registry.

Try these alternatives:
${suggestions.join('\n')}

Discovery workflow:
1. Use npm_package_search with functional terms
2. Use github_search_repos for related projects
3. Verify exact package name on npmjs.com`,
          });
        }

        // Network issues with fallback strategies
        if (
          errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('ENOTFOUND')
        ) {
          return createResult({
            error: `NPM registry connection failed. Alternative strategies:
• Check internet connection and npm registry status
• Use github_search_repos to find package repository
• Try npm_package_search for broader discovery
• Visit https://npmjs.com/${args.packageName} directly
• Retry in a few moments`,
          });
        }

        // NPM CLI issues
        if (
          errorMessage.includes('command not found') ||
          errorMessage.includes('npm')
        ) {
          return createResult({
            error: `NPM CLI issue. Quick fixes:
• Verify NPM installation: npm --version
• Update NPM: npm install -g npm@latest  
• Use github_search_repos to find package repository
• Check PATH environment variable
• Try web interface: https://npmjs.com/${args.packageName}`,
          });
        }

        // Permission/registry issues
        if (
          errorMessage.includes('permission') ||
          errorMessage.includes('403') ||
          errorMessage.includes('401')
        ) {
          return createResult({
            error: `NPM registry access issue. Try these solutions:
• Check npm configuration: npm config get registry
• Use public registry: npm config set registry https://registry.npmjs.org/
• Try github_search_repos for package source code
• Visit package page: https://npmjs.com/${args.packageName}`,
          });
        }

        // Generic error with comprehensive fallbacks
        return createResult({
          error: `Failed to fetch package "${args.packageName}": ${errorMessage}

Fallback strategies:
• Use npm_package_search for similar packages
• Use github_search_repos with package name as query
• Check package on web: https://npmjs.com/${args.packageName}
• Verify npm status: https://status.npmjs.org
• Try alternative package managers (yarn info, pnpm view)`,
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
