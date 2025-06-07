import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../contstants';

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
                ],
                purpose: 'Find repositories, code, issues, and discussions',
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
                tools: [TOOL_NAMES.NPM_VIEW, TOOL_NAMES.NPM_SEARCH],
                purpose: 'Find and analyze NPM packages',
              },
              auth: {
                tools: [TOOL_NAMES.GET_USER_ORGANIZATIONS],
                purpose: 'Access private repositories',
              },
            },
            tool_descriptions: {
              [TOOL_NAMES.SEARCH_GITHUB_CODE]:
                'Find specific code implementations',
              [TOOL_NAMES.SEARCH_GITHUB_REPOS]: 'Discover quality repositories',
              [TOOL_NAMES.SEARCH_GITHUB_ISSUES]: 'Find problems and solutions',
              [TOOL_NAMES.SEARCH_GITHUB_TOPICS]: 'Map technology ecosystems',
              [TOOL_NAMES.VIEW_REPOSITORY]:
                'Get metadata and branch info (required first!)',
              [TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT]:
                'Extract complete source code',
              [TOOL_NAMES.NPM_VIEW]: 'Get package metadata and GitHub links',
              [TOOL_NAMES.NPM_SEARCH]: 'Find packages by functionality',
            },
            essential_workflows: [
              'Check auth → Use topics → Find repos → Get code',
              'npm_view → view_repository → search_github_code → fetch_file_content',
              'search_github_topics → search_github_repos → view_repository',
            ],
            key_resources: [
              'github://auth-status - Check authentication',
              'github://rate-limits - Monitor API usage',
              'help://search-optimization - Improve search queries',
              'help://workflows - Common tool combinations',
            ],
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  }));
}
