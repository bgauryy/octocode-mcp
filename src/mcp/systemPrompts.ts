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

  NPM_GET_RELEASES: 'npm_get_releases',
  NPM_GET_EXPORTS: 'npm_get_exports',
};

export const SEARCH_TYPES = {
  API_STATUS: 'api_status',
  ORGANIZATIONS: 'organizations',
  CODE: 'code',
  REPOSITORIES: 'repositories',
  COMMITS: 'commits',
  ISSUES: 'issues',
  PULL_REQUESTS: 'prs',
  TOPICS: 'topics',
  USERS: 'users',
  CONTENTS: 'contents',
  FILE_CONTENT: 'file_content',
  NPM_PACKAGES: 'npm_packages',

  NPM_RELEASES: 'npm_releases',
  NPM_EXPORTS: 'npm_exports',
} as const;

export const PROMPT_SYSTEM_PROMPT = `CODE RESEARCH ENGINE

Start with veryfing users authentication to GitHub and NPM using ${TOOL_NAMES.API_STATUS_CHECK}

Your task is to understand users query and find the best strategy and tools to use.
Tools are using npm and github cli under the hood.

Understand  users intention and plan the best strategy to use.

Tools by Usage:

**DISCOVERY & INITIAL SEARCH:**
• ${TOOL_NAMES.NPM_SEARCH_PACKAGES} - Find packages by name/keyword
• ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Find repositories and projects
• ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Find code examples and usage patterns
• ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Explore technology ecosystems

**DEEP ANALYSIS & EXPLORATION:**
• ${TOOL_NAMES.GITHUB_GET_CONTENTS} - Browse repository structure and files
• ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} - Read complete file contents
• ${TOOL_NAMES.NPM_GET_EXPORTS} - Understand package APIs and imports
• ${TOOL_NAMES.NPM_GET_RELEASES} - Analyze version history and stability

**PROBLEM SOLVING & LEARNING:**
• ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Find known problems and solutions
• ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - See feature implementations
• ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Track development changes

**COMPANY & TEAM CONTEXT:**
• ${TOOL_NAMES.GITHUB_GET_USER_ORGS} - Discover internal/company resources
• ${TOOL_NAMES.GITHUB_SEARCH_USERS} - Find developers and maintainers

**SYSTEM & SETUP:**
• ${TOOL_NAMES.API_STATUS_CHECK} - Verify GitHub/NPM authentication

Types of queries:
1. Code analysis
2. Search for a package / project / repository / organization
3. Usage question (e.g. how to use httpClient)

Be smart and use tools to get the best results
thikn after each step what is the best tools or action to take`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication. Check GitHub CLI, NPM connectivity. ALWAYS START HERE.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Get user organizations for internal repo/package discovery. Auto-detect @org/ patterns, enterprise analysis, private repository access. Use when user wants discovery of internal/company resources.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping. 20 quality results. Critical for understanding technology landscapes.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for repository discovery. Default 20 optimized results. Essential first step for modern development analysis.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract package API intelligence (entry points, imports, search targets). Vital for understanding interfaces & usage patterns.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get production releases (semantic versions only, excludes pre-release). Important for stability and version strategy analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `GitHub Code Search (Legacy API via CLI)

Advanced boolean logic + multi-filter combinations for quality code discovery through GitHub CLI.

BOOLEAN: AND (precision), OR (breadth), NOT (filtering) | FILTERS: language, path, size, owner, extension (stackable)

EXAMPLES:
- \`async AND await NOT test language:javascript path:src size:1000..5000\` — quality async code
- \`function OR class OR interface language:typescript extension:ts\` — TypeScript definitions  
- \`config NOT debug NOT test extension:json path:src\` — production configs

STRATEGY: Start broad (OR), narrow (AND + NOT), stack filters for quality data
LIMITATIONS: No parentheses, <384KB files, default branch only, must include search terms with qualifiers

Returns: code snippets, file paths, repository context, GitHub links.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories across domains. 25 quality results. Essential for finding authoritative implementations.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository structure. Essential for file discovery and navigation. Prioritize configuration files (package.json, pom.xml, requirements.txt) for dependency and architecture analysis. Always use before ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content. Use after ${TOOL_NAMES.GITHUB_GET_CONTENTS} for discovery. Critical for deep implementation analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search issues for problem discovery. Quality-filtered 25 results. Valuable for understanding common problems and solutions.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis. 25 curated results. Excellent for understanding feature development patterns.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking. 25 focused results. Useful for understanding evolution and key changes.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers and experts. 25 quality profiles. Helpful for identifying key contributors and maintainers.`,
};
