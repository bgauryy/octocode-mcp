import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES, RESOURCE_NAMES } from '../contstants';

export function registerCapabilitiesDiscoveryResource(server: McpServer) {
  server.resource('capabilities-discovery', 'help://tools', async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            tool_categories: {
              search: {
                tools: [
                  TOOL_NAMES.SEARCH_GITHUB_CODE,
                  TOOL_NAMES.SEARCH_GITHUB_REPOS,
                  TOOL_NAMES.SEARCH_GITHUB_ISSUES,
                  TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS,
                  TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS,
                  TOOL_NAMES.SEARCH_GITHUB_COMMITS,
                  TOOL_NAMES.GITHUB_ADVANCED_SEARCH,
                ],
                purpose:
                  'Find repositories, code, issues, discussions, and commit history',
              },
              discovery: {
                tools: [
                  TOOL_NAMES.SEARCH_GITHUB_TOPICS,
                  TOOL_NAMES.SEARCH_GITHUB_USERS,
                ],
                purpose: 'Map technology ecosystems and find experts',
              },
              analysis: {
                tools: [
                  TOOL_NAMES.VIEW_REPOSITORY,
                  TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE,
                ],
                purpose: 'Understand repository structure and metadata',
              },
              extraction: {
                tools: [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT],
                purpose: 'Extract complete source code implementations',
              },
              npm: {
                tools: [
                  TOOL_NAMES.NPM_VIEW,
                  TOOL_NAMES.NPM_SEARCH,
                  TOOL_NAMES.NPM_PACKAGE_STATS,
                  TOOL_NAMES.NPM_DEPENDENCY_ANALYSIS,
                ],
                purpose: 'Find, analyze, and assess NPM packages',
              },
              auth: {
                tools: [TOOL_NAMES.GET_USER_ORGANIZATIONS],
                purpose: 'Access private repositories and organization context',
              },
            },
            tool_descriptions: {
              [TOOL_NAMES.SEARCH_GITHUB_CODE]:
                'Find specific code implementations',
              [TOOL_NAMES.SEARCH_GITHUB_REPOS]: 'Discover quality repositories',
              [TOOL_NAMES.SEARCH_GITHUB_ISSUES]: 'Find problems and solutions',
              [TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS]:
                'Find code review patterns and implementations',
              [TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS]:
                'Access community Q&A and best practices',
              [TOOL_NAMES.SEARCH_GITHUB_COMMITS]:
                'Search commit history for development patterns',
              [TOOL_NAMES.SEARCH_GITHUB_TOPICS]: 'Map technology ecosystems',
              [TOOL_NAMES.SEARCH_GITHUB_USERS]:
                'Discover developers and organizations',
              [TOOL_NAMES.VIEW_REPOSITORY]:
                'Get metadata and branch info (required first!)',
              [TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE]:
                'Explore repository directory structure',
              [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]:
                'Extract complete source code',
              [TOOL_NAMES.NPM_VIEW]: 'Get package metadata and GitHub links',
              [TOOL_NAMES.NPM_SEARCH]: 'Find packages by functionality',
              [TOOL_NAMES.NPM_PACKAGE_STATS]:
                'Analyze package release history and maintenance',
              [TOOL_NAMES.NPM_DEPENDENCY_ANALYSIS]:
                'Comprehensive dependency and security analysis',
              [TOOL_NAMES.GET_USER_ORGANIZATIONS]:
                'Get GitHub organizations for private repo access',
              [TOOL_NAMES.GITHUB_ADVANCED_SEARCH]:
                'Multi-dimensional GitHub search across all dimensions',
            },
            resources: {
              help_and_quickstart: {
                resources: [
                  RESOURCE_NAMES.USAGE_GUIDE,
                  RESOURCE_NAMES.CAPABILITIES_DISCOVERY,
                ],
                purpose: 'Quick start instructions and tool discovery',
              },
              authentication_and_status: {
                resources: [
                  RESOURCE_NAMES.GITHUB_AUTH_STATUS,
                  RESOURCE_NAMES.GITHUB_RATE_LIMITS,
                  RESOURCE_NAMES.NPM_STATUS,
                ],
                purpose: 'Check authentication and API status',
              },
              search_and_discovery: {
                resources: [
                  RESOURCE_NAMES.SEARCH_GITHUB_CODE_INSTRUCTIONS,
                  RESOURCE_NAMES.SEARCH_CONTEXT,
                  RESOURCE_NAMES.QUERY_EXPANSION,
                ],
                purpose: 'Search optimization and strategy guidance',
              },
              workflow_intelligence: {
                resources: [
                  RESOURCE_NAMES.TOOL_ORCHESTRATION,
                  RESOURCE_NAMES.REPOSITORY_INTELLIGENCE,
                ],
                purpose: 'Workflow optimization and quality assessment',
              },
              productivity_and_export: {
                resources: [
                  RESOURCE_NAMES.CODE_EXPORT,
                  RESOURCE_NAMES.ERROR_DIAGNOSTICS,
                ],
                purpose: 'Code export and troubleshooting',
              },
            },
            resource_descriptions: {
              [RESOURCE_NAMES.USAGE_GUIDE]:
                'Quick start guide and essential workflows',
              [RESOURCE_NAMES.CAPABILITIES_DISCOVERY]:
                'Complete tool and resource catalog',
              [RESOURCE_NAMES.GITHUB_AUTH_STATUS]:
                'GitHub authentication status and setup',
              [RESOURCE_NAMES.GITHUB_RATE_LIMITS]:
                'Real-time API rate limit monitoring',
              [RESOURCE_NAMES.NPM_STATUS]:
                'NPM CLI integration and authentication status',
              [RESOURCE_NAMES.SEARCH_GITHUB_CODE_INSTRUCTIONS]:
                'GitHub search syntax guide',
              [RESOURCE_NAMES.SEARCH_CONTEXT]: 'Contextual search strategies',
              [RESOURCE_NAMES.QUERY_EXPANSION]:
                'Query refinement and expansion guidance',
              [RESOURCE_NAMES.TOOL_ORCHESTRATION]:
                'Optimal tool combinations and workflows',
              [RESOURCE_NAMES.REPOSITORY_INTELLIGENCE]:
                'Repository quality assessment criteria',
              [RESOURCE_NAMES.CODE_EXPORT]:
                'Code extraction and export formatting',
              [RESOURCE_NAMES.ERROR_DIAGNOSTICS]:
                'Error troubleshooting and diagnostic workflows',
            },
            essential_workflows: [
              'Check auth → **ALWAYS search topics first** → NPM discovery → Get code',
              'search_github_topics → npm_search → npm_view → view_repository → search_github_code → fetch_file_content',
              '**MANDATORY**: search_github_topics → npm_search → view_repository',
              'search_github_topics → npm_search → search_github_issues → search_github_pull_requests',
              'npm_dependency_analysis → npm_package_stats → npm_view',
              'get_user_organizations → search_github_topics → npm_search → view_repository_structure',
            ],
            key_resources: [
              'github://auth-status - Check GitHub authentication',
              'github://rate-limits - Monitor API usage and limits',
              'npm://status - Verify NPM CLI integration',
              'help://usage - Quick start and essential workflows',
              'help://tools - Complete capabilities catalog',
              'search-github-code-instructions - Advanced search syntax',
              'tool-orchestration - **NPM-first, topics-mandatory** workflow optimization guidance',
              'error-diagnostics - Troubleshooting and error resolution',
            ],
            quick_reference: {
              mandatory_first_steps: [
                'Check github://auth-status for authentication',
                'Check github://rate-limits for API quota',
                '**ALWAYS start with search_github_topics** - never skip',
                'Use npm_search and npm_view before GitHub repo search',
                'Use view_repository before any file operations',
              ],
              high_impact_tools: [
                TOOL_NAMES.SEARCH_GITHUB_TOPICS, // **MANDATORY FIRST**
                TOOL_NAMES.NPM_SEARCH, // **PRIMARY DISCOVERY**
                TOOL_NAMES.NPM_VIEW, // **PRIMARY DISCOVERY**
                TOOL_NAMES.VIEW_REPOSITORY,
                TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
                TOOL_NAMES.GITHUB_ADVANCED_SEARCH,
              ],
              progressive_discovery: [
                '**Topics → NPM → Code → Implementation**',
                '**Single-term searches → NPM discovery → Targeted extraction**',
                'Multiple NPM sources → Cross-reference → Confidence',
              ],
              search_strategy_priorities: [
                '1. MANDATORY: search_github_topics (never skip)',
                '2. PRIMARY: npm_search and npm_view (minimize GitHub API)',
                '3. TARGETED: search_github_code with owner/repo from NPM',
                '4. LAST RESORT: search_github_repos (single terms only)',
              ],
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  }));
}
