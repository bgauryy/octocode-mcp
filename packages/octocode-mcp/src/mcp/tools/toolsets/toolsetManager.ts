/**
 * Toolset Management System
 *
 * Implements GitHub MCP-compatible toolset architecture for better organization
 * and enterprise control over tool availability.
 */

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

export class ToolsetManager {
  private static toolsets = new Map<string, ToolsetConfig>();
  // private static _groups = new Map<string, ToolsetGroup>(); // TODO: Implement toolset groups
  private static initialized = false;

  /**
   * Default toolsets matching GitHub's organization
   */
  static readonly DEFAULT_TOOLSETS: ToolsetConfig[] = [
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
   * Initialize toolset management
   */
  static initialize(
    enabledToolsets?: string[],
    readOnly: boolean = false
  ): void {
    if (this.initialized) return;

    this.initialized = true;

    // Register default toolsets
    for (const toolset of this.DEFAULT_TOOLSETS) {
      this.registerToolset({
        ...toolset,
        readOnly: readOnly || toolset.readOnly,
        enabled: this.shouldEnableToolset(toolset.name, enabledToolsets),
      });
    }

    // Enable enterprise toolset if configured
    if (process.env.GITHUB_ORGANIZATION) {
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

// Export convenience functions
export function initializeToolsets(
  enabledToolsets?: string[],
  readOnly?: boolean
): void {
  ToolsetManager.initialize(enabledToolsets, readOnly);
}

export function getEnabledTools(): string[] {
  return ToolsetManager.getEnabledTools();
}

export function isToolEnabled(toolName: string): boolean {
  return ToolsetManager.isToolEnabled(toolName);
}
