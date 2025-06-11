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

**NPM SEARCH FALLBACK STRATEGY:** When NPM search fails to find packages:
1. ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} - Search for related ecosystem terms and technologies
2. ${TOOL_NAMES.GITHUB_SEARCH_REPOS} - Search for repositories that might contain packages
3. ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Search for package.json files with related names
4. ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Search commit messages for package development references
5. ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Search PR titles/descriptions for package mentions
6. ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Search issues for package discussions and problems

**INTEGRATION:** ALWAYS chain to focused NPM tools → ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES}`,

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `**CRITICAL: Package security analysis** - Essential for package evaluation and organizational detection.

**WHEN TO USE:** ALWAYS after ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for complete assessment.

**ANALYSIS:** Security vulnerabilities, dependency tree, license compatibility, bundle impact, organization detection (@company/).

**ORGANIZATIONAL CONTEXT:** Private packages → Check ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access

**KNOWN LIMITATION:** Some NPM audit failures may occur (package-specific). Bundle analysis and dependency tree remain reliable.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `**FOUNDATION TOOL** - Essential for ecosystem discovery and terminology mapping.

**🎯 CRITICAL: SINGLE-TERM STRATEGY (EVIDENCE-BASED)**
✅ PROVEN EFFECTIVE: Single terms ("mcp" → 570 results, "langchain" → 98 results)
❌ PROVEN FAILURE: Multi-terms ("mcp model-context-protocol" → 0 results)

**SEARCH STRATEGY:** 
1. **PRIMARY: Single terms ONLY** ("react", "mcp", "typescript", "langchain")
2. **SECONDARY: Hyphenated compounds** ("model-context-protocol", "next.js")
3. **NEVER: Multi-word phrases** (avoid "react typescript", "mcp server tools")

**PROGRESSIVE DISCOVERY WORKFLOW:**
1. Start with core term: "mcp" → get ecosystem overview
2. Refine with specific variations: "model-context-protocol", "mcp-server"
3. Use results to guide repository search
4. Apply owner filters only after initial discovery

**BEST PRACTICES:** 
- DON'T start with owner (limits discovery)
- DO start broad with single terms
- NEVER combine multiple concepts in one search
- USE sequential single-term searches for comprehensive coverage

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

**ANTI-HALLUCINATION SAFEGUARDS:**
- 🚨 NEVER search for overly specific function names without verification
- 🔍 DISCOVERY FIRST: Use broad terms ("function", "class", "export") then narrow down
- 📝 PATTERN DETECTION: Long camelCase names (>20 chars) may not exist
- ⚠️ COMPOUND PATTERNS: "performSomethingOnSomething" patterns often hallucinated
- 💡 SAFER APPROACH: "function.*keyword" finds real implementations

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

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `**Developer discovery** - Find experts and community leaders.

**SEARCH METHODOLOGY:** Technology terms ("react", "python") → add context (location, experience) → specialized search.

**SEARCH MODES:** 
- Global search (no owner): Searches users/orgs across all GitHub
- Scoped search (with owner): Targeted search within specific organization context

**KEY FILTERS:** Type (user/org), location, language, followers (">100" influential), repos (">10" active)

**DISCOVERY PATTERNS:** Technology experts, local developers, open source contributors, industry leaders`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `**FALLBACK TOOL** - Repository search with smart query handling.

**MANDATORY PREREQUISITES:** ${TOOL_NAMES.NPM_SEARCH_PACKAGES} and ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} must fail first FOR PUBLIC PACKAGES. For ORGANIZATIONAL searches (when user works at company), use immediately after ${TOOL_NAMES.GITHUB_GET_USER_ORGS}.

**KEY FEATURES:** Smart multi-term handling, filter validation, fallback strategies, global & scoped searches.

**🎯 CRITICAL: SINGLE-TERM STRATEGY (EVIDENCE-BASED)**
✅ PROVEN EFFECTIVE: Single terms work best ("react", "typescript")
❌ PROVEN FAILURE: Multi-term queries often return 0 results or fall back to single terms

**BEST PRACTICES:** Single terms ONLY ("react", "typescript"), owner is OPTIONAL (leave empty for global searches), avoid multi-term combinations, progressive refinement through sequential searches.

**SEARCH MODES:** 
- Global search (no owner): Searches across all GitHub repositories
- Scoped search (with owner): Targeted search within specific organization/user

**MULTI-TERM HANDLING:** "react hooks auth" → structured workflow, primary term extraction, workflow guidance.

**ORGANIZATIONAL FALLBACK STRATEGY:** When repository search fails within organization:
1. ${TOOL_NAMES.GITHUB_SEARCH_CODE} - Search for project name in code files
2. ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} - Search commit messages for project references  
3. ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} - Search PR titles/descriptions for project mentions
4. ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} - Search issues for project discussions

**KNOWN LIMITATIONS:** Multi-term repository search breaks down (use NPM→Topics workflow for PUBLIC packages, use CODE→COMMITS→PRS workflow for INTERNAL projects). GitHub CLI limited to --limit parameter only (no page navigation).

**CRITICAL:** For PUBLIC packages: ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} workflow provides superior results. For INTERNAL/ORGANIZATIONAL projects: Direct code/commits/PRs search provides better discovery.`,

  // Focused NPM tools for minimal token usage
  [TOOL_NAMES.NPM_GET_REPOSITORY]: `**Repository discovery** - Extract GitHub repository URL and project description.

**MINIMAL OUTPUT:** Package name, description, repository URL, homepage - optimized for token efficiency.

**WHEN TO USE:** When you only need repository location for GitHub operations.

**INTEGRATION:** Perfect first step → ${TOOL_NAMES.GITHUB_GET_REPOSITORY} → Code exploration`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `**Dependency analysis** - Extract package dependencies tree.

**MINIMAL OUTPUT:** Dependencies, devDependencies, resolutions - focused dependency data only.

**WHEN TO USE:** When analyzing package ecosystem and compatibility.

**INTEGRATION:** Combine with ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES} for security audit`,

  [TOOL_NAMES.NPM_GET_BUGS]: `**Issue tracking** - Extract bug reporting information.

**MINIMAL OUTPUT:** Package name and bugs URL - direct access to issue tracker.

**WHEN TO USE:** When users need to report issues or check known problems.

**INTEGRATION:** Links to ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} for problem discovery`,

  [TOOL_NAMES.NPM_GET_README]: `**Documentation access** - Extract README filename information.

**MINIMAL OUTPUT:** Package name and readme filename - efficient documentation lookup.

**WHEN TO USE:** When users need documentation without full package metadata.

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} for full README content`,

  [TOOL_NAMES.NPM_GET_VERSIONS]: `**Official version tracking** - Extract production-ready semantic versions only.

**MINIMAL OUTPUT:** Official versions (major.minor.patch format), latest version, count - excludes alpha/beta/rc versions.

**WHEN TO USE:** Find stable versions for production deployment, analyze release cadence of stable releases.

**INTEGRATION:** Perfect for production planning - filters out experimental versions for reliable deployment decisions`,

  [TOOL_NAMES.NPM_GET_AUTHOR]: `**Maintainer information** - Extract author and maintainer details.

**MINIMAL OUTPUT:** Author and maintainers list - focused ownership data.

**WHEN TO USE:** When users need to contact maintainers or assess project ownership.

**INTEGRATION:** Links to ${TOOL_NAMES.GITHUB_SEARCH_USERS} for developer discovery`,

  [TOOL_NAMES.NPM_GET_LICENSE]: `**License compliance** - Extract package license information.

**MINIMAL OUTPUT:** Package name and license - essential legal compliance data.

**WHEN TO USE:** When users need quick license verification for legal compliance.

**INTEGRATION:** Essential for enterprise package evaluation workflows`,

  [TOOL_NAMES.NPM_GET_HOMEPAGE]: `**Official documentation gateway** - Extract package homepage for comprehensive project resources.

**MINIMAL OUTPUT:** Package name and homepage URL - direct access to live documentation, tutorials, and demos.

**WHEN TO USE:** Access official docs, interactive examples, getting started guides, and project showcases.

**INTEGRATION:** Complements ${TOOL_NAMES.NPM_GET_REPOSITORY} - homepage often contains better docs than README`,

  [TOOL_NAMES.NPM_GET_ID]: `**Precise package targeting** - Extract exact name@version for dependency management.

**MINIMAL OUTPUT:** Package name and _id (name@latestVersion format) - canonical package identifier for lockfiles.

**WHEN TO USE:** Pin exact versions, resolve dependency conflicts, generate package-lock entries, version compatibility checks.

**INTEGRATION:** Critical for CI/CD pipelines, dependency auditing, and reproducible builds`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `**Recent releases tracker** - Get latest release activity and timeline data.

**MINIMAL OUTPUT:** Last modified, created date, version count, and last 10 releases - focused release intelligence.

**WHEN TO USE:** Track recent package activity, analyze release frequency, check latest versions and release dates.

**INTEGRATION:** Essential for monitoring package updates - combine with ${TOOL_NAMES.NPM_GET_VERSIONS} for comprehensive version analysis`,

  [TOOL_NAMES.NPM_GET_ENGINES]: `**Environment compatibility validator** - Prevent runtime conflicts before installation.

**MINIMAL OUTPUT:** Node.js version requirements, npm constraints - environment compatibility matrix.

**WHEN TO USE:** Pre-deployment validation, Docker image planning, Node.js upgrade decisions, CI/CD environment setup.

**INTEGRATION:** Prevents deployment failures - use before installation in production environments`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `**Import path intelligence** - Discover available modules and import strategies.

**MINIMAL OUTPUT:** Export mappings, entry points, submodule paths - complete import guide for developers.

**WHEN TO USE:** Learn correct import syntax, discover tree-shakable exports, find submodules, optimize bundle size.

**INTEGRATION:** CRITICAL for ${TOOL_NAMES.GITHUB_SEARCH_CODE} - enables precise code search with accurate import paths`,
};
