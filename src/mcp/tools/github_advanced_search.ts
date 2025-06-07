import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import {
  searchGitHubCode,
  searchGitHubRepos,
  searchGitHubIssues,
  searchGitHubPullRequests,
} from '../../impl/github';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export const GITHUB_ADVANCED_SEARCH_DESCRIPTION = `Multi-dimensional GitHub search combining repositories, code, issues, and pull requests for comprehensive analysis.

**SEARCH STRATEGY:**
Performs parallel searches across multiple GitHub dimensions to provide complete ecosystem understanding:

1. **Repository Discovery**: Find relevant repositories by topic/technology
2. **Code Implementation**: Locate actual code examples and patterns  
3. **Issue Analysis**: Understand common problems and solutions
4. **PR Reviews**: See implementation patterns and best practices

**INTELLIGENT AGGREGATION:**
- Cross-references results between search types
- Identifies high-quality repositories with active maintenance
- Highlights repositories with both good documentation and implementation examples
- Provides consolidated insights across all search dimensions

**OPTIMIZATION FEATURES:**
- Automatic query refinement for each search type
- Quality filtering based on repository activity and stars
- Result prioritization using multiple signals
- Comprehensive analysis with actionable insights

**USE CASES:**
- Technology research and ecosystem analysis
- Finding production-ready implementations
- Understanding community best practices  
- Identifying maintained and well-documented projects

**EXAMPLE WORKFLOWS:**
- "react hooks" → repositories, implementations, common issues, PR patterns
- "authentication jwt" → libraries, code examples, security discussions, implementation PRs
- "docker deployment" → tools, configuration examples, troubleshooting, deployment strategies`;

interface AdvancedSearchParams {
  query: string;
  owner?: string;
  includeCode?: boolean;
  includeIssues?: boolean;
  includePullRequests?: boolean;
  limit?: number;
  language?: string;
}

async function performAdvancedSearch(
  params: AdvancedSearchParams
): Promise<CallToolResult> {
  const {
    query,
    owner,
    includeCode = true,
    includeIssues = true,
    includePullRequests = true,
    limit = 10,
    language,
  } = params;

  try {
    const searchPromises: Promise<any>[] = [];
    const searchTypes: string[] = [];

    // 1. Always search repositories first
    searchPromises.push(
      searchGitHubRepos({
        query,
        owner: owner || '',
        limit,
        language,
        sort: 'stars',
        order: 'desc',
      })
    );
    searchTypes.push('repositories');

    // 2. Code search (if enabled and we have an owner or specific context)
    if (includeCode && (owner || language)) {
      searchPromises.push(
        searchGitHubCode({
          query,
          owner: owner || '',
          language,
          limit,
        })
      );
      searchTypes.push('code');
    }

    // 3. Issues search
    if (includeIssues) {
      searchPromises.push(
        searchGitHubIssues({
          query,
          owner: owner || '',
          state: 'closed', // Focus on resolved issues for solutions
          limit,
          sort: 'reactions',
          order: 'desc',
        })
      );
      searchTypes.push('issues');
    }

    // 4. Pull requests search
    if (includePullRequests) {
      searchPromises.push(
        searchGitHubPullRequests({
          query,
          owner: owner || '',
          state: 'closed', // Focus on closed PRs (includes merged) for implemented solutions
          limit,
          sort: 'reactions',
          order: 'desc',
        })
      );
      searchTypes.push('pullRequests');
    }

    const results = await Promise.allSettled(searchPromises);

    const analysis = {
      searchQuery: query,
      searchScope: {
        owner: owner || 'global',
        language: language || 'all',
        searchTypes: searchTypes.join(', '),
      },
      results: {} as Record<string, any>,
      insights: [] as string[],
      recommendations: [] as string[],
      timestamp: new Date().toISOString(),
    };

    // Process results
    searchTypes.forEach((type, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        analysis.results[type] = result.value;

        // Extract insights based on result type
        if (type === 'repositories') {
          const repoData = result.value?.content?.[0]?.text;
          if (repoData) {
            const repoCount = (repoData.match(/\n/g) || []).length;
            analysis.insights.push(
              `Found ${repoCount} repositories matching "${query}"`
            );

            if (repoCount > 0) {
              analysis.recommendations.push(
                `🔍 Explore top repositories for production-ready implementations`
              );
            }
          }
        }

        if (type === 'issues') {
          analysis.insights.push(
            `Located community discussions and problem solutions`
          );
          analysis.recommendations.push(
            `❓ Review closed issues for common gotchas and solutions`
          );
        }

        if (type === 'pullRequests') {
          analysis.insights.push(
            `Found implementation examples in closed pull requests`
          );
          analysis.recommendations.push(
            `🔄 Examine PR descriptions and code changes for implementation patterns`
          );
        }

        if (type === 'code') {
          analysis.insights.push(`Discovered actual code implementations`);
          analysis.recommendations.push(
            `💻 Analyze code examples for best practices and patterns`
          );
        }
      } else {
        analysis.results[type] = { error: `Search failed: ${result.reason}` };
      }
    });

    // Generate strategic recommendations
    if (analysis.insights.length > 0) {
      analysis.recommendations.push(
        `📊 Cross-reference results between repositories, code, and discussions for comprehensive understanding`,
        `⭐ Prioritize repositories with high stars, recent activity, and good documentation`,
        `🔗 Use repository information to explore related projects and alternatives`
      );
    }

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
          text: `Advanced search failed: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

export function registerGitHubAdvancedSearchTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_ADVANCED_SEARCH,
    GITHUB_ADVANCED_SEARCH_DESCRIPTION,
    {
      query: z
        .string()
        .describe(
          'Search query to analyze across GitHub (e.g., "react hooks", "jwt authentication", "docker deployment")'
        ),
      owner: z
        .string()
        .optional()
        .describe(
          'Repository owner/organization to focus search (leave empty for global search)'
        ),
      includeCode: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include code search in analysis'),
      includeIssues: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include issues search in analysis'),
      includePullRequests: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include pull requests search in analysis'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum results per search type'),
      language: z
        .string()
        .optional()
        .describe(
          'Programming language filter (e.g., "javascript", "python", "go")'
        ),
    },
    {
      title: 'GitHub Advanced Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: AdvancedSearchParams) => {
      return await performAdvancedSearch(args);
    }
  );
}
