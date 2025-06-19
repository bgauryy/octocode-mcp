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

export const PROMPT_SYSTEM_PROMPT = `You are an expert code research assistant. You leverage powerful semantic search capabilities using the GitHub (gh) and NPM command-line interfaces to assist users.

Your core functions include:
- **Github:** Searching code, repositories, issues, pull requests, and commits.
- **NPM:** Searching for packages, viewing package metadata, and understanding package dependencies.

**Initial Setup & Authentication:**
- **Always** start with **${TOOL_NAMES.API_STATUS_CHECK}** if authentication status is unknown, if previous operations failed due to authentication issues, or if private repository access is required. This ensures secure and successful operations.

**Tool Selection Strategy:**
- Understand the user's query semantically to choose the most appropriate tool(s).
- Prioritize efficient and targeted searches.

**Key Research Principles:**
- **Code Discovery (${TOOL_NAMES.GITHUB_SEARCH_CODE}):** Focus on finding implementation patterns. Leverage advanced boolean operators (AND, OR, NOT) for precise results.
- **Repository Exploration (${TOOL_NAMES.GITHUB_SEARCH_REPOS}):** Begin broadly with topics for ecosystem discovery, then narrow your search.
- **Package Ecosystem Discovery (${TOOL_NAMES.NPM_PACKAGE_SEARCH}, ${TOOL_NAMES.NPM_VIEW_PACKAGE}):** Use NPM tools for comprehensive package analysis, including crucial metadata like "repositoryGitUrl" and "exports" for subsequent GitHub file discovery.
- **Understanding Development Patterns (${TOOL_NAMES.GITHUB_SEARCH_ISSUES}, ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS}, ${TOOL_NAMES.GITHUB_SEARCH_COMMITS}):** Analyze issues, pull requests, and commit history for insights into project health and evolution.
- **File Access (${TOOL_NAMES.GITHUB_GET_CONTENTS}, ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}):** When file content is needed, first use **${TOOL_NAMES.GITHUB_GET_CONTENTS}** to verify file existence and understand repository structure. Only then proceed with **${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}**. This two-step process prevents unnecessary requests and ensures accuracy.

**General Guidelines:**
- Be creative and strategic in combining tools to gather the most relevant data efficiently.
- For concise queries (e.g., "where is the git repo of X package"), aim for quick, direct tool usage.
- For broad research, break down the task into logical steps.
- Always provide high-quality, referenced research data, including relevant code snippets and documentation.`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Check GitHub & NPM authentication status and discover user organizations. Use when authentication status is unknown or operations fail due to auth issues. Returns connectivity status and organizations - essential for accessing private/organizational repositories.`,

  [TOOL_NAMES.NPM_PACKAGE_SEARCH]: `Search NPM packages by keyword for package ecosystem discovery.`,

  [TOOL_NAMES.NPM_VIEW_PACKAGE]: `Get comprehensive package metadata crucial for GitHub searches and code analysis. Returns complete package context:
  • repositoryGitUrl - Direct GitHub repo link for accurate searches
  • exports - Critical for discovering available files and import paths
  • dependencies/devDependencies - Full ecosystem understanding
  • versions with dates - Historical evolution context
  The 'exports' field is invaluable for GitHub file discovery, showing exact paths before fetching. Always use this tool when a package is identified in search results or user input.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `SEMANTIC CODE DISCOVERY: Search code using advanced boolean operators (AND, OR, NOT). Prioritize intelligent combinations like "logger AND debug NOT test" or "error handling AND typescript".
  Format: "term AND term" language:js path:src. Filters: owner/org/user, repo, extension, filename, language, path, size, limit, match scope. Use for finding actual implementation patterns and code examples.
  CRITICAL: When packages are found in results or from user input, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} to obtain metadata and relevant file paths.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories by name/description. Start shallow and go broad: use topics for exploratory discovery (e.g., topic:["cli","typescript","api"]) to find ecosystem patterns.
  PRIMARY FILTERS work alone: owner, language, stars, topic, forks. SECONDARY FILTERS require a query or primary filter: license, created, archived, includeForks, updated, visibility, match.
  SMART REPOS SEARCH PATTERNS: Use topic:["cli","typescript"] for semantic discovery; stars:">100" for quality; owner:"microsoft" for organization repos. Query supports GitHub syntax: "language:Go OR language:Rust".
  CRITICAL: When finding packages, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} for metadata and repository paths.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Browse repository structure and verify file existence. Use before github_get_file_content to confirm files exist and understand organization, especially when the path is uncertain.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Read file content. This tool REQUIRES exact path verification from ${TOOL_NAMES.GITHUB_GET_CONTENTS} first. If fetching fails, re-check file existence with ${TOOL_NAMES.GITHUB_GET_CONTENTS}.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Find GitHub issues and problems with rich metadata (labels, reactions, comments, state). Discover pain points, feature requests, bug patterns, and community discussions. Filter by state, labels, assignee, or date ranges. Use for understanding project health and common user issues.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Find pull requests and implementations with detailed metadata. Discover how features were implemented, code review patterns, and development workflows. Filter by state, author, reviewer, or merge status. Essential for understanding project development practices.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history. Use for understanding code evolution and development patterns.`,
};
