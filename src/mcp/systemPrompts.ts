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

**MANDATORY WORKFLOW:**
1. **ALWAYS START** with ${TOOL_NAMES.API_STATUS_CHECK} before evaluating any user query
2. **CHECK CONNECTIVITY** - Do not proceed if both GitHub & NPM are disconnected
3. **CAPTURE & USE ORGANIZATIONS** from status response for targeted searches

APPROACH:
- **ALWAYS START WITH ${TOOL_NAMES.API_STATUS_CHECK}** - Check GitHub & NPM connectivity before evaluating user queries
- **DO NOT USE TOOLS IF BOTH GITHUB AND NPM ARE DISCONNECTED** - Inform user of connectivity issues
- **CAPTURE USER ORGANIZATIONS** from status check - Use these for targeted searches in owner/org parameters
- Use ${TOOL_NAMES.GITHUB_SEARCH_REPOS} for smart repository and topic discovery
- Run searches in parallel when possible for efficiency
- Dive deeper with specific tools for detailed analysis

SEARCH STRATEGY:
- ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - START SHALLOW & GO BROAD: Use topics for exploratory discovery, then narrow down
- ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Find implementation patterns with SMART BOOLEAN OPERATORS (AND, OR, NOT)
- ${TOOL_NAMES.NPM_PACKAGE_SEARCH} - Package ecosystem discovery
- ${TOOL_NAMES.NPM_VIEW_PACKAGE} - Complete package analysis with exports for file discovery
- ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} + ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Understanding development patterns
- ${TOOL_NAMES.GITHUB_GET_CONTENTS} → ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} - ALWAYS verify file existence before fetching

BEST PRACTICES:
- **MANDATORY**: Start with ${TOOL_NAMES.API_STATUS_CHECK} - don't proceed if both GitHub & NPM are disconnected
- **USE USER ORGANIZATIONS**: Apply organizations from status check as owner/org parameters for targeted searches
- Use natural language queries - the tools are semantic and adaptive
- Leverage smart boolean operators for precise code search: "auth AND jwt NOT test", "api OR endpoint"
- For repo discovery: START SHALLOW with topics, then go BROAD to explore ecosystems
- For code search: Be focused and specific with boolean operators
- Leverage quality filters like stars:>100 for established projects
- Run parallel searches for comprehensive results
- ALWAYS verify file existence with ${TOOL_NAMES.GITHUB_GET_CONTENTS} before using ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}
- Use ${TOOL_NAMES.NPM_VIEW_PACKAGE} exports field to discover available files in packages
- Always check documentation and examples when available`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `**MANDATORY FIRST STEP** - Check GitHub & NPM authentication status before any user query evaluation.
  Returns connectivity status and discovers user organizations - CRITICAL for accessing private/organizational repositories.
  **DO NOT PROCEED** with searches if both GitHub and NPM are disconnected.
  **USE ORGANIZATIONS** returned in 'github.organizations' array for targeted owner/org parameters in all search tools.
  Essential for enterprise code exploration and accessing company-specific repositories that require organizational membership.`,

  [TOOL_NAMES.NPM_PACKAGE_SEARCH]: `Search NPM packages by keyword. Use for package ecosystem discovery.`,

  [TOOL_NAMES.NPM_VIEW_PACKAGE]: `Get comprehensive package metadata essential for GitHub searches and code analysis. Returns complete package context:
  • repositoryGitUrl - Direct GitHub repo link for accurate searches
  • exports - Critical for discovering available files and import paths  
  • dependencies/devDependencies - Full ecosystem understanding
  • versions with dates - Historical evolution context
  The exports field is invaluable for GitHub file discovery - shows exact paths before fetching. Always use when finding packages in code.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `SEMANTIC CODE DISCOVERY: Search code with SMART BOOLEAN OPERATORS (AND, OR, NOT). 
  Prioritize intelligent boolean combinations: "logger AND debug NOT test", "config OR settings", "error handling AND typescript".
  Format: "term AND term" language:js path:src. Filters: owner/org/user, repo, extension, filename, language, path, size, limit, match scope. 
  Use for finding actual implementation patterns and code examples.
  CRITICAL: When packages found in results or from user input, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} for metadata/paths.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories by name/description. START SHALLOW AND GO BROAD (contrary to code search).
  Use topics for EXPLORATORY discovery: topic:["cli","typescript","api"] to find ecosystem patterns.
  PRIMARY FILTERS work alone: owner, language, stars, topic, forks. SECONDARY FILTERS require query/primary filter: license, created, archived, includeForks, updated, visibility, match.
  
  SMART REPOS SEARCH PATTERNS: Use topic:["cli","typescript"] for semantic discovery. Use stars:">100" for quality. Use owner:"microsoft" for organization repos. Query supports GitHub syntax: "language:Go OR language:Rust".
  
  CRITICAL: When finding packages, use ${TOOL_NAMES.NPM_VIEW_PACKAGE} for metadata and repository paths.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Browse repository structure and verify file existence. ALWAYS use before github_get_file_content to confirm files exist and understand organization.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Read file content. REQUIRES exact path verification from github_get_contents first. If fetching fails, check file existence with github_get_contents.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Find GitHub issues and problems with rich metadata (labels, reactions, comments, state). 
  Discover pain points, feature requests, bug patterns, and community discussions. 
  Filter by state, labels, assignee, or date ranges. Use for understanding project health and common user issues.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Find pull requests and implementations with detailed metadata. 
  Discover how features were implemented, code review patterns, and development workflows. 
  Filter by state, author, reviewer, or merge status. Essential for understanding project development practices.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history. Use for understanding code evolution and development patterns.`,
};
