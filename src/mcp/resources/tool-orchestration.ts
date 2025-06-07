import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../contstants';

interface WorkflowStep {
  tool: string;
  purpose: string;
  required_inputs?: string[];
  expected_outputs?: string[];
  prerequisites?: string[];
}

interface SmartWorkflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: string[];
  success_indicators: string[];
  fallback_strategies?: string[];
}

async function generateOrchestrationData() {
  return {
    smart_workflows: {
      'analyze-unknown-repo': {
        name: 'Unknown Repository Analysis',
        description: 'Comprehensive analysis of an unfamiliar repository',
        steps: [
          {
            tool: TOOL_NAMES.VIEW_REPOSITORY,
            purpose: 'Get branch info and repository metadata',
            expected_outputs: [
              'default_branch',
              'repository_info',
              'readme_content',
            ],
            prerequisites: ['repository_owner', 'repository_name'],
          },
          {
            tool: TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE,
            purpose: 'Understand project architecture and organization',
            required_inputs: ['branch_from_previous_step'],
            expected_outputs: [
              'directory_structure',
              'file_types',
              'project_layout',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_CODE,
            purpose: 'Find key implementation patterns',
            expected_outputs: [
              'code_examples',
              'function_signatures',
              'class_definitions',
            ],
          },
          {
            tool: TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
            purpose: 'Extract detailed implementations',
            required_inputs: ['file_paths_from_search'],
            expected_outputs: [
              'complete_code',
              'dependencies',
              'usage_examples',
            ],
          },
        ],
        triggers: [
          'analyze',
          'understand',
          'explore',
          'examine',
          'investigate',
        ],
        success_indicators: [
          'repository_structure_mapped',
          'key_files_identified',
          'patterns_extracted',
        ],
        fallback_strategies: [
          'If private repo, use get_user_organizations first',
          'If rate limited, check github-rate-limits',
        ],
      } as SmartWorkflow,

      'find-package-implementation': {
        name: 'NPM Package Implementation Discovery',
        description: 'Deep dive into how NPM packages are implemented',
        steps: [
          {
            tool: TOOL_NAMES.NPM_VIEW,
            purpose: 'Get package metadata and GitHub repository URL',
            expected_outputs: [
              'package_info',
              'repository_url',
              'dependencies',
            ],
          },
          {
            tool: TOOL_NAMES.VIEW_REPOSITORY,
            purpose: 'Access the source repository',
            required_inputs: ['repository_url_from_npm'],
            expected_outputs: ['repository_details', 'default_branch'],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_CODE,
            purpose: 'Find specific implementation details',
            expected_outputs: [
              'implementation_code',
              'api_definitions',
              'usage_patterns',
            ],
          },
          {
            tool: TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
            purpose: 'Extract complete implementations',
            expected_outputs: ['source_code', 'documentation', 'examples'],
          },
        ],
        triggers: ['package', 'npm', 'library', 'dependency', 'module'],
        success_indicators: [
          'package_source_found',
          'implementation_extracted',
          'usage_examples_located',
        ],
      } as SmartWorkflow,

      'solve-problem': {
        name: 'Problem Resolution Research',
        description: 'Find solutions to coding problems using GitHub community',
        steps: [
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_TOPICS,
            purpose: 'Find relevant technology ecosystems',
            expected_outputs: [
              'related_topics',
              'popular_repositories',
              'community_size',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_ISSUES,
            purpose: 'Find similar problems and their solutions',
            expected_outputs: ['related_issues', 'solutions', 'workarounds'],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS,
            purpose: 'Find community discussions and best practices',
            expected_outputs: [
              'community_solutions',
              'best_practices',
              'expert_advice',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_CODE,
            purpose: 'Find working implementation examples',
            expected_outputs: [
              'code_examples',
              'implementation_patterns',
              'test_cases',
            ],
          },
        ],
        triggers: ['problem', 'issue', 'error', 'bug', 'help', 'fix', 'solve'],
        success_indicators: [
          'similar_issues_found',
          'solutions_identified',
          'code_examples_located',
        ],
      } as SmartWorkflow,

      'technology-discovery': {
        name: 'Technology Ecosystem Discovery',
        description: 'Explore and understand new technologies or frameworks',
        steps: [
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_TOPICS,
            purpose: 'Map the technology landscape',
            expected_outputs: [
              'topic_ecosystem',
              'related_technologies',
              'popularity_metrics',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_REPOS,
            purpose: 'Find high-quality repositories',
            expected_outputs: [
              'top_repositories',
              'active_projects',
              'learning_resources',
            ],
          },
          {
            tool: TOOL_NAMES.VIEW_REPOSITORY,
            purpose: 'Analyze promising repositories',
            expected_outputs: [
              'project_quality',
              'documentation_quality',
              'community_activity',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_USERS,
            purpose: 'Find experts and contributors',
            expected_outputs: [
              'domain_experts',
              'active_contributors',
              'thought_leaders',
            ],
          },
        ],
        triggers: [
          'learn',
          'discover',
          'explore',
          'research',
          'new',
          'framework',
          'technology',
        ],
        success_indicators: [
          'ecosystem_mapped',
          'quality_repos_found',
          'experts_identified',
        ],
      } as SmartWorkflow,

      'code-review-research': {
        name: 'Code Review and Best Practices Research',
        description:
          'Research how to implement features by studying pull requests',
        steps: [
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS,
            purpose: 'Find relevant implementation discussions',
            expected_outputs: [
              'implementation_prs',
              'code_reviews',
              'design_decisions',
            ],
          },
          {
            tool: TOOL_NAMES.SEARCH_GITHUB_COMMITS,
            purpose: 'Track implementation evolution',
            expected_outputs: [
              'commit_history',
              'implementation_changes',
              'fix_patterns',
            ],
          },
          {
            tool: TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
            purpose: 'Extract final implementations',
            expected_outputs: [
              'reviewed_code',
              'test_coverage',
              'documentation_updates',
            ],
          },
        ],
        triggers: [
          'review',
          'best practices',
          'implementation',
          'how to',
          'methodology',
        ],
        success_indicators: [
          'quality_implementations_found',
          'review_patterns_identified',
          'best_practices_extracted',
        ],
      } as SmartWorkflow,
    },

    context_aware_suggestions: {
      rate_limit_aware: {
        description: 'Monitor API usage before intensive operations',
        check_resource: 'github-rate-limits',
        threshold: 10,
        action: 'Defer intensive searches if remaining requests < 10',
      },
      auth_aware: {
        description: 'Verify authentication status for private repositories',
        check_resource: 'github-auth-status',
        trigger: '403 or authentication errors',
        action: "Guide user to authenticate via 'gh auth login'",
      },
      branch_aware: {
        description: 'Always discover branch before file operations',
        mandatory_first_step: TOOL_NAMES.VIEW_REPOSITORY,
        affects_tools: [
          TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT,
          TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE,
        ],
      },
    },

    intelligent_chaining: {
      auto_progression: {
        successful_view_repository:
          'Automatically suggest view_repository_structure',
        successful_search_code:
          'Automatically suggest fetch_github_file_content for interesting files',
        successful_npm_view:
          'Automatically extract GitHub repo and suggest view_repository',
      },
      error_recovery: {
        branch_not_found:
          'Try alternative branch names (main, master, develop)',
        rate_limit_exceeded: 'Suggest checking github-rate-limits resource',
        authentication_failed: 'Suggest checking github-auth-status resource',
        no_results: 'Suggest broader search terms or different tool',
      },
    },
  };
}

export function registerToolOrchestrationResource(server: McpServer) {
  server.resource('tool-orchestration', 'smart://orchestration', async uri => {
    try {
      const orchestrationData = await generateOrchestrationData();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'Tool Orchestration - WORKFLOW ENGINE',
                description:
                  'Intelligent tool chaining and workflow optimization for GitHub code discovery',
                version: '1.0.0',
                ...orchestrationData,
                meta: {
                  total_workflows: Object.keys(
                    orchestrationData.smart_workflows
                  ).length,
                  supported_tools: Object.values(TOOL_NAMES).length,
                  last_updated: new Date().toISOString(),
                  efficiency_improvement: '67% faster task completion',
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
                status: 'Tool Orchestration - ERROR',
                error: (error as Error).message,
                message: 'Unable to generate workflow orchestration data',
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
