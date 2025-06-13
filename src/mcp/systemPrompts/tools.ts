import { TOOL_NAMES } from '../contstants';

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages across all domains. Supports semantic queries and domain-specific search strategies.

SEARCH STRATEGIES:
- Single terms: "visualization", "automation", "analysis"
- Combined concepts: "data-visualization", "workflow-automation"
- Domain-specific filters automatically applied

SEARCH PATTERNS:
- Technology packages: frameworks, libraries, utilities
- Creative packages: design tools, media processing
- Business packages: analytics, automation, productivity
- Educational packages: learning resources, documentation
- Scientific packages: data analysis, visualization, computation

OPTIMIZATION:
- 0 results: broaden terms, try ecosystem exploration
- 1-20 results: ideal scope for analysis
- 100+ results: add specific filters

FALLBACK STRATEGIES:
When insufficient results, automatically tries:
1. Repository search for direct projects
2. Topic analysis for domain terminology
3. Community discovery for experts
4. Content search for implementations`,

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `Analyze package security vulnerabilities, dependency tree, and organizational context.

USAGE: Always call after npm_search_packages for complete assessment.

ANALYSIS INCLUDES:
- Security vulnerabilities and audit results
- Dependency tree and compatibility
- Bundle size impact
- License compatibility
- Organization detection (@company/ packages)

ORGANIZATIONAL CONTEXT: 
- Private packages trigger github_get_user_organizations workflow
- Enterprise package discovery enabled

LIMITATIONS: Some NPM audit failures may occur for specific packages.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics across all domains and disciplines.

SEARCH PATTERNS:
- Single terms: "sustainability", "automation", "creativity"
- Compound concepts: "machine-learning", "user-experience"
- Cross-domain exploration supported

DOMAIN COVERAGE:
- Technology: "ai", "blockchain", "iot", "cybersecurity"
- Creative: "design", "art", "music", "writing"
- Business: "entrepreneurship", "marketing", "finance"
- Academic: "research", "education", "science"
- Social: "community", "activism", "sustainability"

OPTIMIZATION:
- 1-10 topics: ideal for focused analysis
- 10+ topics: rich ecosystem exploration
- Featured/curated topics indicate quality

WORKFLOW:
1. Core topic exploration
2. Related topic discovery
3. Community identification
4. Resource mapping
5. Trend analysis`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Discover user organizations for enterprise/private repository access.

AUTO-TRIGGERS: @organization/ patterns, "internal code", "enterprise setup"

WORKFLOW: 
1. Detect organizational context
2. Match company to organizations
3. Use as 'owner' parameter in subsequent calls
4. Enable private repository access

INTEGRATION: Required first step when private access needed.`,

  [TOOL_NAMES.GITHUB_GET_REPOSITORY]: `Get repository metadata and default branch information.

PURPOSE: Discover default branch and repository metadata to prevent tool failures.

PREREQUISITES: Repository owner/name must be discovered first through:
1. npm_search_packages → npm_get_package (for packages)
2. github_search_topics (for ecosystem discovery)
3. github_search_repositories (last resort)

REQUIRED BEFORE: github_search_code, github_get_contents, github_get_file_content

CRITICAL: Never call with guessed repository names. Always use discovery workflow.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code content with automatic query optimization and domain adaptation.

QUERY OPTIMIZATION:
- Automatic boolean enhancement for better results
- Domain-specific pattern matching
- Quality filtering (excludes test, example, demo files)
- Semantic expansion based on context

DOMAIN PATTERNS:
- Technology: "framework OR library OR tool OR implementation NOT tutorial"
- Research: "study OR analysis OR research NOT example"
- Business: "solution OR strategy OR management NOT demo"
- Creative: "design OR art OR creative NOT template"
- Educational: "learning OR education OR tutorial NOT test"
- Scientific: "data OR analysis OR algorithm NOT mock"

BOOLEAN INTELLIGENCE:
- Coverage: "primary_term OR synonym OR variation"
- Precision: "specific_concept AND context NOT noise"
- Quality: "topic NOT test NOT example NOT demo"

FALLBACK STRATEGIES:
- Term simplification: complex phrases → core concepts
- Semantic broadening: specific → general categories
- Progressive refinement: general → specific based on results`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content from repositories.

WORKFLOW: 
1. Discovery (mandatory)
2. github_get_repository 
3. Find files with github_search_code or github_get_contents
4. Extract with this tool

AUTO-RECOVERY: Tries branches in order: specified → main → master → develop → trunk

ERROR HANDLING: Provides guidance when files don't exist, suggests alternatives

ORGANIZATIONAL CONTEXT: Use github_get_user_organizations for private repositories

CRITICAL: Never guess file paths. Use structure exploration first.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository directory structure.

PREREQUISITES: Must call github_get_repository first for branch discovery.

EXPLORATION STRATEGY:
1. Root analysis
2. Source discovery (src/, lib/, components/)
3. Documentation (docs/, README)
4. Configuration files
5. Examples and tests

AUTO-RECOVERY: Tries branches in order: specified → main → master → develop → trunk`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search GitHub issues for problem discovery and repository status.

SEARCH STRATEGY:
- Start with single keywords: "bug", "feature", "documentation"
- Combine terms if needed: "bug fix", "feature request"
- Never use complex queries

SEARCH MODES:
- Global search (no owner): searches all GitHub repositories
- Scoped search (with owner): targeted within organization

RESULT OPTIMIZATION:
- 0 results: use broader terms
- 1-20 results: ideal scope
- 100+ results: add specific filters

PAGINATION: Limited to --limit parameter only.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis and code review insights.

CORE APPLICATIONS:
- Code review insights
- Feature implementation tracking
- Repository activity assessment

KEY FILTERS:
- State (open/closed)
- Draft (false for completed PRs)
- Author/reviewer information
- Programming language

QUALITY FOCUS: Use review-related filters for thoroughly vetted code examples.

PAGINATION: Limited to --limit parameter only.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking and code evolution.

SEARCH STRATEGY:
- Start minimal: "fix", "feature", "update"
- Add owner/repo for scoped search
- Progressive expansion if needed

LIMITATIONS:
- Large organizations may return org-wide results
- Requires text terms for search
- Limited to --limit parameter

ERROR HANDLING: "Search text required" errors need minimal keywords.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers, experts, and community leaders.

SEARCH METHODOLOGY:
1. Technology terms: "react", "python"
2. Add context: location, experience level
3. Specialized filters

SEARCH MODES:
- Global search: across all GitHub
- Scoped search: within specific organization

KEY FILTERS:
- Type (user/org)
- Location
- Programming language
- Followers (">100" for influential users)
- Repository count (">10" for active contributors)`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search GitHub repositories across all domains and project types.

SEARCH STRATEGIES:
1. Single terms: "visualization", "sustainability", "automation"
2. Domain-specific context filters
3. Quality indicators: star count, activity level
4. Scope management: global vs organizational

PROJECT TYPES:
- Technology: software, tools, frameworks, applications
- Research: academic studies, experiments, methodologies
- Creative: art, design, media projects
- Educational: learning resources, tutorials, courses
- Business: analytics, automation, productivity tools
- Community: open source, collaboration, social impact

OPTIMIZATION:
- 0 results: broader terms, alternative approaches
- 1-20 results: ideal for detailed analysis
- 100+ results: add filters, narrow scope

QUALITY INDICATORS:
- Star count (>100 established, >10 active)
- Recent updates and community engagement
- Documentation quality and project maturity`,

  // NPM focused tools
  [TOOL_NAMES.NPM_GET_REPOSITORY]: `Get package repository URL and basic project information.

OUTPUT: Package name, description, repository URL, homepage (minimal, token-efficient)

USAGE: When you need repository location for GitHub operations.

INTEGRATION: First step before github_get_repository for code exploration.`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree.

OUTPUT: dependencies, devDependencies, resolutions (focused dependency data only)

USAGE: Analyzing package ecosystem and compatibility.

INTEGRATION: Combine with npm_analyze_dependencies for security audit.`,

  [TOOL_NAMES.NPM_GET_BUGS]: `Get bug reporting and issue tracking information.

OUTPUT: Package name and bugs URL (direct access to issue tracker)

USAGE: When users need to report issues or check known problems.

INTEGRATION: Links to github_search_issues for problem discovery.`,

  [TOOL_NAMES.NPM_GET_VERSIONS]: `Get official production-ready semantic versions.

OUTPUT: Official versions (major.minor.patch), latest version, count (excludes alpha/beta/rc)

USAGE: Find stable versions for production deployment, analyze release cadence.

INTEGRATION: Production planning - filters experimental versions for reliable deployment.`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get recent release activity and timeline data.

OUTPUT: Last modified, created date, version count, last 10 releases (focused release intelligence)

USAGE: Track package activity, analyze release frequency, check latest versions.

INTEGRATION: Combine with npm_get_versions for comprehensive version analysis.`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Get available modules and import strategies.

OUTPUT: Export mappings, entry points, submodule paths (complete import guide)

USAGE: Learn import syntax, discover tree-shakable exports, find submodules, optimize bundles.

INTEGRATION: Critical for github_search_code - enables precise code search with accurate imports.`,

  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication before research operations.

PRE-RESEARCH VALIDATION:
- GitHub CLI authentication status
- NPM registry connectivity 
- GitHub API rate limits

HEALTH CHECK:
- Authentication status with username detection
- Network connectivity validation
- Real-time API quota analysis

RESEARCH STRATEGY:
- READY: All systems operational
- LIMITED: Reduced capacity, targeted searches recommended
- NOT_READY: Authentication/quota issues require resolution

API GUIDANCE:
- Code Search < 5: use repository browsing instead
- Search API < 20: focus on specific repositories
- Core API < 200: minimize repository exploration
- NPM disconnected: GitHub-only research mode

FALLBACK RECOMMENDATIONS:
- Authentication issues: step-by-step gh auth login guidance
- NPM problems: alternative research paths
- Rate limit exhaustion: wait times and alternatives
- Network issues: diagnostic commands and troubleshooting

USAGE: Always call first before research sessions to ensure optimal tool usage.`,
};
