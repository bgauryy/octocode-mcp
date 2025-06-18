export const TOOL_NAMES = {
  // System & API Status
  API_STATUS_CHECK: 'api_status_check',
  // GitHub
  GITHUB_SEARCH_CODE: 'github_search_code',
  GITHUB_SEARCH_REPOS: 'github_search_repositories',
  GITHUB_SEARCH_COMMITS: 'github_search_commits',
  GITHUB_SEARCH_ISSUES: 'github_search_issues',
  GITHUB_SEARCH_PULL_REQUESTS: 'github_search_pull_requests',
  GITHUB_SEARCH_TOPICS: 'github_search_topics',
  GITHUB_GET_CONTENTS: 'github_get_contents',
  GITHUB_GET_FILE_CONTENT: 'github_get_file_content',
  // NPM
  NPM_SEARCH_PACKAGES: 'npm_search_packages',
  NPM_VIEW_PACKAGE: 'npm_view_package',
};

export const PROMPT_SYSTEM_PROMPT = `Code research assistant. Start with ${TOOL_NAMES.API_STATUS_CHECK}.

WORKFLOW:
1. ${TOOL_NAMES.API_STATUS_CHECK} first
2. For org/company code → search with owner param from discovered organizations
3. For packages → ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.GITHUB_SEARCH_REPOS}
4. For files → ${TOOL_NAMES.GITHUB_GET_CONTENTS} → ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}
5. For package details → ${TOOL_NAMES.NPM_VIEW_PACKAGE}

SEARCH STRATEGY:
- Public search first, fallback to org search if 0 results
- Use stars:>100 for established projects
- Check organizations early for private/company code

TOOLS:
Discovery: npm_search_packages, github_search_repos, github_search_topics
Analysis: github_get_contents, github_get_file_content, npm_view_package
Problems: github_search_issues, github_search_pull_requests, github_search_commits
Org Access: api_status_check (includes organization discovery)`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Check GitHub & NPM authentication status and discover user organizations.
  Essential first step that enables access to private/organizational repositories by identifying available organizations for the 'owner' parameter in search tools.
  Critical for enterprise code exploration and accessing company-specific repositories that require organizational membership.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Find technology topics and ecosystems.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages by keyword.`,

  [TOOL_NAMES.NPM_VIEW_PACKAGE]: `Get comprehensive package metadata essential for further GitHub searches and code analysis. Returns vital data including:
  1. repositoryGitUrl - Critical for accurate GitHub repository searches with reduced API limitations
  2. exports - Essential for understanding package API structure and import patterns
  3. dependencies - Shows how the package is built and its ecosystem relationships
  4. registryUrl - Identifies the package registry source for distribution analysis
  5. versions with release dates - Historical context for package evolution
  Use this tool when you find packages in code or when users ask about specific packages to get complete context before GitHub searches.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code with boolean logic. Format: "term AND term" language:js path:src`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories. Use stars:>100 for quality projects.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Browse repo structure. Use before github_get_file_content.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Read file content. Requires exact path from github_get_contents.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Find GitHub issues and problems.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Find pull requests and implementations.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history.`,
};
