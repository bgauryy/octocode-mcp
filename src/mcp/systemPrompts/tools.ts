import { TOOL_NAMES } from '../contstants';

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_ADVANCED_SEARCH]: `**Multi-dimensional GitHub search** - Combines repositories, code, issues, and pull requests for comprehensive analysis.

**PURPOSE:**
Perform parallel searches across GitHub dimensions to understand complete technology ecosystems.

**SEARCH STRATEGY:**
1. **Repository Discovery** - Find relevant projects by topic/technology
2. **Code Implementation** - Locate actual usage patterns and examples  
3. **Issue Analysis** - Understand common problems and solutions
4. **PR Review** - See implementation patterns and best practices

**WHEN TO USE:**
- Technology research and ecosystem analysis
- Finding production-ready implementations  
- Understanding community best practices
- Identifying maintained, well-documented projects

**KEY FEATURES:**
- Cross-references results between search types
- Quality filtering based on repository activity and stars
- Result prioritization using multiple signals
- Consolidated insights across all dimensions

**EXAMPLE WORKFLOWS:**
- \`"react hooks"\` → repositories, implementations, common issues, PR patterns
- \`"authentication jwt"\` → libraries, code examples, security discussions, PRs
- \`"docker deployment"\` → tools, configs, troubleshooting, strategies

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for terminology discovery.`,

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `**Comprehensive dependency analysis** - Security audit, license check, and optimization guidance for npm packages.

**PURPOSE:**
Analyze package dependencies for security vulnerabilities, license compliance, and bundle optimization.

**ANALYSIS CAPABILITIES:**
- **Security Audit** - Vulnerability scanning and risk assessment
- **Dependency Tree** - Complete dependency graph with versions
- **License Analysis** - License compatibility and legal considerations
- **Bundle Impact** - Package size impact on applications
- **Update Recommendations** - Outdated dependencies and available fixes

**WHEN TO USE:**
- Pre-installation security review
- Dependency audit for existing projects
- License compliance checking
- Bundle size optimization planning

**KEY INSIGHTS:**
- Known vulnerabilities with severity scores
- Security advisories and available fixes
- Alternative package suggestions
- Performance impact assessment

**INTEGRATION:** Use with ${TOOL_NAMES.NPM_GET_PACKAGE} for complete package assessment.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `**NPM registry search** - Discover packages by keywords with intelligent search strategies.

**PURPOSE:**  
Find relevant npm packages using keyword-based discovery with optimization guidance.

**SEARCH STRATEGY:**
1. **Start Simple** - Single terms: \`"react"\`, \`"cli"\`
2. **Add Specificity** - Combined terms: \`"react-hooks"\`, \`"typescript-cli"\`  
3. **Avoid Complexity** - Complex phrases yield zero results

**WHEN TO USE:**
- Package discovery by keyword/functionality
- Finding alternatives to known packages
- More direct than code-mentioned package discovery

**SEARCH PATTERNS:**
- ✅ Good: \`"react"\` → \`"cli"\` → \`"react cli"\` (if specific combo needed)
- ❌ Poor: \`"react command line interface tools"\` (too complex)

**RESULT OPTIMIZATION:**
- **0 results** - Try broader, single-word terms
- **1-20 results** - IDEAL for thorough analysis
- **21-100 results** - Filter by popularity/relevance
- **100+ results** - Use more specific single terms

**OUTPUT:** JSON with package metadata: name, description, version, popularity metrics

**CONSTRAINTS:** 50 results max, regex support with /, space-separated terms supported but use sparingly

**INTEGRATION:** Chain to ${TOOL_NAMES.NPM_GET_PACKAGE} for repository discovery.`,

  [TOOL_NAMES.NPM_GET_PACKAGE]: `**Package-to-repository mapping** - Transform npm package names into GitHub repositories for code analysis.

**PURPOSE:**
Extract GitHub repository information from npm packages to enable code analysis workflows.

**WHEN TO USE:**
- User mentions package names: \`"react"\`, \`"lodash"\`, \`"@types/node"\`
- Code snippets with imports: \`import { useState } from 'react'\`
- Dependency/module references in queries

**WORKFLOW:**
1. Extract repository URL from package.json
2. Parse owner/repo from GitHub URL formats  
3. Chain to ${TOOL_NAMES.GITHUB_GET_REPOSITORY} for branch discovery
4. Continue to ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementations

**EXAMPLES:**
- \`"react"\` → github.com/facebook/react → Code search in React repo
- \`"lodash"\` → github.com/lodash/lodash → Extract utility implementations
- \`"@org/lib"\` → Private repo discovery → Organizational code analysis

**SUCCESS CRITERIA:** Accurate repository mapping enabling battle-tested code extraction

**ERROR HANDLING:** 
- Package not found → Try ${TOOL_NAMES.NPM_SEARCH_PACKAGES}
- No repository URL → Search GitHub topics/repositories
- Private repositories → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS}

**INTEGRATION:** Essential first step before GitHub code analysis workflows.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `**Precision code search** - Advanced GitHub code search with intelligent pattern matching and repository scoping.

**PURPOSE:**
Find specific code implementations with surgical precision using automatic Boolean operators and repository scoping.

**KEY FEATURES:**
- **Automatic Repository Scoping** - Every search includes "repo:owner/repository"
- **Auto-Boolean Logic** - Multi-term queries become AND operations automatically
- **Smart Fallbacks** - Multiple recovery strategies for failed searches

**SEARCH INTELLIGENCE:**
- **Single Terms** - \`useState\`, \`scheduleCallback\`, \`workLoopConcurrent\`
- **Auto-Boolean** - \`"concurrent rendering"\` → \`"concurrent AND rendering"\`
- **Manual Boolean** - \`"hooks AND state"\`, \`"(useState OR useEffect)"\`, \`"error NOT test"\`
- **Function Patterns** - \`"useEffect(() =>"\`, \`"React.createElement"\`, \`"export default"\`

**LANGUAGE FILTERING:**
- **JavaScript/TypeScript** - Frontend implementations, Node.js backends
- **Extension Filtering** - \`.ts\`, \`.js\`, \`.jsx\`, \`.tsx\` files
- **Path Filtering** - \`path:src\`, \`path:lib\` for focused searches

**RESULT OPTIMIZATION:**
- **1-10 Results** - IDEAL for deep analysis
- **11-30 Results** - GOOD, manageable scope
- **31-100 Results** - ACCEPTABLE, may need refinement
- **100+ Results** - TOO BROAD, apply filters

**FALLBACK STRATEGIES:**
- **No Results** - Remove boolean operators, try synonyms, expand scope
- **Too Many Results** - Add language filters, path restrictions, exclude tests
- **Wrong Context** - Add framework qualifiers, environment context

**ERROR HANDLING:**
- Rate limits → Use ${TOOL_NAMES.NPM_SEARCH_PACKAGES} first for repo discovery
- Access denied → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for permissions
- Outdated results → Add date filters (\`created:>2022-01-01\`)

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_GET_REPOSITORY} for branch discovery.`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `**Complete code extraction** - Fetch full working code implementations with comprehensive context.

**PURPOSE:**
Extract complete, production-ready code implementations rather than snippets, with all necessary context.

**CRITICAL WORKFLOW:**
1. **MANDATORY** - Use ${TOOL_NAMES.GITHUB_GET_REPOSITORY} first for branch discovery
2. Find files with ${TOOL_NAMES.GITHUB_SEARCH_CODE}
3. Extract complete implementations with this tool
4. Follow dependency chains to related files

**WHAT TO FETCH:**
- **Core Implementations** - Main functions/classes with complete logic
- **Dependencies** - Files referenced in imports/exports
- **Configuration** - package.json, tsconfig.json, webpack.config.js
- **Documentation** - README.md, API docs, usage examples
- **Tests** - Usage patterns and validation examples
- **Utilities** - Helper functions and shared modules

**AUTO-RECOVERY SYSTEM:**
1. Specified branch → main → master → develop → trunk
2. If all fail → Try without ref parameter (uses repository default)
3. Comprehensive error reporting for troubleshooting

**SUCCESS CRITERIA:** Production-ready code with immediate implementation context

**ERROR HANDLING:**
- Wrong branch → Auto-fallback to common branch names
- File not found → Verify path with ${TOOL_NAMES.GITHUB_GET_CONTENTS}
- Access denied → Check permissions with ${TOOL_NAMES.GITHUB_GET_USER_ORGS}

**CRITICAL REQUIREMENT:** NEVER use without calling ${TOOL_NAMES.GITHUB_GET_REPOSITORY} first.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `**Organization discovery** - Get authenticated user's GitHub organizations for private repository access.

**PURPOSE:**
Enable private repository discovery by identifying user's organizational memberships.

**AUTO-TRIGGERS:**
Automatically use when users mention:
- Company context: \`"I work at [Company]"\`, \`"our team"\`, \`"company codebase"\`
- Private repos: \`"internal code"\`, \`"team repositories"\`
- Enterprise: \`"at work"\`, \`"enterprise setup"\`

**ORGANIZATION MATCHING:**
- \`"Facebook"\` → \`"facebook"\`, \`"meta"\`
- \`"Google"\` → \`"google"\`, \`"googlecloudplatform"\`  
- \`"Microsoft"\` → \`"microsoft"\`, \`"azure"\`

**WORKFLOW:**
1. Call when organizational context detected
2. Match user's company to discovered organizations
3. Use organization as 'owner' parameter in subsequent searches
4. Fallback to public search if no organizational results

**USAGE PRIORITY:**
- Essential for private repository access
- Critical for enterprise GitHub setups
- Use before searches fail due to permissions

**ERROR HANDLING:**
- No organizations found → Proceed with public searches
- Access denied → Verify GitHub authentication
- Rate limits → Cache results for session reuse

**INTEGRATION:** Use before any GitHub search tools when private access likely needed.`,

  [TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS]: `**Community knowledge search** - Access GitHub discussions for Q&A, tutorials, and best practices.

**PURPOSE:**
Discover community-validated solutions, tutorials, and expert insights through discussion forums.

**DISCOVERY WORKFLOW:**
1. Use ${TOOL_NAMES.NPM_GET_PACKAGE} for packages → get repo URL
2. Use ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} for projects → get owner/repo
3. Search discussions with discovered context

**SEARCH STRATEGY:**
1. **Start Simple** - Single keywords: \`"help"\`, \`"tutorial"\`, \`"authentication"\`
2. **Build Complexity** - Combinations: \`"help deployment"\`, \`"tutorial setup"\`
3. **Avoid Complexity** - Don't start with full phrases

**KEY FILTERS:**
- **Answered: true** - Validated solutions with accepted answers
- **Category** - "Q&A", "General", "Show and Tell"
- **Author/Maintainer** - Authoritative responses from project maintainers
- **Date Filters** - Recent vs historical discussions

**RESULT TARGETS:**
- **1-15 results** - IDEAL for deep analysis
- **16-50 results** - GOOD, manageable scope
- **51-100 results** - BROAD, add category filters
- **100+ results** - TOO GENERIC, refine terms

**QUALITY INDICATORS:**
- Answered discussions for validated solutions
- Maintainer participation for authoritative guidance
- Recent activity for current relevance

**FALLBACK STRATEGY:** If no discussions found, try ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} for alternative insights.

**INTEGRATION:** Best used after repository discovery for targeted community insights.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `**Problem discovery and solution research** - Advanced issue search for debugging and development planning.

**PURPOSE:**
Discover existing problems, validated solutions, and community insights through issue tracking.

**SEARCH STRATEGY:**
1. **Single Keywords** - \`"bug"\`, \`"feature"\`, \`"documentation"\`
2. **Then Combine** - \`"bug fix"\`, \`"feature request"\` (if needed)
3. **Never Complex** - Avoid \`"critical performance bug in production"\`

**PROBLEM HIERARCHY APPROACH:**
For complex queries like "React authentication JWT token expired error":
1. **Core Issue** - \`"authentication"\` (primary problem domain)
2. **Technology Context** - \`"React"\` (framework/technology)
3. **Specific Problem** - \`"token expired"\` (exact error condition)
4. **Implementation Detail** - \`"JWT"\` (technical specifics)

**SEARCH METHODOLOGY:**
- **Phase 1** - Core discovery: \`"authentication"\`, \`"error"\` → understand patterns
- **Phase 2** - Context expansion: \`"authentication JWT"\`, \`"error handling"\`
- **Phase 3** - Solution focus: \`"authentication bug resolved"\`

**KEY FILTERS:**
- **State** - "open" for current issues, "closed" for resolved patterns
- **Labels** - "bug", "enhancement", "documentation" for severity
- **Author/Assignee** - Track specific contributors or maintainers
- **Date Filters** - Recent issues or historical analysis

**RESULT TARGETS:**
- **0 results** - Try broader terms, remove filters
- **1-20 results** - IDEAL for pattern analysis
- **21-100 results** - GOOD, add specificity or filters
- **100+ results** - Add specific terms or state/label filters

**SEQUENTIAL SEARCH BENEFITS:**
- **Problem Pattern Discovery** - Each search reveals different facets
- **Solution Validation** - Multiple searches confirm approaches
- **Community Insight** - See discussion of problem aspects
- **Resolution Timeline** - Track evolution from report to solution

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementation details and ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} for solutions.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `**Code review and feature analysis** - Advanced PR search for implementation patterns and collaboration insights.

**PURPOSE:**
Analyze feature implementations, code review patterns, and team collaboration through pull request history.

**SEARCH STRATEGY:**
1. **Single Keywords** - \`"bug"\`, \`"feature"\`, \`"refactor"\`
2. **Then Combine** - \`"bug fix"\`, \`"feature implementation"\` (if needed)
3. **Never Complex** - Avoid \`"comprehensive bug fix implementation"\`

**CORE APPLICATIONS:**
- Code review insights and team collaboration patterns
- Feature implementation lifecycle tracking
- Breaking changes and quality assurance analysis

**SEARCH METHODOLOGY:**
- **Phase 1** - Core discovery: \`"authentication"\`, \`"error"\`
- **Phase 2** - Add context: \`"authentication JWT"\`, \`"error handling"\`
- **Phase 3** - Solution focus: \`"authentication bug fixed"\`

**KEY FILTERS:**
- **State** - "open" for current work, "closed" for completed features
- **Draft** - false for completed features, true for work-in-progress
- **Author/Reviewer** - Understand team collaboration patterns
- **Branch Filters** - Release and feature branch workflows
- **Language** - Focus on specific technology stacks

**RESULT TARGETS:**
- **0 results** - Try broader terms, remove filters
- **1-20 results** - IDEAL for pattern analysis
- **21-100 results** - GOOD, add specificity or filters
- **100+ results** - Add specific terms or state/reviewer filters

**QUALITY FOCUS:** Use review-related filters to find thoroughly vetted code examples.

**ADAPTIVE TACTICS:**
- Start broad with feature keywords, narrow based on findings
- Use owner/repo when repository context known
- Apply precise filters only after broader searches confirm patterns

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} for complete development understanding.`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `**Developer and organization discovery** - Find experts, collaborators, and community leaders.

**PURPOSE:**
Discover developers, organizations, and community leaders for collaboration, learning, and recruitment.

**SEARCH STRATEGY:**
1. **Single Criteria** - \`"react"\`, \`"python"\`, location
2. **Then Combine** - \`"react javascript"\`, location + language
3. **Never Complex** - Avoid \`"senior react typescript developer with 5+ years"\`

**SEARCH METHODOLOGY:**
- **Phase 1** - Technology terms: \`"react"\`, \`"python"\`, \`"kubernetes"\` → analyze activity
- **Phase 2** - Add context: location filters, experience indicators
- **Phase 3** - Specialized search: specific skills + activity filters

**KEY FILTERS:**
- **Type** - "user" for individuals, "org" for organizations
- **Location** - Find developers in specific regions
- **Language** - Primary programming language
- **Followers** - Influential developers (">100", ">1000")
- **Repos** - Active contributors (">10", ">50")
- **Date** - Recent activity or established members

**DISCOVERY PATTERNS:**
- **Technology Experts** - Language + high follower count
- **Local Developers** - Location + technology
- **Open Source Contributors** - High repo count + specific tech
- **Industry Leaders** - High followers + years of activity

**RESULT TARGETS:**
- **0 results** - Try broader terms, remove filters
- **1-20 results** - IDEAL for profile analysis
- **21-100 results** - GOOD, add location or activity filters
- **100+ results** - Add specific terms or increase follower/repo filters

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} for project involvement analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `**⚠️ LAST RESORT TOOL** - Repository search only when NPM discovery fails.

**CRITICAL LIMITATIONS:**
- **SINGLE TERMS ONLY** - Never use multi-term searches (\`"react angular auth"\` ❌)
- **LAST RESORT** - Use only when NPM provides no repository context
- **API INTENSIVE** - Consumes GitHub API quota heavily

**MANDATORY PREREQUISITES:**
1. **ALWAYS FIRST** - ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for ecosystem mapping
2. **PRIMARY DISCOVERY** - ${TOOL_NAMES.NPM_SEARCH_PACKAGES} and ${TOOL_NAMES.NPM_GET_PACKAGE}
3. **ONLY IF NPM FAILS** - Use this tool with single terms only

**SEARCH STRATEGY:**
1. **Single terms only** - \`"react"\`, \`"authentication"\`, \`"deployment"\` ✅
2. **Never combine** - \`"react hooks"\`, \`"full-stack app"\` ❌
3. **Decompose complex** - \`"react typescript auth"\` → [\`"react"\`, \`"typescript"\`, \`"authentication"\`]

**WHEN TO USE (Rare Cases):**
- NPM search found no relevant packages
- Non-NPM ecosystem (system tools, non-Node.js)
- Specific organization exploration not discoverable via NPM

**PREFERRED WORKFLOW (95% of cases):**
1. ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} → discover terminology
2. ${TOOL_NAMES.NPM_SEARCH_PACKAGES} → find packages
3. ${TOOL_NAMES.NPM_GET_PACKAGE} → extract repository URLs
4. **Skip this tool** → proceed to code search

**FILTERING STRATEGY (When Forced to Use):**
- **Owner** - Most effective for scoping results
- **Language** - Technology-specific searches
- **Stars** - ">100" established, ">10" active projects
- **Updated** - Recent activity (">2023-01-01")

**RESULT OPTIMIZATION:**
- **0 results** - Try broader single terms, remove filters
- **1-10** - IDEAL for deep analysis
- **11-30** - GOOD, add language/star filters
- **31-100** - Add specific filters gradually
- **100+** - Term too broad, use more specific single term

**REMEMBER:** Avoid in 95% of cases. Topics + NPM discovery provides better results with less API usage.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `**🎯 FOUNDATION TOOL** - Essential first step for effective GitHub discovery.

**PURPOSE:**
Discover correct terminology and quality signals before searching repositories, providing semantic context for targeted searches.

**WHY ESSENTIAL:**
- **Term Discovery** - Find official terminology before searching repositories
- **Quality Signals** - Featured/curated topics = community-validated projects
- **Repository Filters** - Use topic names in ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} for precision
- **Ecosystem Mapping** - Understand technology landscapes across 100M+ repositories

**SEARCH STRATEGY:**
1. **Start Global** - Search without owner for maximum discovery
2. **Multi-term Queries** - Use + to combine: \`"react+typescript"\`, \`"machine+learning"\`
3. **Then Focus** - Add owner only when needed: \`owner=facebook\`
4. **Progressive Discovery** - Start broad, narrow based on findings

**EXPLORATORY BEST PRACTICES:**
- **DON'T start with owner** - Limits discovery to single organization
- **DO start broad** - \`"javascript"\`, \`"python"\`, \`"authentication"\`
- **USE multi-term** - \`"react+typescript"\`, \`"machine+learning+python"\`
- **ADD owner later** - Only when organization-specific topics needed

**CONTEXT PRIORITIZATION:**
1. **Technology Domains** - \`"javascript"\`, \`"python"\`, \`"machine-learning"\`
2. **Functional Areas** - \`"authentication"\`, \`"deployment"\`, \`"testing"\`
3. **Combined Concepts** - \`"react+hooks"\`, \`"python+machine-learning"\`
4. **Specific Tools** - \`"tensorflow"\`, \`"pytorch"\`, \`"nextjs"\`

**QUERY EXAMPLES:**
- **Global search** - \`"react"\` → find all React-related topics
- **Multi-term** - \`"react+typescript"\` → intersection topics
- **Complex** - \`"machine+learning+python"\` → specific tech stack
- **Focused** - \`"react"\` + owner=facebook → React topics from Facebook

**RESULT OPTIMIZATION:**
- **1-10 results** - IDEAL for deep analysis
- **10+ results** - Add featured/curated filters or more specific terms
- **Repository count** - Maturity indicator (>10K established, 1K-10K growing)

**SEQUENTIAL SEARCH BENEFITS:**
- **Discover Related Terms** - Official vs informal terminology
- **Understand Ecosystem** - How concepts relate and overlap
- **Quality Validation** - Featured topics = community-validated approaches
- **Precise Targeting** - Use discovered topics as exact filters

**INTEGRATION:** Strategic foundation for all GitHub discovery - use before other GitHub tools.`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `**Repository structure exploration** - Strategic directory navigation for code analysis.

**PURPOSE:**
Explore repository structure systematically to understand project architecture and locate key implementation files.

**CRITICAL REQUIREMENT:**
**MANDATORY** - Use ${TOOL_NAMES.GITHUB_GET_REPOSITORY} FIRST for branch discovery. Never explore without explicit branch information.

**EXPLORATION PHASES:**
1. **Root Analysis** - Project type (package.json, requirements.txt), README, docs, config
2. **Source Discovery** - Navigate src/, lib/, components/, utils/, types/
3. **Validation** - Explore test/, examples/, demos/ directories

**DIRECTORY PRIORITIES:**
- **HIGH PRIORITY** - src/, lib/, components/, utils/, types/ (core implementations)
- **MEDIUM PRIORITY** - docs/, examples/, config/ (context/documentation)
- **VALIDATION** - test/, __tests__/, spec/ (quality/patterns)

**NAVIGATION STRATEGY:**
1. Start with root for project overview
2. Target core implementation directories
3. Extract promising files via ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}
4. Cross-reference with tests for usage patterns

**RESULT TARGETS:**
- **1-10 results** - IDEAL for focused exploration
- **11-50 results** - MANAGEABLE, prioritize by conventions
- **50+ results** - TOO BROAD, explore subdirectories

**AUTO-RECOVERY SYSTEM:**
1. Specified branch → main → master → develop → trunk
2. If all fail → Try without ref parameter (uses repository default)
3. Comprehensive error reporting

**ERROR HANDLING:**
- Branch not found → Auto-fallback to common branches
- Access denied → Check permissions with ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- Empty directory → Try parent directory or common paths

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_GET_REPOSITORY} and before ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}.`,

  [TOOL_NAMES.GITHUB_GET_REPOSITORY]: `**🚨 CRITICAL FIRST STEP** - Required before all GitHub file operations.

**PURPOSE:**
Discover default branch and repository metadata to prevent tool failures in subsequent operations.

**WHY CRITICAL:**
- **Prevents Tool Failures** - Wrong branch names cause complete tool failure
- **Enables File Operations** - All file operations depend on correct branch discovery
- **Avoids API Waste** - Prevents expensive retry cycles and API errors

**BRANCH DISCOVERY METHODS:**
- Repository metadata analysis
- README badge parsing for branch references
- License/CI badge URL analysis
- Default branch detection

**REQUIRED BEFORE:**
- ${TOOL_NAMES.GITHUB_SEARCH_CODE} (needs branch context)
- ${TOOL_NAMES.GITHUB_GET_CONTENTS} (directory exploration)
- ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} (file operations)

**SUCCESS INDICATORS:**
- Repository information retrieved successfully
- Default branch clearly identified
- Active repository with recent commits
- Repository accessibility confirmed

**ERROR HANDLING:**
- **Not found** - Check owner/repo spelling, verify repository exists
- **Access denied** - Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for permission check
- **Rate limited** - Implement retry with exponential backoff
- **Tool failure** - Blocks all subsequent file operations

**CRITICAL REQUIREMENTS:**
- **NEVER skip** before file operations
- **NEVER assume** default branch names
- **NEVER use** hardcoded 'main'/'master' without verification
- **NEVER proceed** if branch discovery fails

**INTEGRATION:** Mandatory first step before any GitHub file operation workflows.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `**Development history analysis** - Track code evolution, debug issues, and analyze contributor patterns.

**PURPOSE:**
Understand development history, track feature evolution, debug issues, and analyze contributor patterns through commit history.

**SEARCH STRATEGY:**
1. **Start Minimal** - Single keywords (\`"fix"\`, \`"feature"\`, \`"update"\`) with owner/repo
2. **Progressive Expansion** - Add specific terms based on findings
3. **Apply Filters** - Author, date ranges only when patterns emerge

**SEARCH PATTERNS:**
- **General exploration** - \`"fix"\` or \`"update"\` with owner/repo → activity overview
- **Feature tracking** - Single feature keyword → expand with related terms
- **Bug investigation** - \`"bug"\` or \`"fix"\` → narrow by time/author
- **Attribution analysis** - Keywords + author filter → contribution analysis

**RESULT TARGETS:**
- **0-5 results** - Try broader terms, remove filters
- **6-50 results** - OPTIMAL for extracting insights
- **51+ results** - Add specific filters or narrow time ranges

**KEY LIMITATIONS:**
- Large organizations may return org-wide results instead of repo-specific
- Search requires text terms - empty queries not supported

**FALLBACK STRATEGY:**
1. Commit search with minimal keywords
2. Pull request searches for features/changes
3. Fetch changelog files (CHANGELOG.md, RELEASES.md)
4. Repository structure exploration

**ERROR HANDLING:**
- **"Search text required"** - Use minimal keywords (\`"fix"\`, \`"update"\`)
- **Irrelevant results** - Switch to file-based approaches
- **Empty results** - Broaden scope or remove repository filters
- **Rate limits** - Implement progressive backoff

**BRANCH AWARENESS:** Verify default branch (main vs master) before file operations

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} for complete change context analysis.`,

  [TOOL_NAMES.NPM_GET_PACKAGE_STATS]: `**Package maturity and maintenance analysis** - Comprehensive npm package lifecycle assessment.

**PURPOSE:**
Analyze package release patterns, version history, and maintenance activity to evaluate package maturity and stability.

**ANALYSIS CAPABILITIES:**
- **Release Timeline** - Release frequency and patterns over time
- **Version History** - Semantic versioning patterns and breaking changes
- **Distribution Tags** - latest, beta, alpha, next, and custom tags
- **Maintenance Indicators** - Activity patterns and project health signals

**WHEN TO USE:**
- **Pre-installation Assessment** - Evaluate package stability before adoption
- **Dependency Planning** - Understand release patterns for dependency management
- **Security Evaluation** - Check maintenance activity and update frequency
- **Production Readiness** - Assess package maturity for production use

**KEY INSIGHTS:**
- **Frequent releases** - May indicate active development or instability
- **Long gaps** - May suggest project abandonment or maturity
- **Multiple dist-tags** - Indicates mature release process and testing
- **Version patterns** - Shows breaking change frequency and stability

**MATURITY INDICATORS:**
- **Stable projects** - Regular releases, clear versioning, multiple dist-tags
- **Active development** - Frequent releases, recent activity, beta/alpha tags
- **Mature projects** - Less frequent releases, stable versioning, long-term support
- **Abandoned projects** - Long gaps, no recent activity, outdated dependencies

**OUTPUT ANALYSIS:**
- Release timeline visualization
- Version distribution and tagging strategy
- Maintenance activity assessment
- Stability and maturity scoring

**ERROR HANDLING:**
- **Package not found** - Verify package name spelling
- **No release data** - Package may be too new or private
- **Rate limits** - Implement retry with exponential backoff

**INTEGRATION:** 
- Use with ${TOOL_NAMES.NPM_GET_PACKAGE} for complete package assessment
- Combine with ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES} for comprehensive evaluation
- Cross-reference with repository information for development activity context`,
};
