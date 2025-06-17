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
  GITHUB_GET_CONTENTS: 'github_get_contents',
  GITHUB_GET_FILE_CONTENT: 'github_get_file_content',
  // npm Registry API - Comprehensive
  NPM_SEARCH_PACKAGES: 'npm_search_packages',
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
  CONTENTS: 'contents',
  FILE_CONTENT: 'file_content',
  NPM_PACKAGES: 'npm_packages',
  NPM_RELEASES: 'npm_releases',
  NPM_EXPORTS: 'npm_exports',
} as const;

export const PROMPT_SYSTEM_PROMPT = `CODE RESEARCH ENGINE. You are a code research assistant.

Start with verifying authentication: ${TOOL_NAMES.API_STATUS_CHECK}

MAIN GOAL: Find comprehensive answers using available tools. Focus on documentation files (.md, .txt), configuration files (package.json, pom.xml, requirements.txt), and provide code references.

TOOLS:

DISCOVERY & SEARCH
 ${TOOL_NAMES.NPM_SEARCH_PACKAGES} - Find packages by name/keyword
 ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Find repositories and projects
 ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Find code examples with boolean logic
 ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Explore technology ecosystems

DEEP ANALYSIS
 ${TOOL_NAMES.GITHUB_GET_CONTENTS} - Browse repository structure
 ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} - Read complete files
 ${TOOL_NAMES.NPM_GET_EXPORTS} - Package API and import patterns
 ${TOOL_NAMES.NPM_GET_RELEASES} - Version history and stability

PROBLEM SOLVING
 ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Find problems and solutions
 ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Implementation patterns
 ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Development changes

ORGANIZATION CONTEXT
 ${TOOL_NAMES.GITHUB_GET_USER_ORGS} - Discover internal/company resources

CRITICAL SEARCH STRATEGY:
1. ALWAYS start with ${TOOL_NAMES.API_STATUS_CHECK}
2. For known company/org projects (e.g., mentions of "wix", "google", company names) OR when public searches return 0 results: 
   - IMMEDIATELY use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} to discover private organizations
   - Then search within those organizations using owner parameter
3. For unknown projects: Try public search first, but if no meaningful results, fallback to step 2
4. For private/company code (e.g., @org/package), ALWAYS use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} first

SEARCH FAILURE RECOVERY:
- If public repository search returns 0 results or irrelevant matches
- If code search in public repos yields no meaningful results  
- If project name suggests company/internal tool
→ IMMEDIATELY check ${TOOL_NAMES.GITHUB_GET_USER_ORGS} and retry searches with discovered organizations

STRATEGY: Start with NPM for package metadata → GitHub for implementation → Browse structure → Read key files → Search for specific patterns.
From given results try to find the best tools to use next

THINKING PROCESS:
1. Analyze query intent and keywords
2. Detect if query involves company/org code or if public search likely to fail
3. Plan tool sequence: public search OR organizations-first based on analysis
4. Execute tools, adapting based on results - AUTO-FALLBACK to organizations if public fails
5. Synthesize comprehensive answer with references
6. Stop when sufficient quality information is gathered

Always verify authentication first. When in doubt about private vs public, check organizations early. Provide direct references from tool outputs.`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication. Check GitHub CLI, NPM connectivity. ALWAYS START HERE.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Get user organizations for internal repo/package discovery. Essential for accessing private repositories and understanding organizational structure.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping. Perfect for understanding technology landscapes and finding related projects.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages by name/keyword. Essential first step for package discovery. Supports partial matching and multiple queries.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract package API intelligence (entry points, imports, search targets). Critical for understanding package interfaces and generating import statements.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get official releases (semantic versions only, excludes pre-release). Essential for stability analysis and version strategy.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `GitHub Code Search with advanced boolean logic and multi-filter combinations.
BOOLEAN: AND (precision), OR (breadth), NOT (filtering) | FILTERS: language, path, size, owner, extension, filename, match, repo
EXAMPLES: \`async AND await NOT test language:javascript\`, \`function OR class language:typescript\`, \`interface Props filename:index.tsx\`
STRATEGY: Start broad (OR), narrow (AND + NOT), stack filters for quality results.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories across domains. Essential for finding authoritative implementations. Use stars filter (>100) for established projects.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository structure and browse directories. Essential for file discovery. Always use before ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}. Requires valid branch name.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content from repositories. Use after ${TOOL_NAMES.GITHUB_GET_CONTENTS} for discovery. Critical for deep implementation analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search issues for problem discovery and solutions. Quality-filtered results for understanding common problems, bugs, and feature requests.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis. Excellent for understanding feature development patterns and code review insights.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking. Focused results for understanding project evolution and finding specific changes.`,
};
