import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeNpmCommand } from '../../utils/exec';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';

async function analyzeDependencies(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-dep-analysis', { packageName });

  return withCache(cacheKey, async () => {
    try {
      // Use safe npm commands through the exec implementation
      const commands = [
        { command: 'audit', args: [packageName, '--json'] },
        {
          command: 'view',
          args: [
            packageName,
            'dependencies',
            'devDependencies',
            'peerDependencies',
            '--json',
          ],
        },
        { command: 'view', args: [packageName, 'bundlesize', '--json'] },
      ];

      const results = await Promise.allSettled(
        commands.map(async ({ command, args }) => {
          return await executeNpmCommand(command, args, {
            json: true,
            cache: true,
          });
        })
      );

      const analysis = {
        packageName,
        audit: extractResult(results[0], 'audit'),
        dependencies: extractResult(results[1], 'dependencies'),
        bundleInfo: extractResult(results[2], 'bundle'),
        recommendations: generateRecommendations(results, packageName),
        analyzedAt: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to analyze dependencies: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });
}

function extractResult(result: PromiseSettledResult<any>, type: string): any {
  if (result.status === 'fulfilled' && result.value && !result.value.isError) {
    try {
      const content = result.value.content[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        return parsed.result || parsed;
      }
    } catch {
      return {
        error: `Failed to parse ${type} data`,
        raw: result.value,
      };
    }
  }
  return {
    error: `Command failed for ${type}`,
    details:
      result.status === 'rejected' ? result.reason?.message : 'Unknown error',
  };
}

function generateRecommendations(
  results: PromiseSettledResult<any>[],
  packageName: string
): string[] {
  const recommendations: string[] = [];

  // Analyze audit results
  const auditResult = extractResult(results[0], 'audit');
  if (auditResult && !auditResult.error) {
    try {
      if (auditResult.metadata?.vulnerabilities?.total > 0) {
        recommendations.push(
          `🔒 Security: Found ${auditResult.metadata.vulnerabilities.total} vulnerabilities in ${packageName}.`
        );
      }
    } catch {
      // Ignore parsing errors - audit data is optional
    }
  }

  // Analyze dependencies
  const depsResult = extractResult(results[1], 'dependencies');
  if (depsResult && !depsResult.error) {
    try {
      const depCount =
        Object.keys(depsResult.dependencies || {}).length +
        Object.keys(depsResult.devDependencies || {}).length +
        Object.keys(depsResult.peerDependencies || {}).length;
      if (depCount > 20) {
        recommendations.push(
          `📦 Dependencies: Large dependency tree (${depCount} packages). Consider alternatives.`
        );
      }
    } catch {
      // Ignore parsing errors - dependency data is optional
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      '✅ Package appears healthy with no major issues detected.'
    );
  }

  return recommendations;
}

export function registerNpmDependencyAnalysisTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES,
    TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES],
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze dependencies for (e.g., 'react', 'express', '@types/node')"
        ),
    },
    {
      title: 'NPM Dependency Analysis',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      return await analyzeDependencies(args.packageName);
    }
  );
}
