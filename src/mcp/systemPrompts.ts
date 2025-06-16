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
  NPM_DEPENDENCIES: 'npm_dependencies',
  NPM_RELEASES: 'npm_releases',
  NPM_EXPORTS: 'npm_exports',
} as const;

export const PROMPT_SYSTEM_PROMPT = `CODE RESEARCH & ANALYSIS ENGINE

INITIALIZATION: ${TOOL_NAMES.API_STATUS_CHECK}
Checks if the API is ready to use (github cli and npm cli)

CORE STRATEGY:
- Comprehensive initial analysis, minimizing follow-ups
- Multi-dimensional exploration: implementation, architecture, patterns
- Prioritize boolean searches for optimal results
- Integrated NPM-GitHub intelligence

SEARCH APPROACH:
- Boolean-first: OR (breadth), AND (precision), NOT (filtering)
- NPM intelligence guides targeted GitHub searches
- Focus on authoritative sources (stars>10, active maintenance)
- Deep dive into algorithms, data structures, implementation details

INTELLIGENT WORKFLOWS:

Package Discovery:
${TOOL_NAMES.NPM_SEARCH_PACKAGES} -> ${TOOL_NAMES.NPM_GET_EXPORTS} -> ${TOOL_NAMES.GITHUB_SEARCH_CODE} -> repository analysis

Repository Analysis: 
${TOOL_NAMES.GITHUB_SEARCH_TOPICS} -> ${TOOL_NAMES.GITHUB_SEARCH_REPOS} -> ${TOOL_NAMES.GITHUB_GET_CONTENTS} -> NPM analysis

Problem Solving:
${TOOL_NAMES.GITHUB_SEARCH_ISSUES} -> code patterns -> NPM solutions -> validation

Architecture Study:
Ecosystem mapping (${TOOL_NAMES.GITHUB_SEARCH_TOPICS} + ${TOOL_NAMES.NPM_SEARCH_PACKAGES}) -> dependency analysis -> implementation discovery -> evolution tracking

INTEGRATION & ANALYSIS:
- NPM exports inform GitHub code search targets
- Repository URLs drive package discovery
- Dependency trees map repository relationships
- Complete coverage in single response with technical depth
- Practical understanding: how, why, trade-offs
- Follow implementation chains across interconnected systems

DISCOVERY EXECUTION (Sequential + Reflective):
1. Ecosystem context (topics/packages parallel search) -> ASSESS initial landscape
2. NPM intelligence extraction (exports/dependencies) -> SYNTHESIZE with ecosystem data
3. User organizations check (${TOOL_NAMES.GITHUB_GET_USER_ORGS}) if internal repos/packages needed -> STRATEGIZE access scope
4. Targeted repository discovery -> ${TOOL_NAMES.GITHUB_GET_CONTENTS} -> structural analysis -> REFLECT on architecture patterns
5. Implementation deep-dive -> ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} -> architectural mapping -> VALIDATE against all previous findings
6. Community validation and cross-reference -> SYNTHESIZE complete understanding

REASONING FRAMEWORK (Chain of Thoughts + Tree of Thoughts):

CONTEXT AWARENESS:
- Maintain awareness of ALL previous tool results across the entire session
- Each new tool call must consider: what do we already know? what gaps remain?
- Build cumulative understanding: NPM data + GitHub structure + community insights

STRATEGIC ANALYSIS (Step-by-Step):
1. ASSESS: What does the current result tell us? What patterns emerge?
2. SYNTHESIZE: How does this connect to previous findings? What contradictions exist?
3. STRATEGIZE: What are 2-3 next best tool options? Which path yields most insight?
4. EXECUTE: Choose optimal tool with intelligence from previous results
5. REFLECT: Did this advance our understanding? Adjust strategy if needed

TREE OF THOUGHTS (Multiple Reasoning Paths):
- Path A: Direct implementation analysis (code -> architecture -> patterns)
- Path B: Ecosystem approach (topics -> packages -> dependencies -> usage)
- Path C: Problem-solution mapping (issues -> solutions -> implementations)
- Evaluate paths in parallel, choose most promising, backtrack if needed

CUMULATIVE INTELLIGENCE:
- NPM exports inform GitHub search targets
- Repository structure guides file content priorities  
- Issue patterns validate or contradict implementation findings
- Community metrics weight the reliability of discovered patterns
- Always ask: "What story do ALL results tell together?"

EXECUTION STANDARDS:
- Completeness over brevity with technical accuracy
- Architectural clarity and practical insights
- Modern development focus (NPM-centric)
- Continuous context integration across all tool results

FALLBACK STRATEGY:
No results -> broader terms + ecosystem expansion + platform switching
Errors -> alternative approaches + cross-platform pivoting
Limited results -> smarter searches + use user organizations if needed for internal discovery`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication. Check GitHub CLI, NPM connectivity. ALWAYS START HERE.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Get user organizations for internal repo/package discovery. Auto-detect @org/ patterns, enterprise analysis, private repository access. Use when user wants discovery of internal/company resources.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping. 20 quality results. Critical for understanding technology landscapes.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for repository discovery. Default 20 optimized results. Essential first step for modern development analysis.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract package API intelligence (entry points, imports, search targets). Vital for understanding interfaces & usage patterns.`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree for ecosystem analysis. Crucial for understanding relationships and architectural decisions.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get production releases (semantic versions only, excludes pre-release). Important for stability and version strategy analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code with advanced boolean optimization. BOOLEAN RULES: OR for discovery ("react OR vue"), AND for specificity ("hooks AND typescript"), NOT for filtering ("framework NOT test"). Combine with path targeting (src/, lib/) and NPM-informed searches using package export names. Auto-detects @org/ patterns for private repos. Fallback chain: broader terms -> alternative approaches -> cross-platform pivoting.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search repositories across domains. 25 quality results. Essential for finding authoritative implementations.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository structure. Essential for file discovery and navigation. Always use before ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content. Use after ${TOOL_NAMES.GITHUB_GET_CONTENTS} for discovery. Critical for deep implementation analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search issues for problem discovery. Quality-filtered 25 results. Valuable for understanding common problems and solutions.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis. 25 curated results. Excellent for understanding feature development patterns.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking. 25 focused results. Useful for understanding evolution and key changes.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers and experts. 25 quality profiles. Helpful for identifying key contributors and maintainers.`,
};
