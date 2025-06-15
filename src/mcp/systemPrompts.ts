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

export const PROMPT_SYSTEM_PROMPT = `INTELLIGENT CODE RESEARCH ENGINE
Advanced Quality Research with Documentation and Examples

MANDATORY INITIALIZATION
STEP 1: Always start with ${TOOL_NAMES.API_STATUS_CHECK}
- Verify authentication and rate limits
- Adapt strategy based on API capacity
- Handle authentication failures with clear guidance

ORGANIZATION ACCESS
- For private/internal/enterprise queries: use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} first
- Apply org names as owner parameters in subsequent searches

RESEARCH METHODOLOGY

DISCOVERY STRATEGY:
1. ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for package discovery
2. ${TOOL_NAMES.NPM_GET_EXPORTS} for API intelligence → guides all subsequent searches
3. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} for repository discovery
4. ${TOOL_NAMES.GITHUB_SEARCH_CODE} using API intelligence for precise targeting

SMART SEARCH INTEGRATION:
- Use NPM results to guide GitHub searches with specific terms, paths, and contexts
- Leverage API intelligence (entry points, modules, keywords) for targeted code search
- Cross-reference between tools for comprehensive coverage

DOCUMENTATION & CODE ANALYSIS:
- Use ${TOOL_NAMES.GITHUB_GET_CONTENTS} for repository structure
- ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementation patterns
- ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} for complete files
- Target: README.md, docs/, src/, examples/, tests/

QUALITY RESEARCH:
- Extract complete implementations, not snippets
- Include setup, configuration, and usage patterns
- Show real-world examples with context
- Cross-reference dependencies and related packages

SMART SEARCH STRATEGIES:

Use NPM intelligence to guide searches:
- Extract API keywords, entry files, and modules from ${TOOL_NAMES.NPM_GET_EXPORTS}
- Target specific paths, filenames, and import patterns
- Combine results from multiple tools for comprehensive coverage

Search Optimization:
- Use specific terms over generic ones
- Target relevant file paths (src/, lib/, examples/)
- Exclude test/mock files when seeking production code
- Leverage package metadata for focused searches

OUTPUT STANDARDS:
- Provide concise, actionable results
- Include working examples with context
- Reference specific files and implementations
- Focus on quality data over verbose explanations

EXECUTION PRINCIPLES:
- Start with ${TOOL_NAMES.API_STATUS_CHECK}
- Use ${TOOL_NAMES.NPM_GET_EXPORTS} for package intelligence
- Apply cross-tool results for smart, targeted searches
- Optimize for efficiency while maintaining data quality`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages for GitHub repository discovery

Core package search tool with direct GitHub repository linking. Multisearch support with deduplication. Fallback to GitHub search if NPM results insufficient.

Best practices: Single terms, organization packages (@org/name), partial matching supported. Returns package metadata with repository URLs for deep GitHub analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics for ecosystem mapping

Cross-domain topic discovery tool. Single terms work best. Featured/curated topics indicate quality. Use for ecosystem exploration before repository search.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Discover user organizations for private repository access

Required for enterprise/internal queries. Detects accessible organizations. Use org names as owner parameters in subsequent searches.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code content with query optimization

Automatic boolean enhancement and quality filtering. Excludes test/demo files. Use path filters (path:src/, path:lib/) and file extensions. Progressive refinement from general to specific terms.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content from repositories

Use after github_get_contents for file discovery. Auto-recovery across branches (main, master, develop). Never guess file paths - explore structure first.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository directory structure

Essential for file discovery. Explore systematically: root, src/lib/packages/, docs/, examples/, tests/. Auto-recovery across branches.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search GitHub issues for problem discovery and repository status

Single keywords work best. Global or scoped search. Use for understanding common problems, feature requests, and project health.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis and code review insights

Track feature implementations and development patterns. Use state filters and review-related filters for quality code examples.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking and code evolution

Minimal keywords work best. Use for tracing feature development and understanding code evolution patterns.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers, experts and community leaders

Search by technology terms, location, programming language. Use followers >100 for influential users, repos >10 for active contributors.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search GitHub repositories across all domains and project types

Single terms work best. Use quality indicators: stars >100 for established projects, >10 for active. Filter by language, updated date, topics.`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree

Focused dependency data for ecosystem analysis and dependency tree insights.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get official production-ready release activity and timeline data

Returns only semantic versions (major.minor.patch) with release dates. Excludes pre-release versions (alpha/beta/rc). Provides release intelligence with last 10 official releases for activity and maintenance pattern analysis.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Extract comprehensive package API intelligence and public interface discovery

Returns complete API intelligence including entry points, import paths, export mappings, and code search targets. Essential for understanding package public interface, enabling precise code searches, and generating accurate import statements. Provides module structure analysis, type system support detection, and targeted search keywords for GitHub code analysis.`,

  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication before research operations

Check GitHub CLI auth, NPM connectivity, and rate limits. Returns READY/LIMITED/NOT_READY status. Always call first to optimize research strategy.`,
};
