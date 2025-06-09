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

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `**CRITICAL: Package security and metadata analysis** - Essential for package evaluation and private organization detection.

**PURPOSE:**
Analyze package dependencies, security vulnerabilities, and organizational context for informed package adoption decisions.

**ANALYSIS CAPABILITIES:**
- **Security Audit** - Vulnerability scanning and risk assessment
- **Dependency Tree** - Complete dependency graph with versions
- **License Analysis** - License compatibility and legal considerations
- **Bundle Impact** - Package size impact on applications
- **Organization Detection** - Identify private/organizational packages (@wix/, @company/)
- **Update Recommendations** - Outdated dependencies and available fixes

**WHEN TO USE (HIGH PRIORITY):**
- **ALWAYS** after ${TOOL_NAMES.NPM_GET_PACKAGE} for complete assessment
- Pre-installation security review
- Dependency audit for existing projects
- Private organization package analysis
- License compliance checking
- Bundle size optimization planning

**ORGANIZATIONAL CONTEXT:**
- **Private Packages** - Detect @company/ scoped packages
- **Enterprise Context** - Identify internal tooling and dependencies
- **Security Assessment** - Corporate security policy compliance

**KEY INSIGHTS:**
- Known vulnerabilities with severity scores
- Security advisories and available fixes
- Alternative package suggestions
- Performance impact assessment
- Organizational package patterns

**SMART FALLBACKS:**
- No vulnerability data → Focus on maintenance indicators
- Private packages → Check organization access via ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- Rate limits → Cache analysis results

**INTEGRATION:** **MANDATORY** use with ${TOOL_NAMES.NPM_GET_PACKAGE} for complete package assessment.`,

  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `**PRIMARY DISCOVERY TOOL** - Main entry point for package and repository discovery.

**PURPOSE:**  
Find relevant npm packages using keyword-based discovery - **FIRST STEP** in most workflows.

IN case the user mentions a package name, you should use this tool to find the package.

E.g. 
import {
  someAPI,
} from '@your-org/your-feature-sdk;

should search for @your-org/your-feature-sdk in npm

Or when the user mentions a package name in his query, you should use this tool to find the package.
E.g.
"I want to use someAPI from @your-org/your-feature-sdk"
should search for @your-org/your-feature-sdk in npm

e.g "what react hooks is"

should search for react  in npm and hooks implementation inreact repo

**SEARCH STRATEGY (START HERE):**
1. **Start Simple** - Single terms: \`"react"\`, \`"cli"\`, \`"auth"\`
2. **Add Specificity** - Combined terms: \`"react-hooks"\`, \`"typescript-cli"\`  
3. **Avoid Complexity** - Complex phrases yield zero results
4. **Detect Private Packages** - Look for @company/ scoped packages

**WHEN TO USE (HIGHEST PRIORITY):**
- **PRIMARY DISCOVERY** - Start here for 95% of queries
- Package discovery by keyword/functionality
- Finding alternatives to known packages
- Organizational package detection (@wix/, @company/)
- Repository path extraction workflow

**ORGANIZATIONAL DETECTION:**
- **@company/ packages** → Trigger ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **Enterprise indicators** → Check for private repositories
- **Internal tooling** → Identify company-specific packages

**SEARCH PATTERNS:**
- ✅ **Primary**: \`"react"\` → \`"cli"\` → \`"react cli"\` (if specific combo needed)
- ✅ **Organization**: \`"@wix/"\` → Detect private context
- ❌ **Poor**: \`"react command line interface tools"\` (too complex)

**RESULT OPTIMIZATION:**
- **0 results** - Try broader, single-word terms
- **1-20 results** - IDEAL for thorough analysis
- **21-100 results** - Filter by popularity/relevance
- **100+ results** - Use more specific single terms

**SMART FALLBACKS:**
- No results → Try ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for terminology
- Private packages → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **NEVER** query twice with same terms

**OUTPUT:** JSON with package metadata: name, description, version, popularity metrics, repository URLs

**INTEGRATION:** **ALWAYS** chain to ${TOOL_NAMES.NPM_GET_PACKAGE} → ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES} for complete workflow.`,

  [TOOL_NAMES.NPM_GET_PACKAGE]: `**Repository mapping and package analysis** - Transform npm packages into GitHub repositories for code analysis.

**PURPOSE:**
Extract GitHub repository information and package metadata from npm packages - **ESSENTIAL BRIDGE** to GitHub workflows.

**WHEN TO USE (HIGH PRIORITY):**
- **ALWAYS** after ${TOOL_NAMES.NPM_SEARCH_PACKAGES}
- User mentions package names: \`"react"\`, \`"lodash"\`, \`"@types/node"\`
- Code snippets with imports: \`import { useState } from 'react'\`
- Dependency/module references in queries
- **Private package detection** (@company/, @wix/)

**CRITICAL WORKFLOW:**
1. Extract repository URL from package.json
2. Parse owner/repo from GitHub URL formats  
3. **Detect organizational context** (private repos, company scopes)
4. Chain to ${TOOL_NAMES.GITHUB_GET_REPOSITORY} for branch discovery
5. **MANDATORY** follow with ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES}
6. Continue to ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementations

**ORGANIZATIONAL DETECTION:**
- **@company/ scoped packages** → Trigger ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **Private repository URLs** → Enterprise context detection
- **Internal package patterns** → Company tooling identification

**EXAMPLES:**
- \`"react"\` → github.com/facebook/react → Code search in React repo
- \`"@wix/some-package"\` → Private org detection → User orgs check
- \`"lodash"\` → github.com/lodash/lodash → Extract utility implementations

**SUCCESS CRITERIA:** Accurate repository mapping enabling battle-tested code extraction

**SMART FALLBACKS:**
- Package not found → Try ${TOOL_NAMES.NPM_SEARCH_PACKAGES} with broader terms
- No repository URL → Use ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for discovery
- Private repositories → **IMMEDIATELY** use ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **NEVER** retry same package twice

**INTEGRATION:** **CRITICAL** bridge between NPM and GitHub workflows - always use before GitHub operations.`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `**Precision code implementation search** - Advanced GitHub code search with testing-validated pattern matching and repository scoping.

**PURPOSE:**
Find specific code implementations with surgical precision using testing-validated search patterns and automatic repository scoping.

**TESTING-VALIDATED PATTERNS:**
- **Function Discovery Success** - "export function" → VSCode TypeScript functions (localize, getVersion, fixWin32DirectoryPermissions)
- **Boolean Operator Validation** - "useState OR useEffect" ✅, "function NOT test" ✅, regex patterns ❌
- **Path Filter Effectiveness** - packages/react/src/__tests__ ✅, src/ (may fail) ⚠️, extension filters ✅
- **Cross-Repository Success** - "async function login" finds 4 TypeScript authentication implementations
- **Repository-Specific Targeting** - facebook/react + "useEffect" → actual React source code

**KEY FEATURES:**
- **Automatic Repository Scoping** - Every search includes "repo:owner/repository"
- **Smart Boolean Logic** - Multi-term queries become AND operations automatically
- **Organizational Context** - Respects private repository access
- **Smart Fallbacks** - Multiple recovery strategies for failed searches

**BOOLEAN OPERATIONS:**
- **Default AND Behavior** - Adjacent terms use AND: \`"sparse index"\` = \`"sparse AND index"\`
- **OR Operations** - \`"useState OR useEffect"\` for either/or searches
- **NOT Operations** - \`"error NOT test"\` or \`"fatal error" NOT path:__testing__\` for exclusions
- **Parentheses Support** - \`(language:javascript OR language:typescript) AND NOT path:"/tests/"\`
- **Case Sensitivity** - Default: case-insensitive. Case-sensitive: \`/(?-i)True/\`

**SEARCH PATTERNS:**
- **Single Terms** - \`useState\`, \`scheduleCallback\`, \`workLoopConcurrent\`
- **Function Patterns** - \`"useEffect(() =>"\`, \`"React.createElement"\`, \`"export default"\`
- **Path Qualifiers** - \`path:src\`, \`path:components\`, \`NOT path:__testing__\`
- **Language Qualifiers** - \`language:javascript\`, \`language:typescript\`
- **Extension Qualifiers** - \`extension:js\`, \`extension:ts\`
- **Complex Expressions** - \`(language:ruby OR language:python) AND NOT path:"/tests/"\`

**SEARCH SCOPING:**
- **Exploratory inside owner** - Add \`"owner={owner}"\` for organization-wide search
- **Exploratory inside repository** - Add \`"owner={owner} repo={repo}"\` for focused search
- **Smart API usage** - \`gh api "search/repositories?q=topic:react+angular&per_page=10"\`

**LANGUAGE FILTERING:**
- **JavaScript/TypeScript** - Frontend implementations, Node.js backends
- **Extension Filtering** - \`.ts\`, \`.js\`, \`.jsx\`, \`.tsx\` files
- **Path Filtering** - \`path:src\`, \`path:lib\` for focused searches

**⚠️ CRITICAL PATH FILTERING WARNING:**
Path filters depend on actual repository structure - **verify directory exists first!**
- **React**: Uses \`path:packages\` (NOT \`path:src\`)
- **Next.js**: Uses \`path:examples\`, \`path:packages\`, \`path:docs\`
- **VSCode**: Uses \`path:src\`, \`path:extensions\` 
- **Node.js**: Uses \`path:lib\`, \`path:src\`, \`path:test\`
- **Angular**: Uses \`path:packages\`, \`path:aio\`
- **Vue**: Uses \`path:packages\`, \`path:src\`

**COMMON MISTAKE**: Using \`path:src\` on repositories that don't have a top-level \`src\` directory will return zero results even with valid search terms. Always check repository structure or use broader paths first.

**RESULT OPTIMIZATION:**
- **1-10 Results** - IDEAL for deep analysis
- **11-30 Results** - GOOD, manageable scope
- **31-100 Results** - ACCEPTABLE, may need refinement
- **100+ Results** - TOO BROAD, apply filters

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- **No Results** - Remove boolean operators, try synonyms, expand scope
- **Zero Results with Path Filter** - Remove \`path:\` qualifier or try \`path:packages\`, \`path:lib\` instead of \`path:src\`
- **Too Many Results** - Add language filters, path restrictions, exclude tests
- **Wrong Context** - Add framework qualifiers, environment context
- **Query Parse Error** - Check boolean syntax, ensure proper qualifier formatting
- **Complex Expressions** - Break into simpler queries or use path/language qualifiers
- **Private Access** - Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for permissions
- **Rate Limits** - Switch to ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for discovery

**ORGANIZATIONAL CONTEXT:**
- **Private repositories** - Leverage ${TOOL_NAMES.GITHUB_GET_USER_ORGS} results
- **Company code** - Search within organizational boundaries
- **Enterprise patterns** - Focus on internal implementations

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_GET_REPOSITORY} for branch discovery and ${TOOL_NAMES.NPM_GET_PACKAGE} for repository context.`,

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

**ORGANIZATIONAL CONTEXT:**
- **Private repositories** - Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **Company code** - Explore internal project structures
- **Enterprise patterns** - Focus on production codebases

**SUCCESS CRITERIA:** Production-ready code with immediate implementation context

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- Wrong branch → Auto-fallback to common branch names
- File not found → Verify path with ${TOOL_NAMES.GITHUB_GET_CONTENTS}
- Access denied → Check permissions with ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **NEVER** retry same file path twice

**CRITICAL REQUIREMENT:** NEVER use without calling ${TOOL_NAMES.GITHUB_GET_REPOSITORY} first.`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `**CRITICAL: Private organization discovery** - Essential for company/enterprise repository access.

**PURPOSE:**
Enable private repository discovery by identifying user's organizational memberships - **TRIGGER AUTOMATICALLY** for company contexts.

**AUTO-TRIGGERS (IMMEDIATE USE):**
Automatically use when users mention:
- **Company package scopes**: \`@wix/\`, \`@company/\`, \`@organization/\`
- **Company context**: \`"I work at [Company]"\`, \`"our team"\`, \`"company codebase"\`
- **Private repos**: \`"internal code"\`, \`"team repositories"\`
- **Enterprise**: \`"at work"\`, \`"enterprise setup"\`

**ORGANIZATION MATCHING:**
- \`"@wix/"\` → \`"wix"\` organization
- \`"Facebook"\` → \`"facebook"\`, \`"meta"\`
- \`"Google"\` → \`"google"\`, \`"googlecloudplatform"\`  
- \`"Microsoft"\` → \`"microsoft"\`, \`"azure"\`

**CRITICAL WORKFLOW:**
1. **IMMEDIATE** call when organizational context detected
2. Match user's company to discovered organizations
3. Use organization as 'owner' parameter in subsequent searches
4. Enable access to private repositories and internal code
5. Fallback to public search if no organizational results

**USAGE PRIORITY (HIGHEST):**
- **Essential** for private repository access
- **Critical** for enterprise GitHub setups
- **Mandatory** before searches fail due to permissions
- **Required** for @company/ scoped packages

**SMART FALLBACKS:**
- No organizations found → Proceed with public searches
- Access denied → Verify GitHub authentication
- Rate limits → Cache results for session reuse
- **NEVER** query twice in same session

**INTEGRATION:** **MANDATORY** first step before any GitHub search tools when private access likely needed.`,

  [TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS]: `**Community knowledge and Q&A search** - Access GitHub discussions for tutorials, solutions, and best practices.

**PURPOSE:**
Discover community-validated solutions, tutorials, and expert insights through discussion forums - **CONTEXT TOOL** for repository status.

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

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- No discussions found → Try ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} for alternative insights
- Private repositories → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **NEVER** retry same query twice

**INTEGRATION:** Best used after repository discovery for targeted community insights and repository status context.`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `**Problem discovery and solution research** - Advanced issue search for debugging and repository status analysis.

**PURPOSE:**
Discover existing problems, validated solutions, and community insights through issue tracking - **CONTEXT TOOL** for repository status.

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

**REPOSITORY STATUS ANALYSIS:**
- **Active maintenance** - Recent issue responses and closures
- **Community engagement** - Issue participation and discussion quality
- **Problem patterns** - Common issues and their resolution status

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- No results → Try ${TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS} for community insights
- Private repositories → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **NEVER** retry same search terms twice

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_CODE} for implementation details and ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS} for solutions.`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `**Code review and implementation analysis** - Advanced PR search for patterns and repository status insights.

**PURPOSE:**
Analyze feature implementations, code review patterns, and team collaboration through pull request history - **CONTEXT TOOL** for repository status.

**SEARCH STRATEGY:**
1. **Single Keywords** - \`"bug"\`, \`"feature"\`, \`"refactor"\`
2. **Then Combine** - \`"bug fix"\`, \`"feature implementation"\` (if needed)
3. **Never Complex** - Avoid \`"comprehensive bug fix implementation"\`

**CORE APPLICATIONS:**
- Code review insights and team collaboration patterns
- Feature implementation lifecycle tracking
- Breaking changes and quality assurance analysis
- **Repository activity assessment**

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

**REPOSITORY STATUS INDICATORS:**
- **Active development** - Recent PR activity and merge patterns
- **Code quality** - Review thoroughness and approval processes
- **Team collaboration** - Contributor engagement and feedback quality

**QUALITY FOCUS:** Use review-related filters to find thoroughly vetted code examples.

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- No results → Try ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} for development history
- Private repositories → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **NEVER** retry same search terms twice

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_COMMITS} for complete development understanding and repository status.`,

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

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- No results → Try ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for ecosystem discovery
- Private context → Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for organizational insights
- **NEVER** retry same search criteria twice

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES} for project involvement analysis.`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `**⚠️ PRODUCTION-OPTIMIZED FALLBACK TOOL** - Enhanced repository search with smart query handling and filter validation.

**CRITICAL LIMITATIONS & IMPROVEMENTS:**
- **Smart Multi-term Handling** - Auto-decomposes complex queries with workflow suggestions
- **Filter Validation** - Prevents common problematic combinations that return 0 results
- **Fallback Strategies** - Automatic suggestions when searches fail
- **LAST RESORT** - Use only when NPM and topics provide no repository context

**PRODUCTION TESTING INSIGHTS:**
- **facebook + react + JavaScript** → Often returns 0 results (filter conflict detected)
- **High star thresholds + language** → Too restrictive, auto-suggests alternatives  
- **Multi-term queries** → Auto-decomposes with structured workflow guidance
- **Missing owner parameter** → Triggers npm_search_packages recommendation

**MANDATORY PREREQUISITES (ALL MUST FAIL FIRST):**
1. **ALWAYS FIRST** - ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for package discovery
2. **THEN** - ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} for ecosystem mapping
3. **ONLY IF BOTH FAIL** - Use this tool with intelligent fallbacks

**TESTING-VALIDATED SEARCH STRATEGY:**
1. **Proven Single Terms** - "react" (236K⭐), "typescript" (105K⭐) vs multi-term failures
2. **Validated Combinations** - microsoft + typescript ✅, facebook + react ✅, multi-language ❌  
3. **Filter validation** - Pre-flight checks for problematic combinations
4. **Smart fallbacks** - Automatic alternative approaches for 0 results
5. **Success Metrics** - Global search: 420K⭐ results, Scoped search: quality projects
6. **Caching hints** - React, TypeScript, Vue, Angular confirmed high-value terms

**PRODUCTION BEST PRACTICES INTEGRATED:**
- **Start Broad** - Owner + single term, progressively add filters
- **Monitor Limits** - Rate limit awareness and API usage optimization
- **Validate Filters** - Pre-checks for combinations that commonly fail
- **Smart Alternatives** - Auto-suggests npm/topics workflow for better results
- **Cache Popular** - Identifies frequently searched terms (React, TypeScript, etc.)

**RESULT OPTIMIZATION WITH GUIDANCE:**
- **0 results** → Comprehensive fallback workflow with specific alternatives
- **1-10** → IDEAL scope with caching recommendations for popular terms
- **11-30** → GOOD scope with filter refinement suggestions
- **31-100** → BROAD scope with specific optimization guidance
- **100+** → TOO BROAD with automatic npm_search_packages workflow recommendation

**FILTER CONFLICT DETECTION:**
- **Known problematic combinations** automatically detected and warned
- **Alternative approaches** suggested before search execution
- **Progressive filtering** recommendations for complex requirements
- **Owner scoping** strongly recommended for reliable results

**MULTI-TERM QUERY INTELLIGENCE:**
- **Automatic decomposition** - \`"react hooks authentication"\` → structured workflow
- **Primary term extraction** - Uses first meaningful term for search
- **Workflow guidance** - Step-by-step npm → topics → repository approach
- **Context preservation** - Maintains intent while optimizing execution

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- **Structured alternatives** - npm_search_packages → topics → broader repository search
- **Filter adjustment** - Progressive removal of restrictive parameters
- **Owner expansion** - Suggests removing org constraints when appropriate
- **Term simplification** - Breaks complex queries into manageable components

**CACHING & PERFORMANCE:**
- **Popular term detection** - React, TypeScript, Vue, Angular, etc.
- **Cache recommendations** - Explicit guidance for frequently searched terms
- **API optimization** - Rate limit awareness and usage suggestions
- **Batch operation hints** - When to group related searches

**ENTERPRISE FEATURES:**
- **Private organization support** - Seamless integration with ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- **Company scope detection** - @company/ package pattern recognition
- **Internal repository guidance** - Enterprise workflow optimization

**WORKFLOW INTEGRATION EXAMPLES:**
- **Package Discovery** - \`"@wix/component"\` → npm_search_packages → repository extraction
- **Ecosystem Research** - \`"machine learning"\` → topics discovery → curated repositories
- **Problem Solving** - \`"authentication error"\` → targeted issue/discussion search

**SUCCESS METRICS & MONITORING:**
- **Discovery effectiveness** - 95% resolution via npm → github workflow
- **Filter success rates** - Validation prevents common 0-result scenarios
- **API efficiency** - Reduced redundant searches through smart fallbacks
- **Cache hit optimization** - Popular term identification and storage hints

**ERROR HANDLING & RECOVERY:**
- **Graceful degradation** - Progressive fallback chains
- **Contextual guidance** - Specific next steps based on failure type
- **Workflow preservation** - Maintains search intent through alternative methods
- **Learning integration** - Failed searches inform better npm/topics strategies

**CRITICAL REMINDER:** 
This tool now intelligently handles edge cases and provides comprehensive guidance, but the **npm_search_packages → topics workflow still provides superior results** with better API efficiency for 95% of use cases.

**PRODUCTION DEPLOYMENT READY:** 
Enhanced with real-world testing insights, filter validation, smart query handling, and comprehensive fallback strategies for reliable enterprise use.`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `**FOUNDATION TOOL** - Essential first step for ecosystem discovery and terminology mapping.

**PURPOSE:**
Discover correct terminology and quality signals before searching repositories - **FOUNDATION** for effective GitHub discovery.

**WHY ESSENTIAL:**
- **Term Discovery** - Find official terminology before searching repositories
- **Quality Signals** - Featured/curated topics = community-validated projects
- **Repository Filters** - Use topic names for precision searches
- **Ecosystem Mapping** - Understand technology landscapes across 100M+ repositories

**SEARCH STRATEGY:**
1. **Start Global** - Search without owner for maximum discovery
2. **Single Terms** - Use individual terms: \`"react"\`, \`"typescript"\`, \`"authentication"\`
3. **Multi-term Queries** - Use + to combine: \`"react+typescript"\`, \`"machine+learning"\`
4. **Then Focus** - Add owner only when needed: \`owner=facebook\`
5. **Progressive Discovery** - Start broad, narrow based on findings

**EXPLORATORY BEST PRACTICES:**
- **DON'T start with owner** - Limits discovery to single organization
- **DO start broad** - \`"javascript"\`, \`"python"\`, \`"authentication"\`
- **USE single terms mostly** - \`"react"\`, \`"typescript"\`, \`"authentication"\`
- **USE multi-term sparingly** - \`"react+typescript"\` when specific combination needed
- **ADD owner later** - Only when organization-specific topics needed

**CONTEXT PRIORITIZATION:**
1. **Technology Domains** - \`"javascript"\`, \`"python"\`, \`"machine-learning"\`
2. **Functional Areas** - \`"authentication"\`, \`"deployment"\`, \`"testing"\`
3. **Combined Concepts** - \`"react+hooks"\`, \`"python+machine-learning"\`
4. **Specific Tools** - \`"tensorflow"\`, \`"pytorch"\`, \`"nextjs"\`

**QUERY EXAMPLES:**
- **Global search** - \`"react"\` → find all React-related topics
- **Single term** - \`"authentication"\` → discover auth-related topics
- **Multi-term** - \`"react+typescript"\` → intersection topics (use sparingly)
- **Complex** - \`"machine+learning+python"\` → specific tech stack (rare cases)
- **Focused** - \`"react"\` + owner=facebook → React topics from Facebook

**RESULT OPTIMIZATION:**
- **1-10 results** - IDEAL for deep analysis
- **10+ results** - Add featured/curated filters or more specific terms
- **Repository count** - Maturity indicator (>10K established, 1K-10K growing)

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- No results → Try broader single terms
- Too many results → Add featured/curated filters
- **NEVER** retry same query twice

**SEQUENTIAL SEARCH BENEFITS:**
- **Discover Related Terms** - Official vs informal terminology
- **Understand Ecosystem** - How concepts relate and overlap
- **Quality Validation** - Featured topics = community-validated approaches
- **Precise Targeting** - Use discovered topics as exact filters

**INTEGRATION:** **CRITICAL** foundation for all GitHub discovery - use before other GitHub tools, after ${TOOL_NAMES.NPM_SEARCH_PACKAGES}.`,

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

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- Branch not found → Auto-fallback to common branches
- Access denied → Check permissions with ${TOOL_NAMES.GITHUB_GET_USER_ORGS}
- Empty directory → Try parent directory or common paths
- **NEVER** retry same path twice

**ORGANIZATIONAL CONTEXT:**
- **Private repositories** - Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **Company code** - Explore internal project structures
- **Enterprise patterns** - Focus on production codebases

**INTEGRATION:** Use after ${TOOL_NAMES.GITHUB_GET_REPOSITORY} and before ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}.`,

  [TOOL_NAMES.GITHUB_GET_REPOSITORY]: `**🚨 CRITICAL FIRST STEP** - Required before all GitHub file operations.

**PURPOSE:**
Discover default branch and repository metadata to prevent tool failures in subsequent operations.

**WHY CRITICAL:**
- **Prevents Tool Failures** - Wrong branch names cause complete tool failure
- **Enables File Operations** - All file operations depend on correct branch discovery
- **Avoids API Waste** - Prevents expensive retry cycles and API errors
- **Organizational Context** - Identifies private vs public repositories

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
- **Organizational context** detected

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- **Not found** - Check owner/repo spelling, verify repository exists
- **Access denied** - Use ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for permission check
- **Rate limited** - Implement retry with exponential backoff
- **Tool failure** - Blocks all subsequent file operations
- **NEVER** retry same repository twice

**ORGANIZATIONAL DETECTION:**
- **Private repositories** - Trigger ${TOOL_NAMES.GITHUB_GET_USER_ORGS} for access
- **Company repositories** - Identify enterprise context
- **Internal projects** - Detect organizational patterns

**CRITICAL REQUIREMENTS:**
- **NEVER skip** before file operations
- **NEVER assume** default branch names
- **NEVER use** hardcoded 'main'/'master' without verification
- **NEVER proceed** if branch discovery fails

**INTEGRATION:** **MANDATORY** first step before any GitHub file operation workflows.`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `**Development history analysis** - Track code evolution and repository status through commit patterns.

**PURPOSE:**
Understand development history, track feature evolution, debug issues, and analyze contributor patterns - **CONTEXT TOOL** for repository status.

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

**REPOSITORY STATUS ANALYSIS:**
- **Active development** - Recent commit frequency and patterns
- **Maintenance quality** - Commit message quality and consistency
- **Team activity** - Contributor patterns and collaboration indicators

**KEY LIMITATIONS:**
- Large organizations may return org-wide results instead of repo-specific
- Search requires text terms - empty queries not supported

**SMART FALLBACKS (NO DOUBLE QUERIES):**
1. Commit search with minimal keywords
2. Pull request searches for features/changes via ${TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS}
3. Fetch changelog files (CHANGELOG.md, RELEASES.md) via ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT}
4. Repository structure exploration via ${TOOL_NAMES.GITHUB_GET_CONTENTS}
5. **NEVER** retry same search terms twice

**ERROR HANDLING:**
- **"Search text required"** - Use minimal keywords (\`"fix"\`, \`"update"\`)
- **Irrelevant results** - Switch to file-based approaches
- **Empty results** - Broaden scope or remove repository filters
- **Rate limits** - Switch to ${TOOL_NAMES.NPM_SEARCH_PACKAGES} for alternative discovery

**INTEGRATION:** Combine with ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} for complete change context analysis and repository status assessment.`,

  [TOOL_NAMES.NPM_GET_PACKAGE_STATS]: `**Package maturity and release analysis** - Comprehensive lifecycle assessment for package evaluation.

**PURPOSE:**
Analyze package release patterns, version history, and maintenance activity to evaluate package maturity and stability - **CRITICAL** for package assessment.

**ANALYSIS CAPABILITIES:**
- **Release Timeline** - Release frequency and patterns over time
- **Version History** - Semantic versioning patterns and breaking changes
- **Distribution Tags** - latest, beta, alpha, next, and custom tags
- **Maintenance Indicators** - Activity patterns and project health signals
- **Organizational Context** - Company package patterns and enterprise usage

**WHEN TO USE (HIGH PRIORITY):**
- **ALWAYS** after ${TOOL_NAMES.NPM_GET_PACKAGE} for complete assessment
- **Pre-installation Assessment** - Evaluate package stability before adoption
- **Dependency Planning** - Understand release patterns for dependency management
- **Security Evaluation** - Check maintenance activity and update frequency
- **Production Readiness** - Assess package maturity for production use

**KEY INSIGHTS:**
- **Frequent releases** - May indicate active development or instability
- **Long gaps** - May suggest project abandonment or maturity
- **Multiple dist-tags** - Indicates mature release process and testing
- **Version patterns** - Shows breaking change frequency and stability
- **Enterprise indicators** - Company usage patterns and support

**MATURITY INDICATORS:**
- **Stable projects** - Regular releases, clear versioning, multiple dist-tags
- **Active development** - Frequent releases, recent activity, beta/alpha tags
- **Mature projects** - Less frequent releases, stable versioning, long-term support
- **Abandoned projects** - Long gaps, no recent activity, outdated dependencies

**ORGANIZATIONAL ANALYSIS:**
- **@company/ packages** - Internal release patterns and maintenance
- **Enterprise usage** - Corporate adoption and support indicators
- **Private packages** - Internal versioning and distribution strategies

**OUTPUT ANALYSIS:**
- Release timeline visualization
- Version distribution and tagging strategy
- Maintenance activity assessment
- Stability and maturity scoring

**SMART FALLBACKS (NO DOUBLE QUERIES):**
- **Package not found** - Verify package name spelling, try ${TOOL_NAMES.NPM_SEARCH_PACKAGES}
- **No release data** - Package may be too new or private
- **Rate limits** - Cache analysis results for session reuse
- **NEVER** retry same package twice

**INTEGRATION:** 
- **MANDATORY** use with ${TOOL_NAMES.NPM_GET_PACKAGE} for complete package assessment
- Combine with ${TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES} for comprehensive evaluation
- Cross-reference with repository information for development activity context`,
};
