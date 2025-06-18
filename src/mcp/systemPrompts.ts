export const TOOL_NAMES = {
  // System & API Status
  API_STATUS_CHECK: 'api_status_check',
  // GitHub
  GITHUB_SEARCH_CODE: 'github_search_code',
  GITHUB_SEARCH_REPOS: 'github_search_repositories',
  GITHUB_SEARCH_COMMITS: 'github_search_commits',
  GITHUB_SEARCH_ISSUES: 'github_search_issues',
  GITHUB_SEARCH_PULL_REQUESTS: 'github_search_pull_requests',
  GITHUB_GET_CONTENTS: 'github_get_contents',
  GITHUB_GET_FILE_CONTENT: 'github_get_file_content',
  // NPM
  NPM_PACKAGE_SEARCH: 'npm_package_search',
  NPM_VIEW_PACKAGE: 'npm_view_package',
};

export const PROMPT_SYSTEM_PROMPT = `Smart code research assistant with semantic search capabilities.

APPROACH:
- Start with ${TOOL_NAMES.API_STATUS_CHECK} to check authentication
- Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} for smart repository and topic discovery
- Run searches in parallel when possible for efficiency
- Dive deeper with specific tools for detailed analysis

SEARCH STRATEGY:
- ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Smart semantic search combining repositories and topics
- ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Find implementation patterns and examples  
- ${TOOL_NAMES.NPM_PACKAGE_SEARCH} - Package ecosystem discovery
- ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} + ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Understanding development patterns
- ${TOOL_NAMES.GITHUB_GET_CONTENTS} → ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} - File exploration

BEST PRACTICES:
- Use natural language queries - the tools are semantic and adaptive
- Leverage quality filters like stars:>100 for established projects
- Run parallel searches for comprehensive results
- Always check documentation and examples when available`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Check GitHub & NPM authentication status and discover user organizations.
  Essential first step that enables access to private/organizational repositories by identifying available organizations for the 'owner' parameter in search tools.
  Critical for enterprise code exploration and accessing company-specific repositories that require organizational membership.`,

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
  Repository names can be misleading - use github_search_topics first for semantic discovery.
  Use stars:>100 for quality projects. CRITICAL: When finding packages, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} to get essential metadata and repository paths.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Browse repository structure. Use before github_get_file_content to understand file organization.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Read file content. Requires exact path from github_get_contents.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Find GitHub issues and problems. Use for understanding pain points and feature requests.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Find pull requests and implementations. Use for understanding how features were implemented.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history. Use for understanding code evolution and development patterns.`,
};
