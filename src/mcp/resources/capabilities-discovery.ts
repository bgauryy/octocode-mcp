import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../contstants';

// interface ToolCapability {
//   name: string;
//   category: string;
//   description: string;
//   parameters: string[];
//   output_type: string;
//   dependencies: string[];
//   best_practices: string[];
// }

interface ResourceCapability {
  name: string;
  category: string;
  type: string;
  description: string;
  when_to_use: string;
  data_structure: string;
}

function getToolCategory(toolName: string): string {
  const categories: Record<string, string> = {
    [TOOL_NAMES.SEARCH_GITHUB_CODE]: 'search',
    [TOOL_NAMES.SEARCH_GITHUB_REPOS]: 'search',
    [TOOL_NAMES.SEARCH_GITHUB_ISSUES]: 'search',
    [TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS]: 'search',
    [TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS]: 'search',
    [TOOL_NAMES.SEARCH_GITHUB_TOPICS]: 'discovery',
    [TOOL_NAMES.SEARCH_GITHUB_USERS]: 'discovery',
    [TOOL_NAMES.VIEW_REPOSITORY]: 'analysis',
    [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]: 'analysis',
    [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]: 'extraction',
    [TOOL_NAMES.NPM_VIEW]: 'package_management',
    [TOOL_NAMES.NPM_SEARCH]: 'package_management',
    [TOOL_NAMES.GET_USER_ORGANIZATIONS]: 'authentication',
  };
  return categories[toolName] || 'utility';
}

function getToolDescription(toolName: string): string {
  const descriptions: Record<string, string> = {
    [TOOL_NAMES.SEARCH_GITHUB_CODE]:
      'Find specific code implementations and patterns',
    [TOOL_NAMES.SEARCH_GITHUB_REPOS]:
      'Discover repositories by technology or topic',
    [TOOL_NAMES.SEARCH_GITHUB_ISSUES]: 'Find problems and their solutions',
    [TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS]:
      'Research implementation approaches',
    [TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS]:
      'Access community knowledge and Q&A',
    [TOOL_NAMES.SEARCH_GITHUB_TOPICS]: 'Map technology ecosystems',
    [TOOL_NAMES.SEARCH_GITHUB_USERS]: 'Find domain experts and contributors',
    [TOOL_NAMES.VIEW_REPOSITORY]: 'Get repository metadata and branch info',
    [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]: 'Explore project architecture',
    [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]: 'Extract complete source code',
    [TOOL_NAMES.NPM_VIEW]: 'Get package metadata and GitHub links',
    [TOOL_NAMES.NPM_SEARCH]: 'Find packages by functionality',
    [TOOL_NAMES.GET_USER_ORGANIZATIONS]: 'Access private repositories',
  };
  return descriptions[toolName] || 'Utility function';
}

async function generateCapabilities() {
  const tools = Object.values(TOOL_NAMES).map(name => ({
    name,
    category: getToolCategory(name),
    description: getToolDescription(name),
    parameters: getToolParameters(name),
    output_type: getToolOutputType(name),
    dependencies: getToolDependencies(name),
    best_practices: getToolBestPractices(name),
  }));

  const resources = [
    {
      name: 'usage-guide',
      category: 'help',
      type: 'markdown',
      description: 'Quick start guide and best practices',
      when_to_use: 'When learning how to use the MCP server',
      data_structure: 'Structured markdown documentation',
    },
    {
      name: 'github-auth-status',
      category: 'status',
      type: 'json',
      description: 'GitHub CLI authentication status',
      when_to_use: 'When getting authentication errors',
      data_structure: 'Status object with authentication info',
    },
    {
      name: 'github-rate-limits',
      category: 'status',
      type: 'json',
      description: 'Real-time GitHub API rate limit status',
      when_to_use: 'Before intensive GitHub operations',
      data_structure: 'Rate limit status for all GitHub APIs',
    },
    {
      name: 'npm-status',
      category: 'status',
      type: 'json',
      description: 'NPM CLI status and configuration',
      when_to_use: 'When having NPM package access issues',
      data_structure: 'NPM configuration and authentication status',
    },
    {
      name: 'search-github-code-instructions',
      category: 'help',
      type: 'markdown',
      description: 'Comprehensive GitHub search syntax guide',
      when_to_use: 'When crafting complex search queries',
      data_structure: 'Detailed syntax documentation with examples',
    },
    {
      name: 'search-context',
      category: 'intelligence',
      type: 'json',
      description: 'AI-powered search pattern recognition',
      when_to_use: 'For optimizing search strategies',
      data_structure: 'Smart patterns and workflow suggestions',
    },
    {
      name: 'tool-orchestration',
      category: 'intelligence',
      type: 'json',
      description: 'Intelligent tool chaining workflows',
      when_to_use: 'For complex multi-step analysis tasks',
      data_structure: 'Workflow definitions and orchestration rules',
    },
    {
      name: 'code-export',
      category: 'productivity',
      type: 'json',
      description: 'Code pattern extraction and sharing',
      when_to_use: 'For creating reusable knowledge assets',
      data_structure: 'Export formats and sharing mechanisms',
    },
  ] as ResourceCapability[];

  return {
    tools,
    resources,
    prompts: [
      {
        name: 'analyze-code',
        parameters: ['repository', 'focus', 'depth'],
        description: 'Generate comprehensive code analysis requests',
        use_cases: [
          'Repository exploration',
          'Code understanding',
          'Architecture analysis',
        ],
      },
      {
        name: 'compare-packages',
        parameters: ['packages', 'criteria'],
        description: 'Compare NPM packages functionality and implementation',
        use_cases: [
          'Technology selection',
          'Package evaluation',
          'Alternative research',
        ],
      },
    ],
  };
}

function getToolParameters(toolName: string): string[] {
  const parameters: Record<string, string[]> = {
    [TOOL_NAMES.SEARCH_GITHUB_CODE]: [
      'query',
      'owner',
      'branch',
      'language',
      'path',
    ],
    [TOOL_NAMES.SEARCH_GITHUB_REPOS]: [
      'query',
      'owner',
      'language',
      'stars',
      'updated',
    ],
    [TOOL_NAMES.VIEW_REPOSITORY]: ['owner', 'repo'],
    [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]: ['owner', 'repo', 'branch', 'path'],
    [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]: [
      'owner',
      'repo',
      'branch',
      'filePath',
    ],
    [TOOL_NAMES.NPM_VIEW]: ['packageName'],
    [TOOL_NAMES.NPM_SEARCH]: ['query', 'searchlimit'],
  };
  return parameters[toolName] || [];
}

function getToolOutputType(toolName: string): string {
  const outputTypes: Record<string, string> = {
    [TOOL_NAMES.SEARCH_GITHUB_CODE]:
      'Code search results with file paths and snippets',
    [TOOL_NAMES.SEARCH_GITHUB_REPOS]: 'Repository list with metadata',
    [TOOL_NAMES.VIEW_REPOSITORY]: 'Repository metadata and README',
    [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]: 'Directory structure tree',
    [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]:
      'Complete file content with metadata',
    [TOOL_NAMES.NPM_VIEW]: 'Package metadata with GitHub repository link',
    [TOOL_NAMES.NPM_SEARCH]: 'Package search results',
  };
  return outputTypes[toolName] || 'Structured data response';
}

function getToolDependencies(toolName: string): string[] {
  const dependencies: Record<string, string[]> = {
    [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]: [TOOL_NAMES.VIEW_REPOSITORY],
    [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]: [TOOL_NAMES.VIEW_REPOSITORY],
    [TOOL_NAMES.SEARCH_GITHUB_CODE]: [TOOL_NAMES.VIEW_REPOSITORY],
  };
  return dependencies[toolName] || [];
}

function getToolBestPractices(toolName: string): string[] {
  const practices: Record<string, string[]> = {
    [TOOL_NAMES.SEARCH_GITHUB_CODE]: [
      'Start with broad terms, then narrow down',
      'Use language filters for better precision',
      'Reference search-github-code-instructions resource',
    ],
    [TOOL_NAMES.VIEW_REPOSITORY]: [
      'Always use this before file operations',
      'Provides essential branch information',
      'Check rate limits if many repositories to analyze',
    ],
    [TOOL_NAMES.SEARCH_GITHUB_REPOS]: [
      'Begin with search_github_topics for better terminology',
      'Use owner filter to scope results',
      'Sort by updated for active projects',
    ],
  };
  return practices[toolName] || ['Follow tool-specific documentation'];
}

export function registerCapabilitiesDiscoveryResource(server: McpServer) {
  server.resource('capabilities', 'help://capabilities', async uri => {
    try {
      const capabilities = await generateCapabilities();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Capabilities Discovery - FEATURE CATALOG',
                description:
                  'Complete catalog of available tools, resources, and capabilities',
                server: {
                  name: 'octocode-mcp',
                  version: '1.0.0',
                  description:
                    'Code question assistant for GitHub and NPM exploration',
                },
                capabilities: {
                  tools: {
                    total: capabilities.tools.length,
                    by_category: capabilities.tools.reduce(
                      (acc, tool) => {
                        acc[tool.category] = (acc[tool.category] || 0) + 1;
                        return acc;
                      },
                      {} as Record<string, number>
                    ),
                    details: capabilities.tools,
                  },
                  resources: {
                    total: capabilities.resources.length,
                    by_category: capabilities.resources.reduce(
                      (acc, resource) => {
                        acc[resource.category] =
                          (acc[resource.category] || 0) + 1;
                        return acc;
                      },
                      {} as Record<string, number>
                    ),
                    details: capabilities.resources,
                  },
                  prompts: {
                    total: capabilities.prompts.length,
                    details: capabilities.prompts,
                  },
                },
                usage_guidelines: {
                  getting_started: [
                    'Check github-auth-status for authentication',
                    'Review usage-guide for best practices',
                    'Use search-context for intelligent workflows',
                  ],
                  workflow_optimization: [
                    'Start with topics for discovery',
                    'Always use view_repository before file operations',
                    'Check rate limits before intensive operations',
                  ],
                  troubleshooting: [
                    'Check github-rate-limits if getting rate limit errors',
                    'Use tool-orchestration for complex task guidance',
                    'Reference search-github-code-instructions for search help',
                  ],
                },
                limits: {
                  rate_limiting: 'GitHub API limits apply',
                  file_size: '384KB max per file',
                  timeout: '10 seconds per command',
                  caching: 'Intelligent caching enabled',
                },
                meta: {
                  last_updated: new Date().toISOString(),
                  api_version: '1.0.0',
                  supported_languages: [
                    'JavaScript',
                    'TypeScript',
                    'Python',
                    'Java',
                    'Go',
                    'Rust',
                    'C++',
                  ],
                  github_features: [
                    'Search',
                    'Repository access',
                    'File content',
                    'Issues',
                    'PRs',
                    'Discussions',
                  ],
                  npm_features: [
                    'Package search',
                    'Package metadata',
                    'Repository linking',
                  ],
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Capabilities Discovery - ERROR',
                error: (error as Error).message,
                message: 'Unable to generate capabilities catalog',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });
}
