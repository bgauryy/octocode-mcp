import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../contstants';

export function registerToolOrchestrationResource(server: McpServer) {
  server.resource('tool-orchestration', 'help://workflows', async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            smart_workflows: {
              'package-research': {
                name: 'Package Implementation Research',
                steps: [
                  `${TOOL_NAMES.NPM_VIEW} - Get package metadata`,
                  `${TOOL_NAMES.VIEW_REPOSITORY} - Find GitHub repo and branch`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find implementation patterns`,
                  `${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} - Extract complete code`,
                ],
                triggers: ['package', 'npm', 'library', 'dependency'],
              },
              'problem-solving': {
                name: 'Find Solutions to Coding Problems',
                steps: [
                  `${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - Find relevant ecosystems`,
                  `${TOOL_NAMES.SEARCH_GITHUB_ISSUES} - Find similar problems`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find working solutions`,
                  `${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} - Extract implementations`,
                ],
                triggers: ['error', 'problem', 'issue', 'help', 'fix'],
              },
              'repository-analysis': {
                name: 'Understand Unknown Repository',
                steps: [
                  `${TOOL_NAMES.VIEW_REPOSITORY} - Get metadata and branch`,
                  `${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE} - Explore architecture`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find key patterns`,
                  `${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} - Extract examples`,
                ],
                triggers: ['analyze', 'explore', 'understand', 'examine'],
              },
              'technology-discovery': {
                name: 'Learn New Technology',
                steps: [
                  `${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - Map ecosystem`,
                  `${TOOL_NAMES.SEARCH_GITHUB_REPOS} - Find quality projects`,
                  `${TOOL_NAMES.VIEW_REPOSITORY} - Check documentation`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find usage examples`,
                ],
                triggers: [
                  'learn',
                  'tutorial',
                  'introduction',
                  'getting-started',
                ],
              },
            },
            execution_principles: {
              always_check_auth:
                'Read github://auth-status before GitHub operations',
              monitor_rate_limits:
                'Check github://rate-limits for intensive workflows',
              branch_discovery:
                'Always use view_repository before file operations',
              progressive_refinement: 'Start broad, then narrow down searches',
              quality_validation:
                'Target >1K stars OR recent activity OR enterprise usage',
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
