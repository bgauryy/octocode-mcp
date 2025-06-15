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

INITIALIZATION: ${TOOL_NAMES.API_STATUS_CHECK}

SMART DISCOVERY WORKFLOW:
1. PRIVATE/ORG DETECTION: @org/package → ${TOOL_NAMES.GITHUB_GET_USER_ORGS} → auto-set owner
2. NPM-FIRST: ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.NPM_GET_EXPORTS} → extract repo URLs
3. TARGETED SEARCH: Use NPM intelligence for precise ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries
4. CROSS-REFERENCE: ${TOOL_NAMES.GITHUB_SEARCH_REPOS} + ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} for validation

QUALITY-OPTIMIZED LIMITS (LLM-FOCUSED):
- Default 20-30 results (optimal for processing)
- Max 50 results (prevents token overflow)
- Quality > quantity: stars>10, active repos, verified sources

OPTIMIZATION RULES:
- Single terms work best
- Quality indicators: stars>10 (established), recent activity
- Path targeting: src/, lib/, examples/
- Boolean ops: OR, AND, NOT for refinement

PRIVATE REPO HANDLING:
- Auto-detect @org/ patterns → fetch user orgs
- Enterprise patterns: @wix/, @microsoft/, @google/
- Fallback to public if private access fails

TOKEN OPTIMIZATION:
- Concise responses (no emojis, minimal formatting)
- Essential data only (name, description, links)
- Smart fallback chains vs verbose explanations
- Quality thresholds to filter noise

SMART FALLBACKS:
No results → broader terms + different tool
Error → specific fix + alternative approach
Limited results → ecosystem expansion via NPM`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for repository discovery. Optimized 20 results default.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping. Quality-focused 20 results.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Get user organizations for private repository access. Required for @org/ packages.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code with query optimization. 30 results optimal for analysis.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content. Use after ${TOOL_NAMES.GITHUB_GET_CONTENTS} for discovery.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository structure. Essential for file discovery and navigation.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search issues for problem discovery. Quality-filtered 25 results.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis. 25 curated results.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking. 25 focused results.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers and experts. 25 quality profiles.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories across domains. Quality-optimized 25 results.`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree for ecosystem analysis.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get production releases. Semantic versions only, excludes pre-release.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract package API intelligence. Entry points, imports, search targets.`,

  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication. Check GitHub CLI, NPM connectivity.`,
};
