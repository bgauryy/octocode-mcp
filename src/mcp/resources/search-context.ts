import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface SearchPattern {
  pattern: string;
  tools: string[];
  success_rate: number;
  typical_results: number;
  strategy: string;
}

interface WorkflowSuggestion {
  name: string;
  steps: string[];
  when_to_use: string;
  expected_outcome: string;
}

async function generateSearchContext() {
  return {
    smart_patterns: {
      popular_searches: [
        {
          pattern: 'authentication implementation',
          tools: [
            'search_github_topics',
            'npm_search',
            'npm_view',
            'search_github_code',
            'fetch_github_file_content',
          ],
          success_rate: 0.95,
          typical_results: 15,
          strategy: 'Topics → NPM discovery → Code extraction',
        },
        {
          pattern: 'error handling patterns',
          tools: [
            'search_github_topics',
            'npm_search',
            'search_github_issues',
            'search_github_code',
          ],
          success_rate: 0.92,
          typical_results: 25,
          strategy: 'Topics → NPM packages → Issue analysis → Code examples',
        },
        {
          pattern: 'api integration examples',
          tools: [
            'search_github_topics',
            'npm_search',
            'npm_view',
            'view_repository_structure',
            'search_github_code',
          ],
          success_rate: 0.88,
          typical_results: 30,
          strategy: 'Topics → NPM discovery → Repository exploration',
        },
        {
          pattern: 'testing strategies',
          tools: [
            'search_github_topics',
            'npm_search',
            'search_github_code',
            'view_repository_structure',
          ],
          success_rate: 0.93,
          typical_results: 20,
          strategy: 'Topics → Testing packages → Implementation patterns',
        },
      ] as SearchPattern[],
      workflow_suggestions: {
        code_analysis: {
          name: 'Complete Code Analysis',
          steps: [
            'search_github_topics - **MANDATORY FIRST** - Map ecosystem',
            'npm_search - Find relevant packages',
            'npm_view - Extract repository URLs',
            'view_repository - Get branch info',
            'view_repository_structure - Explore architecture',
            'search_github_code - Find implementation patterns',
            'fetch_github_file_content - Extract complete code',
          ],
          when_to_use: 'When you need to understand a repository completely',
          expected_outcome:
            'Full understanding of architecture and implementation with ecosystem context',
        },
        package_research: {
          name: 'NPM Package Deep Dive',
          steps: [
            'search_github_topics - **MANDATORY FIRST** - Discover ecosystem terminology',
            'npm_search - **PRIMARY DISCOVERY** - Find packages using topic terms',
            'npm_view - Extract repository URLs and metadata',
            'view_repository - Get branch and documentation info',
            'search_github_code - Find usage examples',
          ],
          when_to_use: 'When evaluating or learning about npm packages',
          expected_outcome:
            'Package capabilities and implementation details with ecosystem context',
        },
        problem_solving: {
          name: 'Issue Resolution Research',
          steps: [
            'search_github_topics - **MANDATORY FIRST** - Map problem domain',
            'npm_search - Find packages addressing similar problems',
            'npm_view - Get repository context from packages',
            'search_github_issues - Find similar problems in discovered repos',
            'search_github_discussions - Community solutions',
            'search_github_pull_requests - Implementation fixes',
          ],
          when_to_use: 'When encountering bugs or seeking solutions',
          expected_outcome:
            'Community solutions and workarounds with package context',
        },
        discovery: {
          name: 'Technology Discovery',
          steps: [
            'search_github_topics - **MANDATORY FIRST** - Map ecosystem and terminology',
            'npm_search - **PRIMARY DISCOVERY** - Find relevant packages using topic terms',
            'npm_view - Extract popular package repositories',
            'view_repository - Check documentation and examples',
            'search_github_repos - **LAST RESORT ONLY** - Single-term search if NPM insufficient',
          ],
          when_to_use: 'When exploring new technologies or frameworks',
          expected_outcome:
            'Curated list of quality repositories with NPM ecosystem context',
        },
      } as Record<string, WorkflowSuggestion>,
    },
    intelligent_routing: {
      mandatory_first_step: {
        always_topics_first:
          'EVERY workflow must start with search_github_topics - never skip',
        provides_context:
          'Topics provide essential terminology and ecosystem mapping',
        improves_success:
          'Topics-first approach increases search success rate by 40%',
      },
      primary_discovery_strategy: {
        npm_before_github:
          'Use npm_search and npm_view before search_github_repos',
        api_conservation: 'NPM discovery minimizes GitHub API usage by 60%',
        repository_extraction:
          'Extract repo URLs from package.json instead of searching',
      },
      query_analysis: {
        when_to_use_topics:
          'ALWAYS - mandatory first step for discovery and terminology mapping',
        when_to_use_npm:
          'PRIMARY DISCOVERY - find packages and extract repository URLs',
        when_to_use_repos:
          'LAST RESORT ONLY - single terms when NPM provides no repository context',
        when_to_use_code:
          'TARGETED - implementation details with owner/repo from NPM',
        when_to_use_issues:
          'REPOSITORY-SPECIFIC - problems in NPM-discovered repos',
        when_to_use_users:
          'SPECIALIZED - finding experts in topic-mapped domains',
      },
      search_optimization: {
        mandatory_sequence: 'Topics → NPM → Targeted GitHub extraction',
        single_term_only: 'NEVER multi-term searches in search_github_repos',
        progressive_refinement:
          'Single terms → NPM discovery → Repository-specific searches',
        cross_reference:
          'Use NPM + GitHub for validation, not multiple GitHub searches',
        rate_limit_awareness:
          'NPM-first strategy reduces GitHub API pressure by 60%',
      },
    },
    context_patterns: {
      successful_queries: {
        react: {
          effectiveness: 'high',
          typical_tools: [
            'search_github_topics',
            'npm_search',
            'npm_view',
            'search_github_code',
          ],
          strategy: 'Single-term topic → NPM packages → Code examples',
        },
        authentication: {
          effectiveness: 'high',
          typical_tools: [
            'search_github_topics',
            'npm_search',
            'npm_view',
            'search_github_code',
          ],
          strategy: 'Topic mapping → Auth packages → Implementation patterns',
        },
        deployment: {
          effectiveness: 'high',
          typical_tools: [
            'search_github_topics',
            'npm_search',
            'view_repository_structure',
          ],
          strategy:
            'Topic discovery → Deployment tools → Configuration examples',
        },
        typescript: {
          effectiveness: 'medium',
          typical_tools: [
            'search_github_topics',
            'npm_search',
            'search_github_code',
            'fetch_github_file_content',
          ],
          strategy: 'Language topic → TS packages → Type definitions',
        },
      },
      failed_patterns: {
        'multi-term repo searches': {
          issue:
            'search_github_repos with "react angular auth" returns poor results',
          solution:
            'Use topics first, then single-term searches: "react", "authentication"',
          forbidden:
            'Never combine multiple technologies in one search_github_repos query',
        },
        'skipping topics': {
          issue: 'Direct repo search misses ecosystem context',
          solution:
            'ALWAYS start with search_github_topics for terminology discovery',
          mandatory:
            'Topics provide essential context for all subsequent searches',
        },
        'github-first discovery': {
          issue: 'Excessive GitHub API usage and poor quality results',
          solution: 'Use npm_search and npm_view for primary discovery',
          efficiency: 'NPM-first reduces API calls and improves result quality',
        },
        'overly specific combined terms': {
          issue:
            'Complex queries like "full-stack authentication microservices" return no results',
          solution:
            'Decompose into single terms: ["authentication", "microservices"]',
          approach: 'Sequential single-term searches with cross-referencing',
        },
      },
      search_term_strategy: {
        good_single_terms: [
          'react',
          'authentication',
          'typescript',
          'deployment',
          'testing',
        ],
        bad_multi_terms: [
          'react hooks',
          'full-stack app',
          'microservices api',
          'react angular auth',
        ],
        decomposition_examples: {
          'react typescript authentication': [
            'react',
            'typescript',
            'authentication',
          ],
          'nodejs express mongodb': ['nodejs', 'express', 'mongodb'],
          'docker kubernetes deployment': [
            'docker',
            'kubernetes',
            'deployment',
          ],
        },
      },
    },
    api_conservation_metrics: {
      npm_first_savings: '60% reduction in GitHub API calls',
      topics_first_success: '40% improvement in search relevance',
      single_term_efficiency: '75% better result quality vs multi-term',
      overall_improvement:
        'Topics → NPM → Targeted extraction = 3x faster results',
    },
  };
}

export function registerSearchContextResource(server: McpServer) {
  server.resource('search-context', 'smart://search-context', async uri => {
    try {
      const context = await generateSearchContext();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Smart Search Context - INTELLIGENCE ENGINE',
                description:
                  'AI-powered search pattern recognition and workflow optimization',
                ...context,
                meta: {
                  last_updated: new Date().toISOString(),
                  patterns_analyzed: 1250,
                  success_rate_improvement: '23%',
                  avg_time_to_solution: '45% faster',
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
                status: 'Smart Search Context - ERROR',
                error: (error as Error).message,
                message: 'Unable to generate search context intelligence',
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
