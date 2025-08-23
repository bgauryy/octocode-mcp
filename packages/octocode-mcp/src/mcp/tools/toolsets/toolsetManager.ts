import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServerConfig } from '../../../config/serverConfig.js';
import { registerGitHubSearchCodeTool } from '../github_search_code.js';
import { registerFetchGitHubFileContentTool } from '../github_fetch_content.js';
import { registerSearchGitHubReposTool } from '../github_search_repos.js';
import { registerSearchGitHubCommitsTool } from '../github_search_commits.js';
import { registerSearchGitHubPullRequestsTool } from '../github_search_pull_requests.js';
import { registerPackageSearchTool } from '../package_search/package_search.js';
import { registerViewGitHubRepoStructureTool } from '../github_view_repo_structure.js';
import { TOOL_NAMES } from '../utils/toolConstants.js';

export interface ToolsetConfig {
  name: string;
  description: string;
  enabled: boolean;
  readOnly: boolean;
  tools: string[];
  category: 'core' | 'enterprise' | 'experimental';
}

export interface ToolsetGroup {
  name: string;
  description: string;
  toolsets: Map<string, ToolsetConfig>;
  enabled: boolean;
}

export interface ToolRegistration {
  name: string;
  fn: (server: McpServer) => void;
}

export interface ToolRegistrationConfig {
  serverConfig: ServerConfig;
  userConfig: {
    toolsToRun?: string; // could be undefined
  };
}

export const DEFAULT_TOOLSETS: ToolsetConfig[] = [
  {
    name: 'repos',
    description: 'GitHub Repository related tools',
    enabled: true,
    readOnly: false,
    tools: [
      'githubSearchCode',
      'githubGetFileContent',
      'githubViewRepoStructure',
    ],
    category: 'core',
  },
  {
    name: 'search',
    description: 'GitHub Search and Discovery tools',
    enabled: true,
    readOnly: true,
    tools: [
      'githubSearchRepositories',
      'githubSearchCommits',
      'githubSearchPullRequests',
    ],
    category: 'core',
  },
  {
    name: 'packages',
    description: 'Package registry tools',
    enabled: true,
    readOnly: true,
    tools: ['packageSearch'],
    category: 'core',
  },
  {
    name: 'enterprise',
    description: 'Enterprise security and audit tools',
    enabled: false, // Only enabled when enterprise features are active
    readOnly: false,
    tools: ['audit_logger', 'rate_limiter', 'organization_manager'],
    category: 'enterprise',
  },
];

/**
 * Default tool registrations mapping tool names to their registration functions
 */
export const TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: TOOL_NAMES.GITHUB_SEARCH_CODE,
    fn: registerGitHubSearchCodeTool,
  },
  {
    name: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
    fn: registerSearchGitHubReposTool,
  },
  {
    name: TOOL_NAMES.GITHUB_FETCH_CONTENT,
    fn: registerFetchGitHubFileContentTool,
  },
  {
    name: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    fn: registerViewGitHubRepoStructureTool,
  },
  {
    name: TOOL_NAMES.GITHUB_SEARCH_COMMITS,
    fn: registerSearchGitHubCommitsTool,
  },
  {
    name: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
    fn: registerSearchGitHubPullRequestsTool,
  },
  {
    name: TOOL_NAMES.PACKAGE_SEARCH,
    fn: registerPackageSearchTool,
  },
];

export class ToolsetManager {
  private static toolsets = new Map<string, ToolsetConfig>();
  // private static _groups = new Map<string, ToolsetGroup>(); // TODO: Implement toolset groups
  private static initialized = false;

  /**
   * Initialize toolset management
   */
  static initialize(
    enabledToolsets?: string[],
    readOnly: boolean = false
  ): void {
    if (this.initialized) return;

    this.initialized = true;

    // Register default toolsets
    for (const toolset of DEFAULT_TOOLSETS) {
      this.registerToolset({
        ...toolset,
        readOnly: readOnly || toolset.readOnly,
        enabled: this.shouldEnableToolset(toolset.name, enabledToolsets),
      });
    }

    // Enable enterprise toolset if any enterprise feature is configured
    if (
      process.env.GITHUB_ORGANIZATION ||
      process.env.AUDIT_ALL_ACCESS === 'true' ||
      process.env.RATE_LIMIT_API_HOUR ||
      process.env.RATE_LIMIT_AUTH_HOUR ||
      process.env.RATE_LIMIT_TOKEN_HOUR
    ) {
      const enterpriseToolset = this.toolsets.get('enterprise');
      if (enterpriseToolset) {
        enterpriseToolset.enabled = true;
      }
    }
  }

  /**
   * Register a toolset
   */
  static registerToolset(config: ToolsetConfig): void {
    this.toolsets.set(config.name, config);
  }

  /**
   * Enable specific toolsets
   */
  static enableToolsets(names: string[]): void {
    for (const name of names) {
      if (name === 'all') {
        // Enable all toolsets
        for (const toolset of this.toolsets.values()) {
          toolset.enabled = true;
        }
        return;
      }

      const toolset = this.toolsets.get(name);
      if (toolset) {
        toolset.enabled = true;
      }
    }
  }

  /**
   * Get enabled toolsets
   */
  static getEnabledToolsets(): ToolsetConfig[] {
    return Array.from(this.toolsets.values()).filter(t => t.enabled);
  }

  /**
   * Get enabled tools from all toolsets
   */
  static getEnabledTools(): string[] {
    const tools: string[] = [];
    for (const toolset of this.toolsets.values()) {
      if (toolset.enabled) {
        tools.push(...toolset.tools);
      }
    }
    return tools;
  }

  /**
   * Check if a tool is enabled
   */
  static isToolEnabled(toolName: string): boolean {
    for (const toolset of this.toolsets.values()) {
      if (toolset.enabled && toolset.tools.includes(toolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get toolset for a specific tool
   */
  static getToolsetForTool(toolName: string): ToolsetConfig | null {
    for (const toolset of this.toolsets.values()) {
      if (toolset.tools.includes(toolName)) {
        return toolset;
      }
    }
    return null;
  }

  /**
   * Get statistics
   */
  static getStats(): {
    totalToolsets: number;
    enabledToolsets: number;
    totalTools: number;
    enabledTools: number;
    readOnlyMode: boolean;
  } {
    const enabledToolsets = this.getEnabledToolsets();
    const enabledTools = this.getEnabledTools();
    const hasReadOnlyToolset = enabledToolsets.some(t => t.readOnly);

    return {
      totalToolsets: this.toolsets.size,
      enabledToolsets: enabledToolsets.length,
      totalTools: Array.from(this.toolsets.values()).reduce(
        (sum, t) => sum + t.tools.length,
        0
      ),
      enabledTools: enabledTools.length,
      readOnlyMode: hasReadOnlyToolset,
    };
  }

  // Private methods
  private static shouldEnableToolset(
    name: string,
    enabledList?: string[]
  ): boolean {
    if (!enabledList || enabledList.length === 0) {
      return true; // Enable all by default
    }

    return enabledList.includes('all') || enabledList.includes(name);
  }
}

// ================================================================
// CORE TOOL REGISTRATION FUNCTION
// ================================================================

/**
 * Register tools based on configuration
 */
export function registerTools(
  server: McpServer,
  config: ToolRegistrationConfig
): { successCount: number; failedTools: string[] } {
  // Process inclusiveTools from user configuration
  const inclusiveTools =
    config.userConfig.toolsToRun
      ?.split(',')
      .map(tool => tool.trim())
      .filter(tool => tool.length > 0) || [];

  // Determine if we should run all tools or only specific ones
  const runAllTools = inclusiveTools.length === 0;

  let successCount = 0;
  const failedTools: string[] = [];

  for (const tool of TOOL_REGISTRATIONS) {
    try {
      // Check if tool should be registered based on inclusiveTools configuration
      const shouldRegisterTool =
        runAllTools || inclusiveTools.includes(tool.name);

      if (shouldRegisterTool && ToolsetManager.isToolEnabled(tool.name)) {
        tool.fn(server);
        successCount++;
      } else if (!shouldRegisterTool) {
        // Use stderr for selective tool messages to avoid console linter issues
        process.stderr.write(
          `Tool ${tool.name} excluded by TOOLS_TO_RUN configuration\n`
        );
      } else {
        // Use stderr for toolset configuration messages to avoid console linter issues
        process.stderr.write(
          `Tool ${tool.name} disabled by toolset configuration\n`
        );
      }
    } catch (error) {
      // Log the error but continue with other tools
      failedTools.push(tool.name);
    }
  }

  return { successCount, failedTools };
}

// ================================================================
// CONVENIENCE FUNCTIONS
// ================================================================

/**
 * Initialize toolsets via convenience function
 */
export function initializeToolsets(
  enabledToolsets?: string[],
  readOnly?: boolean
): void {
  ToolsetManager.initialize(enabledToolsets, readOnly);
}

/**
 * Get enabled tools via convenience function
 */
export function getEnabledTools(): string[] {
  return ToolsetManager.getEnabledTools();
}

/**
 * Check tool enablement via convenience function
 */
export function isToolEnabled(toolName: string): boolean {
  return ToolsetManager.isToolEnabled(toolName);
}
