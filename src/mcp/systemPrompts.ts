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
  NPM_PACKAGE_SEARCH: 'npm_package_search',
  NPM_VIEW_PACKAGE: 'npm_view_package',
};

export const PROMPT_SYSTEM_PROMPT = `Code research assistant. Start with ${TOOL_NAMES.API_STATUS_CHECK}.

DISCOVERY STRATEGY - TOPICS FIRST:
Repository names lie, topics don't! Always prioritize semantic discovery over name-based search.

WORKFLOW:
1. ${TOOL_NAMES.API_STATUS_CHECK} first (discover organizations)
2. For technology/ecosystem discovery → ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} FIRST (semantic discovery)
3. For specific implementations → ${TOOL_NAMES.GITHUB_SEARCH_CODE} (find actual code patterns)
4. For repository discovery → ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (after topics provide context)
5. For packages → ${TOOL_NAMES.NPM_PACKAGE_SEARCH} → ${TOOL_NAMES.NPM_VIEW_PACKAGE} → repository discovery
6. For file content → ${TOOL_NAMES.GITHUB_GET_CONTENTS} → ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}

SEARCH HEURISTICS:
- SEMANTIC DISCOVERY: Use ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for "what does this technology do" questions
- PATTERN DISCOVERY: Use ${TOOL_NAMES.GITHUB_SEARCH_CODE} for "how is this implemented" questions  
- COMPARATIVE ANALYSIS: Start with topics, then drill down to code and repositories
- Public search first, fallback to org search if needed
- Use stars:>100 for established projects
- Topic search reveals ecosystem landscape better than repository names

TOOLS PRIORITY:
Primary Discovery: github_search_topics (semantic), github_search_code (implementation patterns)
Secondary Discovery: github_search_repos (after topics provide context), npm_package_search
Deep Analysis: github_get_contents, github_get_file_content, npm_view_package
Problem Analysis: github_search_issues, github_search_pull_requests, github_search_commits
Access Control: api_status_check (organization discovery for private repositories)`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Check GitHub & NPM authentication status and discover user organizations.
  Essential first step that enables access to private/organizational repositories by identifying available organizations for the 'owner' parameter in search tools.
  Critical for enterprise code exploration and accessing company-specific repositories that require organizational membership.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `PRIORITY DISCOVERY TOOL: Find technology topics and ecosystems through semantic search.
  Repository names can be misleading, but topics represent what the code actually does!
  Use this FIRST for:
  - Technology ecosystem discovery (e.g., "model context protocol", "github api", "code analysis")
  - Comparative analysis between technologies
  - Understanding technology landscapes and trends
  - Finding similar projects and implementations
  Topics provide semantic context that repository names often miss. Always start here for exploratory research.`,

  [TOOL_NAMES.NPM_PACKAGE_SEARCH]: `Search NPM packages by keyword. Use for package ecosystem discovery.`,

  [TOOL_NAMES.NPM_VIEW_PACKAGE]: `Get comprehensive package metadata essential for further GitHub searches and code analysis. Returns vital data including:
  1. repositoryGitUrl - Critical for accurate GitHub repository searches with reduced API limitations
  2. exports - Essential for understanding package API structure and import patterns
  3. dependencies - Shows how the package is built and its ecosystem relationships
  4. registryUrl - Identifies the package registry source for distribution analysis
  5. versions with release dates - Historical context for package evolution
  Use this tool when you find packages in code or when users ask about specific packages to get complete context before GitHub searches.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `SEMANTIC CODE DISCOVERY: Search code with boolean logic (AND, OR, NOT). 
  Format: "term AND term" language:js path:src. Filters: owner/org/user, repo, extension, filename, language, path, size, limit, match scope. 
  Use for finding actual implementation patterns and code examples.
  CRITICAL: When packages found in results or from user input, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} for metadata/paths.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories by name/description. Use AFTER topics search provides context.
  Repository names can be misleading - use ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} first for semantic discovery.
  Use stars:>100 for quality projects. CRITICAL: When finding packages, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} to get essential metadata and repository paths.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Browse repository structure. Use before github_get_file_content to understand file organization.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Read file content. Requires exact path from github_get_contents.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Find GitHub issues and problems. Use for understanding pain points and feature requests.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Find pull requests and implementations. Use for understanding how features were implemented.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history. Use for understanding code evolution and development patterns.`,
};
