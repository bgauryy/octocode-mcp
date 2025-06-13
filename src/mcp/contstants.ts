export const TOOL_NAMES = {
  // GitHub Search API (/search/*)
  GITHUB_SEARCH_CODE: 'github_search_code',
  GITHUB_SEARCH_REPOS: 'github_search_repositories',
  GITHUB_SEARCH_COMMITS: 'github_search_commits',
  GITHUB_SEARCH_ISSUES: 'github_search_issues',
  GITHUB_SEARCH_PULL_REQUESTS: 'github_search_pull_requests',
  GITHUB_SEARCH_DISCUSSIONS: 'github_search_discussions',
  GITHUB_SEARCH_TOPICS: 'github_search_topics',
  GITHUB_SEARCH_USERS: 'github_search_users',

  // GitHub Repository API (/repos/*)
  GITHUB_GET_REPOSITORY: 'github_get_repository',
  GITHUB_GET_CONTENTS: 'github_get_contents',
  GITHUB_GET_FILE_CONTENT: 'github_get_file_content',

  // GitHub Users API (/user/*)
  GITHUB_GET_USER_ORGS: 'github_get_user_organizations',

  // System & API Status
  API_STATUS_CHECK: 'api_status_check',

  // npm Registry API - Comprehensive
  NPM_SEARCH_PACKAGES: 'npm_search_packages',
  NPM_GET_PACKAGE: 'npm_get_package',
  NPM_GET_PACKAGE_STATS: 'npm_get_package_stats',
  NPM_ANALYZE_DEPENDENCIES: 'npm_analyze_dependencies',

  // npm Registry API - Focused (minimal token usage)
  NPM_GET_REPOSITORY: 'npm_get_repository',
  NPM_GET_DEPENDENCIES: 'npm_get_dependencies',
  NPM_GET_BUGS: 'npm_get_bugs',
  NPM_GET_README: 'npm_get_readme',
  NPM_GET_VERSIONS: 'npm_get_versions',
  NPM_GET_LICENSE: 'npm_get_license',
  NPM_GET_HOMEPAGE: 'npm_get_homepage',
  NPM_GET_ID: 'npm_get_id',
  NPM_GET_RELEASES: 'npm_get_releases',
  NPM_GET_ENGINES: 'npm_get_engines',
  NPM_GET_EXPORTS: 'npm_get_exports',

  // Advanced/Composite Operations
  GITHUB_ADVANCED_SEARCH: 'github_advanced_search',
} as const;

export const RESOURCE_NAMES = {
  // Help & Quick Start
  USAGE_GUIDE: 'usage-guide',
  CAPABILITIES_DISCOVERY: 'capabilities-discovery',

  // Authentication & Status
  GITHUB_AUTH_STATUS: 'github-auth-status',
  GITHUB_RATE_LIMITS: 'github-rate-limits',
  NPM_STATUS: 'npm-status',

  // Search & Discovery
  GITHUB_SEARCH_CODE_INSTRUCTIONS: 'github-search-code-instructions',
  SEARCH_CONTEXT: 'search-context',
  QUERY_EXPANSION: 'query-expansion',

  // Workflow Intelligence
  TOOL_ORCHESTRATION: 'tool-orchestration',
  REPOSITORY_INTELLIGENCE: 'repository-intelligence',

  // Productivity & Export
  CODE_EXPORT: 'code-export',
  ERROR_DIAGNOSTICS: 'error-diagnostics',
} as const;

export const INDEX_MAP = {
  CRITICAL: '#CRITICAL#',
  SUCCESS: '#SUCCESS#',
  TARGET: '#TARGET#',
  WARNING: '#WARNING#',
  CODE: '#CODE#',
  PHASE1: '#PHASE1#',
  PHASE2: '#PHASE2#',
  PHASE3: '#PHASE3#',
  PHASE4: '#PHASE4#',
  IDEAL: '#IDEAL#',
  GOOD: '#GOOD#',
  BROAD: '#BROAD#',
  EXCESSIVE: '#EXCESSIVE#',
  DISCOVERY: '#DISCOVERY#',
  EXTRACTION: '#EXTRACTION#',
  VALIDATION: '#VALIDATION#',
  RECOVERY: '#RECOVERY#',
  BRANCH: '#BRANCH#',
  USER: '#USER#',
  CONDITIONAL: '#CONDITIONAL#',
  EFFICIENCY: '#EFFICIENCY#',
};
