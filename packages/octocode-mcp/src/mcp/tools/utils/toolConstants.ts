// Research goals might help the LLM to understand the user request and the context of the research
// and add research hints to generate the best research plan and tools to use
export const enum ResearchGoal {
  DISCOVERY = 'discovery',
  ANALYSIS = 'analysis',
  DEBUGGING = 'debugging',
  EXPLORATION = 'exploration',
  CONTEXT_GENERATION = 'context_generation',
  CODE_GENERATION = 'code_generation',
  DOCS_GENERATION = 'docs_generation',
  CODE_ANALYSIS = 'code_analysis',
  CODE_REVIEW = 'code_review',
  CODE_REFACTORING = 'code_refactoring',
  CODE_OPTIMIZATION = 'code_optimization',
}

// Zod enum for use in schemas
export const ResearchGoalEnum = [
  'discovery',
  'analysis',
  'debugging',
  'exploration',
  'context_generation',
  'code_generation',
  'docs_generation',
  'code_analysis',
  'code_review',
  'code_refactoring',
  'code_optimization',
] as const;

export const TOOL_NAMES = {
  GITHUB_FETCH_CONTENT: 'githubGetFileContent',
  GITHUB_SEARCH_CODE: 'githubSearchCode',
  GITHUB_SEARCH_COMMITS: 'githubSearchCommits',
  GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
  GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
  GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
  PACKAGE_SEARCH: 'packageSearch',
  // OAuth Tools
  OAUTH_INITIATE: 'oauthInitiate',
  OAUTH_CALLBACK: 'oauthCallback',
  OAUTH_STATUS: 'oauthStatus',
  OAUTH_REVOKE: 'oauthRevoke',
  // Organization Tools
  CHECK_ORGANIZATION_MEMBERSHIP: 'checkOrganizationMembership',
  LIST_USER_ORGANIZATIONS: 'listUserOrganizations',
  CHECK_TEAM_MEMBERSHIP: 'checkTeamMembership',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
