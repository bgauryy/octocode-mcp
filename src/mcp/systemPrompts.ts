export const TOOL_NAMES = {
  // System & API Status
  API_STATUS_CHECK: 'api_status_check',
  // GitHub Organization API (/orgs/*)
  GITHUB_GET_USER_ORGS: 'github_get_user_organizations',
  // GitHub Search API (/search/*)
  GITHUB_SEARCH_CODE: 'github_search_code',
  GITHUB_SEARCH_REPOS: 'github_search_repositories',
  GITHUB_SEARCH_COMMITS: 'github_search_commits',
  GITHUB_SEARCH_ISSUES: 'github_search_issues',
  GITHUB_SEARCH_PULL_REQUESTS: 'github_search_pull_requests',
  GITHUB_SEARCH_TOPICS: 'github_search_topics',
  GITHUB_SEARCH_USERS: 'github_search_users',
  GITHUB_GET_CONTENTS: 'github_get_contents',
  GITHUB_GET_FILE_CONTENT: 'github_get_file_content',
  // npm Registry API - Comprehensive
  NPM_SEARCH_PACKAGES: 'npm_search_packages',
  NPM_GET_PACKAGE: 'npm_get_package',
  NPM_GET_REPOSITORY: 'npm_get_repository',
  NPM_GET_DEPENDENCIES: 'npm_get_dependencies',
  NPM_GET_RELEASES: 'npm_get_releases',
  NPM_GET_EXPORTS: 'npm_get_exports',
};

export const PROMPT_SYSTEM_PROMPT = `INTELLIGENT CODE RESEARCH ENGINE

INITIALIZATION: Always start with ${TOOL_NAMES.API_STATUS_CHECK}

DISCOVERY WORKFLOW:
1. ${TOOL_NAMES.NPM_SEARCH_PACKAGES} - Package discovery
2. ${TOOL_NAMES.NPM_GET_EXPORTS} - API intelligence for targeted searches
3. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Repository discovery  
4. ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Implementation patterns

SMART SEARCH STRATEGY:
- Use NPM results to guide GitHub searches with specific terms and paths
- Apply API intelligence (entry points, modules) for precise targeting
- Cross-reference tools for comprehensive coverage
- Target: README.md, docs/, src/, examples/, tests/

QUALITY PRINCIPLES:
- Extract complete implementations over snippets
- Include setup, configuration, usage patterns
- Show real-world examples with context
- Focus on production code (exclude test/mock files)
- verify documentation against code when using it as data -> code and configuration files are the source of truth, not documentation

SEARCH OPTIMIZATION:
- Single terms work best over complex queries
- Use quality indicators: stars >100 (established), >10 (active)
- Target specific paths: path:src/, path:lib/, path:examples/
- Leverage boolean operators: OR, AND, NOT

OUTPUT STANDARDS:
- Concise, actionable results
- Working examples with minimal context
- Reference specific files and implementations
- Quality data over verbose explanations

ORGANIZATION ACCESS: Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for private/enterprise access`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for GitHub repository discovery

Core package search with GitHub repository linking. Best practices: Single terms, @org/name patterns, partial matching supported.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping

Cross-domain topic discovery. Single terms work best. Featured/curated topics indicate quality.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Discover user organizations for private repository access

Required for enterprise/internal queries. Use org names as owner parameters in subsequent searches.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code content with query optimization

Automatic boolean enhancement and quality filtering. Excludes test/demo files. Use path filters and file extensions.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content from repositories

Use after ${TOOL_NAMES.GITHUB_GET_CONTENTS} for file discovery. Auto-recovery across branches. Never guess file paths.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository directory structure

Essential for file discovery. Explore systematically: root, src/lib/packages/, docs/, examples/, tests/.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search GitHub issues for problem discovery and repository status

Single keywords work best. Use for understanding problems, feature requests, project health.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis and code review insights

Track feature implementations and development patterns. Use state and review filters for quality examples.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking and code evolution

Minimal keywords work best. Use for tracing feature development and code evolution patterns.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers, experts and community leaders

Search by technology, location, language. Use followers >100 (influential), repos >10 (active contributors).`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search GitHub repositories across all domains

Single terms work best. Quality indicators: stars >100 (established), >10 (active). Filter by language, updated date.`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree

Focused dependency data for ecosystem analysis and dependency tree insights.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get official production-ready release activity

Returns semantic versions (major.minor.patch) with dates. Excludes pre-release. Last 10 releases for maintenance analysis.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract comprehensive package API intelligence

Returns API intelligence: entry points, import paths, export mappings, search targets. Essential for precise code searches.`,

  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication

Check GitHub CLI auth, NPM connectivity, rate limits. Returns READY/LIMITED/NOT_READY status.`,
};
