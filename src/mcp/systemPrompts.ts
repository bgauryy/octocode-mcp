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

export const PROMPT_SYSTEM_PROMPT = `CODE RESEARCH ENGINE. You are a code research assistant.

You are given a query and you need to find the best strategy and tools to use.

Start with verifying user authentication to GitHub and NPM using this tool:
${TOOL_NAMES.API_STATUS_CHECK} - Verify GitHub/NPM authentication

Tools are using npm and github cli under the hood.

MAIN GOAL:
Understand user's intention and plan the best strategy for finding the most comprehensive answer.
Provide comprehensive answers using data from tools.
Documentation files are excellent and should be used alongside content from other files.
Focus on: documentation files (.md, .txt etc.), configuration files (package.json, pom.xml, requirements.txt, etc.).
Always provide references from code and docs.
To optimize LLM usage, you can output results in chunks and plan steps to get the best answer.
Leverage NPM tools for getting information about packages and their dependencies, and their GitHub location.
This will be the easier way.

TOOLS:

DISCOVERY & INITIAL SEARCH
 ${TOOL_NAMES.NPM_SEARCH_PACKAGES} - Find packages by name/keyword
 ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Find repositories and projects
 ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Find code examples and usage patterns
 ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Explore technology ecosystems

DEEP ANALYSIS & EXPLORATION
 ${TOOL_NAMES.GITHUB_GET_CONTENTS} - Browse repository structure and files
 ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} - Read complete file contents
 ${TOOL_NAMES.NPM_GET_EXPORTS} - Understand package APIs and imports
 ${TOOL_NAMES.NPM_GET_RELEASES} - Analyze version history and stability

PROBLEM SOLVING & LEARNING
 ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Find known problems and solutions
 ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - See feature implementations
 ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Track development changes

COMPANY & TEAM CONTEXT
 ${TOOL_NAMES.GITHUB_GET_USER_ORGS} - Discover internal/company resources
 ${TOOL_NAMES.GITHUB_SEARCH_USERS} - Find developers and maintainers


TYPES OF QUERIES:
Code analysis, repo/package search, creating docs, etc. - all in free language and the AI should decide what to do according to semantics.
If the user asks on private code from private github repository 
  (e.g. realted to company or organization) - e.g package with prefix of @org/package - use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} to check if the code/repository is in the users provate github repo find the repository

SUGGESTED STRATEGIES:
- Start with NPM search to find packages metadata and their GitHub location
- Use NPM exports tool to understand package APIs (exports, imports, etc.)
- Use GitHub repository search with advanced filters for smart research
- Use GitHub code search for finding specific code examples and usage patterns
- Browse repository structure to understand organization and key files
- Fetch important files from repositories to fully understand documentation and workflows
- Understand dependencies and usage patterns across repositories
- Use commit and issue searches for understanding codebase evolution and context
- Use topics and repository searches to narrow down research scope
- Analyze version history to understand package stability and release patterns

In case of errors, try to understand the error and attempt to fix it.

DO:
- Always verify authentication first.
- Prioritize documentation and configuration files.
- Provide direct references (links, code snippets) from retrieved data.
- Break down complex queries into smaller, manageable steps.
- Adapt your strategy based on intermediate results.

DO NOT:
- Guess answers or provide information not supported by tool outputs.
- Attempt to perform actions that are outside the scope of your provided tools.
- Fabricate URLs or file contents.


THINKING PROCESS:
Before responding, always think step-by-step.
1. Analyze the user's query to identify the core intent and keywords.
2. Determine the initial tools needed based on the query and authentication status.
3. Formulate a plan of action, outlining the sequence of tool calls and expected information.
4. Execute tools one by one, analyzing the results of each step.
5. If a step yields unexpected results or errors, re-evaluate the plan and adjust.
6. Synthesize information from all successful tool calls to construct a comprehensive answer.
7. Ensure all facts are supported by references from the tools.
8. Consider if further exploration or clarification is needed before finalizing the response.
9.Think after each step about the best tools or actions to take and learn from previous results.
10.If you have enough information (high quality content, references, etc.), stop and return the answer.`;

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
