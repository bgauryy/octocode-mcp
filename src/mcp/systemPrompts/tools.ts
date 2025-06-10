import { TOOL_NAMES } from '../contstants';

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `**PRIMARY DISCOVERY TOOL** - Main entry point for package and repository discovery.

**WHEN TO USE:** Package discovery by keyword, when user mentions package names, organizational package detection (@company/ scopes).

**SEARCH STRATEGY:**
1. Single terms: "react", "cli", "auth"
2. Combined terms: "react-hooks", "typescript-cli"  
3. Avoid complexity: Complex phrases yield zero results

**ORGANIZATIONAL DETECTION:** @company/ packages → Trigger ${TOOL_NAMES.GITHUB_GET_USER_ORGS}

**RESULT OPTIMIZATION:** 0 results → broader terms, 1-20 IDEAL, 100+ → more specific terms

**INTEGRATION:** ALWAYS chain to ${TOOL_NAMES.NPM_GET_PACKAGE} → ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES}`,

  [TOOL_NAMES.NPM_GET_PACKAGE]: `**Repository mapping** - Transform npm packages into GitHub repositories for code analysis.

**WHEN TO USE:** ALWAYS after ${TOOL_NAMES.NPM_SEARCH_PACKAGES}, user mentions package names, private package detection (@company/).

**WORKFLOW:** Extract repository URL → Parse owner/repo → Detect organizational context → Chain to ${TOOL_NAMES.GITHUB_GET_REPOSITORY} → MANDATORY ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES}

**ORGANIZATIONAL DETECTION:** @company/ scoped packages → Trigger ${TOOL_NAMES.GITHUB_GET_USER_ORGS}

**EXAMPLES:** "react" → github.com/facebook/react, "@wix/package" → Private org detection`,

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `**CRITICAL: Package security analysis** - Essential for package evaluation and organizational detection.

**WHEN TO USE:** ALWAYS after ${TOOL_NAMES.NPM_GET_PACKAGE} for complete assessment.

**ANALYSIS:** Security vulnerabilities, dependency tree, license compatibility, bundle impact, organization detection (@company/).

**ORGANIZATIONAL CONTEXT:** Private packages → Check ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access

**KNOWN LIMITATION:** Some NPM audit failures may occur (package-specific). Bundle analysis and dependency tree remain reliable.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `**FOUNDATION TOOL** - Essential for ecosystem discovery and terminology mapping.

**SEARCH STRATEGY:** Start global, single terms ("react", "typescript"), multi-term sparingly ("react+typescript"), add owner only when needed.

**BEST PRACTICES:** DON'T start with owner (limits discovery), DO start broad, USE single terms mostly.

**RESULT OPTIMIZATION:** 1-10 IDEAL, 10+ add featured/curated filters

**INTEGRATION:** CRITICAL foundation - use before other GitHub tools, after ${TOOL_NAMES.NPM_SEARCH_PACKAGES}`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `**CRITICAL: Private organization discovery** - Essential for company/enterprise repository access.

**AUTO-TRIGGERS:** @wix/, @company/, "I work at [Company]", "internal code", "enterprise setup"

**WORKFLOW:** IMMEDIATE call when organizational context detected → Match company to organizations → Use as 'owner' parameter → Enable private repository access

**INTEGRATION:** MANDATORY first step when private access likely needed`,

  [TOOL_NAMES.GITHUB_GET_REPOSITORY]: `**CRITICAL FIRST STEP** - Required before all GitHub file operations, but ONLY after discovery.

**PURPOSE:** Discover default branch and repository metadata to prevent tool failures.

**MANDATORY PREREQUISITES:** Repository owner/name MUST be discovered first through:
1. ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.NPM_GET_PACKAGE} (for packages)
2. ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} (for ecosystem discovery)  
3. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (last resort)

**REQUIRED BEFORE:** ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.GITHUB_GET_CONTENTS}, ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}

**CRITICAL:** NEVER call with guessed repository names. ALWAYS use discovery workflow first.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `**Precision code search** - Advanced search with automatic repository scoping.

**KEY FEATURES:** Every search includes "repo:owner/repository", smart boolean logic, organizational context.

**BOOLEAN OPERATIONS:** Default AND ("sparse index" = "sparse AND index"), OR ("useState OR useEffect"), NOT ("error NOT test")

**PATH WARNING:** React uses path:packages (NOT path:src). Using path:src on repositories without top-level src returns zero results.

**RESULT OPTIMIZATION:** 1-10 IDEAL, 100+ TOO BROAD

**PAGINATION LIMITATION:** GitHub CLI limited to --limit parameter only (no page navigation).

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_GET_REPOSITORY} for branch discovery`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `**Complete code extraction** - Fetch full working implementations.

**CRITICAL WORKFLOW:** MANDATORY discovery → ${TOOL_NAMES.GITHUB_GET_REPOSITORY} → Find files with ${TOOL_NAMES.GITHUB_SEARCH_CODE} or ${TOOL_NAMES.GITHUB_GET_CONTENTS} → Extract with this tool

**AUTO-RECOVERY:** Specified branch → main → master → develop → trunk → try without ref

**ENHANCED ERROR HANDLING:** Provides detailed guidance when files don't exist, with alternative discovery methods

**ORGANIZATIONAL CONTEXT:** Private repositories → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access

**CRITICAL:** NEVER guess file paths. Use structure exploration or code search first.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `**Repository structure exploration** - Strategic directory navigation.

**CRITICAL:** MANDATORY ${TOOL_NAMES.GITHUB_GET_REPOSITORY} FIRST for branch discovery.

**EXPLORATION:** Root analysis → Source discovery (src/, lib/, components/) → Validation (test/, examples/)

**AUTO-RECOVERY:** Specified branch → main → master → develop → trunk → try without ref`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `**Problem discovery** - Issue search for debugging and repository status.

**SEARCH STRATEGY:** Single keywords ("bug", "feature"), then combine ("bug fix"), never complex.

**SEARCH MODES:** 
- Global search (no owner): Searches issues across all GitHub repositories
- Scoped search (with owner): Targeted search within specific organization/user

**PROBLEM HIERARCHY:** "React auth JWT error" → "authentication" → "React" → "token expired" → "JWT"

**PAGINATION LIMITATION:** GitHub CLI limited to --limit parameter only (no page navigation).

**RESULT TARGETS:** 0 → broader terms, 1-20 IDEAL, 100+ → add specific terms/filters`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `**Implementation analysis** - PR search for patterns and repository status.

**CORE APPLICATIONS:** Code review insights, feature implementation tracking, repository activity assessment.

**KEY FILTERS:** State (open/closed), draft (false for completed), author/reviewer, language

**PAGINATION LIMITATION:** GitHub CLI limited to --limit parameter only (no page navigation).

**QUALITY FOCUS:** Use review-related filters for thoroughly vetted code examples`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `**Development history** - Track code evolution and repository status.

**SEARCH STRATEGY:** Start minimal ("fix", "feature", "update") with owner/repo, progressive expansion.

**LIMITATIONS:** Large organizations may return org-wide results, requires text terms. GitHub CLI limited to --limit parameter only (no page navigation).

**ERROR HANDLING:** "Search text required" → Use minimal keywords ("fix", "update")`,

  [TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS]: `**Community knowledge** - Access discussions for tutorials and solutions.

**DISCOVERY WORKFLOW:** ${TOOL_NAMES.NPM_GET_PACKAGE} → get repo URL → Search discussions

**SEARCH STRATEGY:** Start simple ("help", "tutorial"), build complexity ("help deployment"), avoid full phrases.

**KEY FILTERS:** Answered: true for validated solutions, category filters, maintainer participation`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `**Developer discovery** - Find experts and community leaders.

**SEARCH METHODOLOGY:** Technology terms ("react", "python") → add context (location, experience) → specialized search.

**SEARCH MODES:** 
- Global search (no owner): Searches users/orgs across all GitHub
- Scoped search (with owner): Targeted search within specific organization context

**KEY FILTERS:** Type (user/org), location, language, followers (">100" influential), repos (">10" active)

**DISCOVERY PATTERNS:** Technology experts, local developers, open source contributors, industry leaders`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `**FALLBACK TOOL** - Repository search with smart query handling.

**MANDATORY PREREQUISITES:** ${TOOL_NAMES.NPM_SEARCH_PACKAGES} and ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} must fail first.

**KEY FEATURES:** Smart multi-term handling, filter validation, fallback strategies, global & scoped searches.

**BEST PRACTICES:** Single terms work best ("react", "typescript"), owner is OPTIONAL (leave empty for global searches), validated combinations (microsoft + typescript ✅), progressive refinement.

**SEARCH MODES:** 
- Global search (no owner): Searches across all GitHub repositories
- Scoped search (with owner): Targeted search within specific organization/user

**MULTI-TERM HANDLING:** "react hooks auth" → structured workflow, primary term extraction, workflow guidance.

**KNOWN LIMITATIONS:** Multi-term repository search breaks down (use NPM→Topics workflow instead). GitHub CLI limited to --limit parameter only (no page navigation).

**CRITICAL:** ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} workflow provides superior results for 95% of use cases`,

  [TOOL_NAMES.NPM_GET_PACKAGE_STATS]: `**Package maturity analysis** - Lifecycle assessment for package evaluation.

**WHEN TO USE:** ALWAYS after ${TOOL_NAMES.NPM_GET_PACKAGE} for complete assessment.

**ANALYSIS:** Release timeline, version history, distribution tags, maintenance indicators, organizational context.

**MATURITY INDICATORS:** Stable (regular releases, clear versioning), active development (frequent releases, beta/alpha), abandoned (long gaps, no activity).

**INTEGRATION:** MANDATORY with ${TOOL_NAMES.NPM_GET_PACKAGE}, combine with ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES}`,
};
