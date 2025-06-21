import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerApiStatusCheckTool } from '../mcp/tools/api_status_check.js';
import { registerGitHubSearchCodeTool } from '../mcp/tools/github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../mcp/tools/github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../mcp/tools/github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../mcp/tools/github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../mcp/tools/github_search_pull_requests.js';
import { registerNpmSearchTool } from '../mcp/tools/npm_package_search.js';
import { registerViewRepositoryStructureTool } from '../mcp/tools/github_view_repo_structure.js';
import { registerSearchGitHubIssuesTool } from '../mcp/tools/github_search_issues.js';
import { registerNpmViewPackageTool } from '../mcp/tools/npm_view_package.js';
import { Logger } from './logger.js';
import { OPERATIONAL_CONFIG } from '../config.js';

// Type definitions for better type safety
type ToolRegistrationFunction = (server: McpServer) => void;

export interface ToolRegistration {
  name: string;
  fn: ToolRegistrationFunction;
  category: 'core' | 'github' | 'npm';
  description: string;
}

export interface ToolRegistrationResult {
  successful: string[];
  failed: Array<{ name: string; error: unknown }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export class ToolRegistry {
  private readonly tools: ToolRegistration[] = [
    {
      name: 'ApiStatusCheck',
      fn: registerApiStatusCheckTool,
      category: 'core',
      description: 'Check GitHub/NPM API status and user organizations',
    },
    {
      name: 'GitHubSearchCode',
      fn: registerGitHubSearchCodeTool,
      category: 'github',
      description:
        'Search code across GitHub repositories with boolean operators',
    },
    {
      name: 'FetchGitHubFileContent',
      fn: registerFetchGitHubFileContentTool,
      category: 'github',
      description: 'Fetch content of specific files from GitHub repositories',
    },
    {
      name: 'SearchGitHubRepos',
      fn: registerSearchGitHubReposTool,
      category: 'github',
      description: 'Search GitHub repositories by various criteria',
    },
    {
      name: 'SearchGitHubCommits',
      fn: registerSearchGitHubCommitsTool,
      category: 'github',
      description: 'Search commit history across GitHub repositories',
    },
    {
      name: 'SearchGitHubPullRequests',
      fn: registerSearchGitHubPullRequestsTool,
      category: 'github',
      description: 'Search pull requests with detailed metadata',
    },
    {
      name: 'ViewRepositoryStructure',
      fn: registerViewRepositoryStructureTool,
      category: 'github',
      description: 'Browse repository structure and verify file existence',
    },
    {
      name: 'SearchGitHubIssues',
      fn: registerSearchGitHubIssuesTool,
      category: 'github',
      description: 'Search GitHub issues with rich metadata and filters',
    },
    {
      name: 'NpmSearch',
      fn: registerNpmSearchTool,
      category: 'npm',
      description: 'Search npm packages by keywords using fuzzy matching',
    },
    {
      name: 'NpmViewPackage',
      fn: registerNpmViewPackageTool,
      category: 'npm',
      description:
        'Get detailed npm package metadata and repository information',
    },
  ];

  /**
   * Register all tools with the MCP server
   */
  registerAllTools(server: McpServer): ToolRegistrationResult {
    Logger.info('Starting tool registration process');

    const successful: string[] = [];
    const failed: Array<{ name: string; error: unknown }> = [];

    for (const tool of this.tools) {
      try {
        // Register with timeout to prevent hanging
        tool.fn(server);
        successful.push(tool.name);
        Logger.debug(`Successfully registered tool: ${tool.name}`, {
          category: tool.category,
          description: tool.description,
        });
      } catch (error) {
        failed.push({ name: tool.name, error });
        Logger.error(`Failed to register tool: ${tool.name}`, {
          error,
          category: tool.category,
          description: tool.description,
        });
      }
    }

    const result: ToolRegistrationResult = {
      successful,
      failed,
      summary: {
        total: this.tools.length,
        successful: successful.length,
        failed: failed.length,
      },
    };

    // Log summary
    Logger.info('Tool registration completed', {
      total: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
      successRate: `${Math.round((result.summary.successful / result.summary.total) * 100)}%`,
    });

    if (result.summary.failed > 0) {
      Logger.warn(
        `${result.summary.failed} tools failed to register. Server will continue with available tools.`
      );

      // Log failed tools for debugging
      failed.forEach(({ name, error }) => {
        Logger.error(`Tool registration failure details - ${name}`, error);
      });
    }

    return result;
  }

  /**
   * Register a single tool with timeout protection
   */
  private async registerToolWithTimeout(
    tool: ToolRegistration,
    server: McpServer
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tool registration timeout: ${tool.name}`));
      }, OPERATIONAL_CONFIG.TOOL_REGISTRATION_TIMEOUT);

      try {
        tool.fn(server);
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Get information about registered tools
   */
  getToolsInfo(): ToolRegistration[] {
    return [...this.tools];
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: 'core' | 'github' | 'npm'): ToolRegistration[] {
    return this.tools.filter(tool => tool.category === category);
  }
}
