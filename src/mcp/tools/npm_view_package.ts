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

const DESCRIPTION = `View NPM package information using 'npm view' command. Supports field-specific queries and GitHub repository discovery.

**WHEN TO USE**: Use when users ask questions about npm packages - provides comprehensive package data and insights.

**KEY INSIGHTS**:
- Git repository URL for source code exploration
- Package exports structure (understand API surface and dependencies)
- Dependencies/devDependencies for ecosystem analysis
- Version history, size, performance metrics
- License and author information

**CAPABILITIES**:
- Full package info: npm view <package> --json (optimized format)
- Single field: npm view <package> <field> (version, description, license)
- Multiple fields: filtered JSON response for specific fields
- Repository URLs for GitHub integration and source code analysis`;

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
        field: z
          .string()
          .optional()
          .describe(
            'Optional field to get specific information (e.g., "version", "description", "license"). If not provided, returns full package info.'
          ),
        match: z
          .union([
            z.enum([
              'version',
              'description',
              'license',
              'author',
              'homepage',
              'repository',
              'dependencies',
              'devDependencies',
              'keywords',
              'main',
              'scripts',
              'engines',
              'files',
              'publishConfig',
              'dist-tags',
              'time',
            ]),
            z.array(
              z.enum([
                'version',
                'description',
                'license',
                'author',
                'homepage',
                'repository',
                'dependencies',
                'devDependencies',
                'keywords',
                'main',
                'scripts',
                'engines',
                'files',
                'publishConfig',
                'dist-tags',
                'time',
              ])
            ),
          ])
          .optional()
          .describe(
            'Specific field(s) to retrieve. Can be single field or array of fields. Examples: "version", ["version", "description"], ["dependencies", "devDependencies"]. When used, returns only the specified fields. use repository to get the repository url in github'
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
    async (args: {
      packageName: string;
      field?: string;
      match?: string | string[];
    }): Promise<CallToolResult> => {
      try {
        const result = await viewNpmPackage(
          args.packageName,
          args.field,
          args.match
        );

        if (result.isError) {
          return result;
        }

        // If field is specified, npm returns plain text, not JSON
        if (args.field) {
          const plainTextResult = result.content[0].text as string;
          // Parse the plain text result from npm command
          const execResult = JSON.parse(plainTextResult);
          const fieldValue = execResult.result;

          return createResult({
            data: {
              field: args.field,
              value: fieldValue,
              package: args.packageName,
            },
          });
        }

        // If match is specified, filter the JSON response to only include matched fields
        if (args.match) {
          const execResult = JSON.parse(result.content[0].text as string);
          const packageData = execResult.result;
          const matchFields = Array.isArray(args.match)
            ? args.match
            : [args.match];

          const filteredData: any = {};
          matchFields.forEach(field => {
            if (packageData[field] !== undefined) {
              filteredData[field] = packageData[field];
            }
          });

          return createResult({
            data: {
              package: args.packageName,
              fields: matchFields,
              values: filteredData,
            },
          });
        }

        // Otherwise return full optimized format (JSON response)
        const execResult = JSON.parse(result.content[0].text as string);
        const packageData = execResult.result;
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
          const fieldInfo = args.field ? ` (field: ${args.field})` : '';
          const matchInfo = args.match
            ? ` (match: ${Array.isArray(args.match) ? args.match.join(', ') : args.match})`
            : '';
          const paramInfo = fieldInfo || matchInfo;
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

          // Add field/match-specific suggestions
          if (args.field) {
            suggestions.push(
              `• Try without field parameter to get full package info`
            );
            suggestions.push(
              `• Common fields: version, description, license, dependencies`
            );
          }

          if (args.match) {
            suggestions.push(
              `• Try without match parameter to get full package info`
            );
            suggestions.push(
              `• Try single field instead of multiple: field: "version"`
            );
            suggestions.push(
              `• Common fields: version, description, license, dependencies`
            );
          }

          // Add discovery alternatives
          suggestions.push('• Use npm_package_search for discovery');
          suggestions.push(
            '• Use github_search_repos to find source repository'
          );
          suggestions.push('• Check exact spelling on npmjs.com');

          return createResult({
            error: `Package "${packageName}"${paramInfo} not found on NPM registry.

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
  packageName: string,
  field?: string,
  match?: string | string[]
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName, field, match });

  return withCache(cacheKey, async () => {
    try {
      // Build arguments based on parameters
      // Priority: field > match > full JSON
      const args = field ? [packageName, field] : [packageName, '--json']; // For match or full info, we need JSON

      const result = await executeNpmCommand('view', args, {
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
