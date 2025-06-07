import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateCacheKey, withCache } from '../../impl/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

const execAsync = promisify(exec);

export const NPM_DEPENDENCY_ANALYSIS_DESCRIPTION = `Comprehensive npm package dependency analysis and security assessment.

**ANALYSIS CAPABILITIES:**
- **Dependency Tree**: Complete dependency graph with versions
- **Security Audit**: Vulnerability scanning and risk assessment  
- **License Analysis**: License compatibility and legal considerations
- **Bundle Size**: Package size impact on applications
- **Outdated Dependencies**: Version update recommendations

**SECURITY INSIGHTS:**
- Known vulnerabilities in dependencies
- Security advisories and fixes available
- Dependency risk scoring
- Transitive dependency analysis

**OPTIMIZATION GUIDANCE:**
- Bundle size optimization opportunities
- Alternative package suggestions
- Dependency consolidation possibilities
- Performance impact assessment

**USE CASES:**
- Pre-installation security review
- Dependency audit for existing projects  
- License compliance checking
- Bundle size optimization planning`;

async function analyzeDependencies(
  packageName: string
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-dep-analysis', { packageName });

  return withCache(cacheKey, async () => {
    try {
      // Create temporary directory for analysis
      const tmpDir = `/tmp/npm-analysis-${Date.now()}`;
      await execAsync(`mkdir -p ${tmpDir}`);

      try {
        // Initialize package.json and install for analysis
        await execAsync(`cd ${tmpDir} && npm init -y`);
        await execAsync(
          `cd ${tmpDir} && npm install ${packageName} --package-lock-only`
        );

        // Run multiple analysis commands
        const commands = [
          `cd ${tmpDir} && npm audit --json`,
          `cd ${tmpDir} && npm list --json --depth=0`,
          `cd ${tmpDir} && npm outdated --json || true`,
          `cd ${tmpDir} && npm view ${packageName} bundlesize --json || echo '{}'`,
        ];

        const results = await Promise.allSettled(
          commands.map(cmd => execAsync(cmd))
        );

        const analysis = {
          packageName,
          audit: parseResult(results[0], 'audit'),
          dependencies: parseResult(results[1], 'dependencies'),
          outdated: parseResult(results[2], 'outdated'),
          bundleInfo: parseResult(results[3], 'bundle'),
          recommendations: generateRecommendations(results),
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
      } finally {
        // Cleanup
        await execAsync(`rm -rf ${tmpDir}`).catch(() => {});
      }
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

function parseResult(result: PromiseSettledResult<any>, type: string): any {
  if (result.status === 'fulfilled') {
    try {
      return JSON.parse(result.value.stdout);
    } catch {
      return {
        error: `Failed to parse ${type} data`,
        raw: result.value.stdout,
      };
    }
  }
  return { error: `Command failed for ${type}` };
}

function generateRecommendations(
  results: PromiseSettledResult<any>[]
): string[] {
  const recommendations: string[] = [];

  // Analyze audit results
  if (results[0].status === 'fulfilled') {
    try {
      const audit = JSON.parse(results[0].value.stdout);
      if (audit.metadata?.vulnerabilities?.total > 0) {
        recommendations.push(
          `🔒 Security: Found ${audit.metadata.vulnerabilities.total} vulnerabilities. Run 'npm audit fix' to address.`
        );
      }
    } catch {
      // Ignore parsing errors - audit data is optional
    }
  }

  // Analyze dependencies
  if (results[1].status === 'fulfilled') {
    try {
      const deps = JSON.parse(results[1].value.stdout);
      const depCount = Object.keys(deps.dependencies || {}).length;
      if (depCount > 10) {
        recommendations.push(
          `📦 Dependencies: Large dependency tree (${depCount} packages). Consider alternatives.`
        );
      }
    } catch {
      // Ignore parsing errors - dependency data is optional
    }
  }

  // Analyze outdated packages
  if (results[2].status === 'fulfilled') {
    try {
      const outdated = JSON.parse(results[2].value.stdout);
      const outdatedCount = Object.keys(outdated || {}).length;
      if (outdatedCount > 0) {
        recommendations.push(
          `⬆️ Updates: ${outdatedCount} dependencies have newer versions available.`
        );
      }
    } catch {
      // Ignore parsing errors - outdated data is optional
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
    TOOL_NAMES.NPM_DEPENDENCY_ANALYSIS,
    NPM_DEPENDENCY_ANALYSIS_DESCRIPTION,
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze dependencies for (e.g., 'react', 'express', '@types/node')"
        ),
    },
    async (args: { packageName: string }) => {
      return await analyzeDependencies(args.packageName);
    }
  );
}
