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
                  `${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - **MANDATORY FIRST** - Map ecosystem terminology`,
                  `${TOOL_NAMES.NPM_SEARCH} - **PRIMARY DISCOVERY** - Find relevant packages`,
                  `${TOOL_NAMES.NPM_VIEW} - Extract repository URLs and metadata`,
                  `${TOOL_NAMES.VIEW_REPOSITORY} - Get branch info from discovered repos`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find implementation patterns`,
                  `${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} - Extract complete code`,
                ],
                triggers: ['package', 'npm', 'library', 'dependency'],
                strategy: 'Topics → NPM → Targeted GitHub extraction',
              },
              'problem-solving': {
                name: 'Find Solutions to Coding Problems',
                steps: [
                  `${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - **MANDATORY FIRST** - Find relevant ecosystems`,
                  `${TOOL_NAMES.NPM_SEARCH} - Find packages solving similar problems`,
                  `${TOOL_NAMES.NPM_VIEW} - Get repository context from packages`,
                  `${TOOL_NAMES.SEARCH_GITHUB_ISSUES} - Find similar problems in discovered repos`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find working solutions`,
                  `${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} - Extract implementations`,
                ],
                triggers: ['error', 'problem', 'issue', 'help', 'fix'],
                strategy:
                  'Topics → NPM packages → Repository-specific issue/code search',
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
                strategy:
                  'Direct repository analysis (when repo already known)',
              },
              'technology-discovery': {
                name: 'Learn New Technology',
                steps: [
                  `${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - **MANDATORY FIRST** - Map ecosystem and terminology`,
                  `${TOOL_NAMES.NPM_SEARCH} - **PRIMARY DISCOVERY** - Find relevant packages using topic terms`,
                  `${TOOL_NAMES.NPM_VIEW} - Extract popular package repositories`,
                  `${TOOL_NAMES.VIEW_REPOSITORY} - Check documentation and examples`,
                  `${TOOL_NAMES.SEARCH_GITHUB_CODE} - Find usage examples in discovered repos`,
                  `${TOOL_NAMES.SEARCH_GITHUB_REPOS} - **LAST RESORT** - Single-term search if NPM insufficient`,
                ],
                triggers: [
                  'learn',
                  'tutorial',
                  'introduction',
                  'getting-started',
                ],
                strategy:
                  'Topics → NPM discovery → Repository exploration → Code extraction',
              },
            },
            execution_principles: {
              mandatory_topics_first:
                'ALWAYS start with search_github_topics - never skip this step',
              npm_primary_discovery:
                'Use npm_search and npm_view before github repo search to minimize API calls',
              single_term_searches:
                'NEVER use multi-term searches in search_github_repos (e.g. "react angular")',
              github_repos_last_resort:
                'Use search_github_repos only when NPM provides no repository context',
              always_check_auth:
                'Read github://auth-status before GitHub operations',
              monitor_rate_limits:
                'Check github://rate-limits for intensive workflows',
              branch_discovery:
                'Always use view_repository before file operations',
              progressive_refinement:
                'Start broad (topics), then narrow (NPM), then specific (code)',
              quality_validation:
                'Target >1K stars OR recent activity OR enterprise usage',
            },
            search_strategy_rules: {
              topics_search: {
                purpose: 'Discover ecosystem terminology and context',
                when: 'ALWAYS - first step in every workflow',
                terms:
                  'Single technology terms (react, authentication, deployment)',
                never: 'Skip this step or use complex multi-word phrases',
              },
              npm_search: {
                purpose:
                  'Primary discovery mechanism to find relevant packages',
                when: 'After topics, before GitHub repo search',
                terms: 'Use terms discovered from topics search',
                extract:
                  'Repository URLs from package.json homepage/repository fields',
              },
              github_repo_search: {
                purpose: 'Last resort discovery when NPM insufficient',
                when: 'Only when NPM provides no repository context',
                terms: 'SINGLE TERMS ONLY - never multi-term queries',
                forbidden: 'Multi-term searches like "react angular auth"',
              },
              api_conservation: {
                primary_discovery: 'Use NPM tools to minimize GitHub API calls',
                github_targeted:
                  'Use GitHub API only for specific repo operations',
                rate_limit_check:
                  'Always check limits before intensive operations',
              },
            },
            workflow_examples: {
              good_workflow: [
                '1. search_github_topics: "react"',
                '2. npm_search: "react"',
                '3. npm_view: "react"',
                '4. view_repository: "facebook/react"',
                '5. search_github_code: find hooks examples',
                '6. fetch_github_file_content: extract implementations',
              ],
              bad_workflow: [
                '❌ search_github_repos: "react hooks authentication"',
                '❌ Skipping search_github_topics',
                '❌ Using GitHub repo search before NPM',
              ],
              single_term_examples: {
                good: ['react', 'authentication', 'typescript', 'deployment'],
                bad: ['react hooks', 'full stack auth', 'microservices api'],
              },
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
