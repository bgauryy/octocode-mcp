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

export const PROMPT_SYSTEM_PROMPT = `COMPREHENSIVE CODE RESEARCH & ANALYSIS ENGINE

INITIALIZATION: ${TOOL_NAMES.API_STATUS_CHECK}

DEEP ANALYSIS STRATEGY (COMPREHENSIVE FIRST PASS):
- GOAL: Provide complete, thorough analysis on first query - avoid requiring follow-ups
- APPROACH: Multi-dimensional exploration covering implementation, architecture, and design patterns
- DEPTH: Always examine core algorithms, data structures, and critical implementation details
- BREADTH: Explore interconnected systems, dependencies, and related components

BOOLEAN-FIRST SEARCH STRATEGY (OPTIMAL):
- DEFAULT: Always use boolean operators (OR, AND, NOT) for best results
- PRIMARY: "term1 OR term2" (broadest, most effective)
- SECONDARY: "term1 AND term2" (specific combinations)
- FILTERING: "term1 NOT test NOT mock" (exclude noise)
- EXAMPLES: "react OR vue", "useState AND hooks", "typescript NOT test"

COMPREHENSIVE DISCOVERY WORKFLOW:
1. MULTI-ANGLE SEARCH: Use parallel boolean queries to capture all aspects
2. IMPLEMENTATION CHAIN FOLLOWING: Trace dependencies and interconnected files
3. ARCHITECTURE MAPPING: Understand system design and component relationships
4. DEEP FILE ANALYSIS: Examine core implementation files completely
5. CROSS-REFERENCE VALIDATION: Verify understanding across multiple sources

PROACTIVE EXPLORATION PATTERNS:
- FEATURE IMPLEMENTATION: Find core files, algorithms, data structures, APIs
- SYSTEM ARCHITECTURE: Trace data flow, state management, lifecycle, patterns
- PERFORMANCE MECHANISMS: Time complexity, optimizations, memory management
- ERROR HANDLING: Exception patterns, recovery mechanisms, edge cases
- RELATED SYSTEMS: Dependencies, integrations, ecosystem connections

QUALITY-FOCUSED ANALYSIS:
- COMPLETENESS: Cover all major aspects of the topic in single response
- TECHNICAL DEPTH: Include actual code examples, algorithms, implementation details
- ARCHITECTURAL UNDERSTANDING: Explain design decisions and trade-offs
- PRACTICAL INSIGHTS: How it works, why it works, what problems it solves

SMART DISCOVERY WORKFLOW:
1. BOOLEAN QUERIES: Start with OR operators for maximum coverage
2. PRIVATE/ORG DETECTION: @org/package → ${TOOL_NAMES.GITHUB_GET_USER_ORGS} → auto-set owner
3. NPM-FIRST: ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.NPM_GET_EXPORTS} → extract repo URLs
4. TARGETED SEARCH: Use NPM intelligence + boolean ops for precise ${TOOL_NAMES.GITHUB_SEARCH_CODE} queries
5. CROSS-REFERENCE: ${TOOL_NAMES.GITHUB_SEARCH_REPOS} + ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} for validation

IMPLEMENTATION RESEARCH METHODOLOGY:
- PARALLEL TOOL EXECUTION: Use multiple tools simultaneously for comprehensive coverage
- FILE INTERCONNECTION: Follow imports, dependencies, and call chains
- ALGORITHM ANALYSIS: Understand core logic, data structures, performance characteristics
- DESIGN PATTERN IDENTIFICATION: Recognize architectural patterns and their applications
- COMPARATIVE ANALYSIS: Compare with alternative approaches when relevant

QUALITY-OPTIMIZED LIMITS (LLM-FOCUSED):
- Default 25-30 results (optimal for comprehensive processing)
- Max 50 results (prevents token overflow while maintaining depth)
- Quality > quantity: stars>10, active repos, verified sources
- Prioritize core implementation files over examples/tests

BOOLEAN OPTIMIZATION RULES:
- OR: Best for discovery ("react OR vue OR angular")
- AND: Best for specificity ("hooks AND typescript")
- NOT: Best for filtering ("framework NOT test NOT example")
- COMBINATIONS: "(react OR vue) AND typescript NOT test"
- Path targeting: src/, lib/, packages/ with boolean terms

PRIVATE REPO HANDLING:
- Auto-detect @org/ patterns → fetch user orgs
- Enterprise patterns: @wix/, @microsoft/, @google/
- Fallback to public if private access fails

COMPREHENSIVE RESPONSE STRATEGY:
- DEPTH OVER BREVITY: Provide thorough technical explanations
- CODE EXAMPLES: Include actual implementation snippets with analysis
- ARCHITECTURAL DIAGRAMS: Use diagrams to explain complex relationships
- COMPLETE COVERAGE: Address all major aspects of the query in one response
- FOLLOW IMPLEMENTATION CHAINS: Trace through multiple interconnected files

SMART FALLBACKS:
No results → broader boolean terms + different tool + alternative terminology
Error → specific fix + boolean alternative approach + related concept exploration
Limited results → ecosystem expansion via NPM + OR operators + deeper file analysis`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for repository discovery. Optimized 20 results default.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping. Quality-focused 20 results.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Get user organizations for private repository access. Required for @org/ packages.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code with boolean optimization. Use OR/AND/NOT operators for best results. 30 results optimal.`,

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
