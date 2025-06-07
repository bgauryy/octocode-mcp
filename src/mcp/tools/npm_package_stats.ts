import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { npmPackageStats } from '../../impl/npm';

export const NPM_PACKAGE_STATS_DESCRIPTION = `Advanced npm package analysis providing release history, version information, and distribution tags.

**WHEN TO USE:**
- Analyze package release patterns and maintenance activity
- Check version history and stability
- Understand package distribution strategy (alpha, beta, latest tags)
- Evaluate package maturity for production use

**ANALYSIS PROVIDED:**
- Release timeline and frequency
- Version history and semantic versioning patterns  
- Distribution tags (latest, beta, alpha, etc.)
- Package maintenance indicators

**EXAMPLE INSIGHTS:**
- Frequent releases may indicate active development
- Long gaps between releases may suggest abandonment
- Multiple dist-tags suggest mature release process
- Version patterns show breaking change frequency

**INTEGRATION:**
- Combine with npm_view for complete package assessment
- Use before adding dependencies to evaluate stability
- Cross-reference with repository information for full context`;

export function registerNpmPackageStatsTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.NPM_PACKAGE_STATS,
    NPM_PACKAGE_STATS_DESCRIPTION,
    {
      packageName: z
        .string()
        .describe(
          "The name of the npm package to analyze (e.g., 'react', '@types/node', 'lodash')"
        ),
    },
    {
      title: 'NPM Package Statistics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: { packageName: string }) => {
      try {
        return await npmPackageStats(args.packageName);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get npm package statistics: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
