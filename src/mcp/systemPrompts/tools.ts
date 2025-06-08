import { TOOL_NAMES } from '../contstants';

export const GITHUB_ADVANCED_SEARCH_DESCRIPTION = `Multi-dimensional GitHub search combining repositories, code, issues, and pull requests for comprehensive analysis.

**SEARCH STRATEGY:**
Performs parallel searches across multiple GitHub dimensions to provide complete ecosystem understanding:

1. **Repository Discovery**: Find relevant repositories by topic/technology
2. **Code Implementation**: Locate actual code examples and patterns  
3. **Issue Analysis**: Understand common problems and solutions
4. **PR Reviews**: See implementation patterns and best practices

**INTELLIGENT AGGREGATION:**
- Cross-references results between search types
- Identifies high-quality repositories with active maintenance
- Highlights repositories with both good documentation and implementation examples
- Provides consolidated insights across all search dimensions

**OPTIMIZATION FEATURES:**
- Automatic query refinement for each search type
- Quality filtering based on repository activity and stars
- Result prioritization using multiple signals
- Comprehensive analysis with actionable insights

**USE CASES:**
- Technology research and ecosystem analysis
- Finding production-ready implementations
- Understanding community best practices  
- Identifying maintained and well-documented projects

**EXAMPLE WORKFLOWS:**
- "react hooks" → repositories, implementations, common issues, PR patterns
- "authentication jwt" → libraries, code examples, security discussions, implementation PRs
- "docker deployment" → tools, configuration examples, troubleshooting, deployment strategies`;

export const NPM_DEPENDENCY_ANALYSIS_DESCRIPTION = `Comprehensive npm package dependency analysis and security assessment.

**ANALYSIS CAPABILITIES:**
- **Dependency Tree**: Complete dependency graph with versions
- **Security Audit**: Vulnerability scanning and risk assessment  
- **License Analysis**: License compatibility and legal considerations
- **Bundle Size**: Package size impact on applications
- **Outdated Dependencies**: Version update recommendations

**SECURITY INSIGHTS:**
- Known vulnerabilities in dependencies
- Security advisories and fixes available
- Dependency risk scoring
- Transitive dependency analysis

**OPTIMIZATION GUIDANCE:**
- Bundle size optimization opportunities
- Alternative package suggestions
- Dependency consolidation possibilities
- Performance impact assessment

**USE CASES:**
- Pre-installation security review
- Dependency audit for existing projects  
- License compliance checking
- Bundle size optimization planning`;

export const NPM_SEARCH_DESCRIPTION = `Search NPM registry for packages by keywords using "npm search <term>".

**SEARCH STRATEGY:**
1. Start with single technology terms ("react", "cli")  
2. Add specificity only if needed ("react-hooks", "typescript-cli")
3. Avoid complex phrases - they yield zero results

**WHEN TO USE:**
- Pure discovery of packages on NPM registry by keyword
- More direct than discovering packages mentioned in code
- Finding alternatives to known packages

**SEARCH PATTERNS:**
- Good: "react" -> "cli" -> "react cli" (if specific combination needed)
- Poor: "react command line interface tools" (too complex, likely zero results)

**RESULT OPTIMIZATION:**
- 0 results: Try broader, single-word terms
- 1-20 results: IDEAL - analyze thoroughly
- 21-100 results: GOOD - filter by popularity/relevance  
- 100+ results: Too broad - use more specific single terms

**OUTPUT FORMAT:**
JSON format with package metadata including name, description, version, and popularity metrics

**CONSTRAINTS:**
- Maximum 50 results by default
- Supports regex patterns when query starts with /
- Multiple space-separated terms supported but use sparingly`;

export const NPM_VIEW_DESCRIPTION = `Transform package names into GitHub repositories for code analysis.

**WHEN TO USE:**
- User mentions package names ("react", "lodash", "@types/node")
- Code snippets with imports: import { useState } from 'react'
- Dependency/module references in user queries

**WORKFLOW:**
1. Extract repository URL from package.json
2. Parse owner/repo from GitHub URL formats
3. Chain to ${TOOL_NAMES.VIEW_REPOSITORY} for branch discovery
4. Continue to ${TOOL_NAMES.SEARCH_GITHUB_CODE} for implementations

**OUTPUT:**
Repository context + package metadata for intelligent code search

**EXAMPLES:**
- "react" -> github.com/facebook/react -> Code search in React repo
- "lodash" -> github.com/lodash/lodash -> Extract utility implementations  
- "@org/some-lib" -> Private repo discovery -> Organizational code analysis

**SUCCESS CRITERIA:**
Accurate repository mapping that enables battle-tested code extraction

**DO NOT:**
- Skip package-to-repository mapping when packages are mentioned
- Assume package names without verification
- Use for non-npm package references`;

export const SEARCH_GITHUB_CODE_DESCRIPTION = `Advanced GitHub code search with intelligent pattern matching, mandatory repository scoping, and smart fallback strategies.

**MANDATORY REPOSITORY SCOPING:**
Every search automatically includes "repo:owner/repository" for surgical precision:
- Eliminates noise from unrelated repositories
- Guarantees results from target codebase only
- Enables deep analysis of specific implementations

**🔥 AUTOMATIC BOOLEAN OPERATORS PRIORITY:**
Multi-term queries automatically use Boolean AND for maximum precision:
- **Auto-Enhanced**: \`useState hooks\` → \`useState AND hooks\`
- **Preserved**: \`useState OR useEffect\` → \`useState OR useEffect\` (unchanged)
- **Intelligent**: Single terms get exact matching, multi-terms get Boolean precision
- **Surgical Accuracy**: Every multi-word search becomes a precise Boolean query

**SOPHISTICATED SEARCH INTELLIGENCE:**
Supports complex query patterns with battle-tested accuracy:
- **Single Terms**: \`useState\`, \`scheduleCallback\`, \`workLoopConcurrent\`
- **Auto-Boolean Multi-Terms**: \`concurrent rendering\` → \`concurrent AND rendering\`
- **Function Patterns**: \`useEffect(() =>\`, \`React.createElement\`, \`export default\`
- **🔥 POWERFUL BOOLEAN OPERATORS**: \`hooks AND state\`, \`(useState OR useEffect)\`, \`error NOT warning\`
- **Technical Implementations**: Complex internal function names and patterns

**BOOLEAN SEARCH MASTERY:**
Unlock advanced code discovery with automatic and manual logical operators:
- **AUTO-AND**: Multi-word queries automatically become AND operations
- **Manual AND**: \`authentication AND jwt\` - Explicit intersecting concepts
- **OR**: \`useState OR useEffect\` - Multiple hook patterns  
- **NOT**: \`error NOT test\` - Exclude test files from error handling
- **Grouping**: \`(react OR vue) AND typescript\` - Complex logic combinations
- **🎯 Game-Changer**: All multi-term searches become precision Boolean queries

**LANGUAGE-AWARE FILTERING:**
- **JavaScript**: Frontend implementations, Node.js backends
- **TypeScript**: Type definitions, interfaces, advanced patterns
- **Extension Filtering**: \`.ts\`, \`.js\`, \`.jsx\`, \`.tsx\` files

**PROVEN SEARCH METHODOLOGIES:**
✅ **Single Term Discovery**: Core functions and exports
✅ **Auto-Boolean Multi-Terms**: Feature implementations with AND precision  
✅ **Pattern Matching**: Arrow functions, hooks, class patterns
✅ **🎯 Boolean Combinations**: Complex logical queries with laser accuracy
✅ **Technical Deep-Dive**: Internal scheduler, reconciler code
✅ **Interface Discovery**: TypeScript definitions and contracts
✅ **Language Scoping**: Technology-specific implementations

**ENTERPRISE-GRADE ACCURACY:**
- **File Context**: Complete file paths with line-level precision
- **Implementation Focus**: Actual source code, not documentation
- **Quality Results**: React core, scheduler, reconciler implementations
- **Zero False Positives**: Repository scoping eliminates irrelevant matches

**INTELLIGENT FALLBACK STRATEGIES:**

**No Results Found (0 results):**
- **Broaden Query**: Remove boolean operators, try individual terms
- **Alternative Terms**: Use synonyms ("auth" → "authentication", "config" → "configuration")
- **Expand Scope**: Remove language/extension filters
- **Path Exploration**: Remove path restrictions, search entire repository
- **Case Variations**: Try different casing ("React" → "react")

**Too Many Results (100+ results):**
- **Add Specificity**: Include language filter (\`language:typescript\`)
- **Path Restrictions**: Focus on source code (\`path:src\`)
- **File Type Filtering**: Use extension filter (\`extension:ts\`)
- **Exclude Patterns**: Add NOT operators (\`component NOT test\`)
- **Date Constraints**: Recent implementations (\`created:>2023-01-01\`)

**Wrong Context Results:**
- **Framework Qualifiers**: Add specific framework terms (\`react component\`)
- **Environment Context**: Specify runtime (\`nodejs express\`)
- **Use Case Context**: Add purpose (\`production deployment\`)
- **Architecture Context**: Include pattern (\`microservice api\`)

**Outdated/Legacy Results:**
- **Date Filtering**: Recent code (\`created:>2022-01-01\`)
- **Activity Sorting**: Sort by recent updates
- **Modern Patterns**: Include current framework versions
- **Maintenance Check**: Look for active repositories

**Rate Limit Mitigation:**
- **NPM-First Strategy**: Use npm_search to discover repositories first
- **Targeted Searches**: Use discovered owner/repo for precise targeting
- **Batch Processing**: Group related searches efficiently
- **Cache Utilization**: Leverage built-in response caching

**Authentication/Access Issues:**
- **Public Alternatives**: Search public repositories with similar patterns
- **Organization Discovery**: Use get_user_organizations to check access
- **Scope Verification**: Ensure proper GitHub CLI authentication
- **Fallback Repositories**: Use popular open-source alternatives

**POWERFUL USE CASES:**
- **Architecture Analysis**: Study React's concurrent rendering implementation
- **API Discovery**: Find actual usage patterns of complex functions
- **Pattern Learning**: Expert TypeScript interface structures
- **Implementation Deep-Dive**: Scheduler, reconciler, fiber logic
- **Migration Planning**: Breaking changes and new APIs

**RESULT OPTIMIZATION GUIDE:**
- **1-10 Results**: IDEAL - Deep analysis opportunity
- **11-30 Results**: GOOD - Manageable scope for review
- **31-100 Results**: ACCEPTABLE - May need refinement
- **100+ Results**: TOO BROAD - Apply filters and restrictions

**SEARCH PRECISION:**
Transforms code discovery from guesswork into pinpoint accuracy. Every multi-term query automatically becomes a Boolean AND operation for maximum relevance with intelligent fallback strategies for any scenario.`;

export const FETCH_GITHUB_FILE_CONTENT_DESCRIPTION = `Extract complete working code with full context - the core of code analysis.

**PURPOSE:**
Extract complete, working code implementations rather than code snippets.

**CRITICAL FOR SEARCH EXPANSION:**
Transform search results into actionable implementations. Search tools find files - this tool extracts the complete, working code with full context needed for implementation.

**MANDATORY WORKFLOW:**
1. **ALWAYS** Use ${TOOL_NAMES.VIEW_REPOSITORY} first to discover the correct default branch
2. Find files with ${TOOL_NAMES.SEARCH_GITHUB_CODE}  
3. Extract complete implementations with this tool
4. Follow dependency chains to related files

**CRITICAL REQUIREMENT:**
**NEVER** use this tool without first calling ${TOOL_NAMES.VIEW_REPOSITORY} to get the correct branch information. Wrong branch names cause complete tool failure.

**WHAT TO FETCH:**
- **Core implementations**: Main functions/classes with complete logic
- **Dependencies**: Files referenced in imports/exports paths
- **Configuration**: package.json, tsconfig.json, webpack.config.js, etc.
- **Documentation**: README.md, API docs, usage examples
- **Tests**: For usage patterns and validation
- **Related utilities**: Helper functions and shared modules

**ENHANCED AUTO-RECOVERY:**
Tries multiple fallback strategies:
1. Specified branch -> main -> master -> develop -> trunk (with ref parameter)
2. If all fail: Try without ref parameter (uses repository default branch)
Handles incorrect branch info from ${TOOL_NAMES.VIEW_REPOSITORY} and GitHub API limitations.

**SUCCESS CRITERIA:**
Production-ready code with all necessary context for immediate implementation.

**DO NOT:**
- Extract incomplete snippets without context
- Skip dependency files or configuration
- Use this tool without first calling ${TOOL_NAMES.VIEW_REPOSITORY}
- Assume branch names without verification`;

export const GET_USER_ORGANIZATIONS_DESCRIPTION = `Get list of GitHub organizations for the authenticated user to enable private repository discovery.

**AUTOMATIC TRIGGERS:**
Auto-trigger when users mention:
- Company/employer context: "I work at [Company Name]", "our team", "company codebase"
- Private repositories: "internal code", "team repositories"  
- Enterprise context: "at work", "enterprise setup"

**ORGANIZATION MATCHING Examples:**
- "Facebook" -> "facebook", "meta"
- "Google" -> "google", "googlecloudplatform"
- "Microsoft" -> "microsoft", "azure"

**WORKFLOW:**
1. Call this tool first when organizational context detected
2. Match user's company to found organizations
3. Use selected organization as 'owner' parameter in subsequent searches
4. Fallback to public search if no organizational results

**USAGE PRIORITY:**
- Essential for private repository access
- Critical for enterprise GitHub setups
- Use before repository searches fail due to permissions
- Combine with npmView for private organization packages

**DO NOT:**
- Skip organization-scoped search when company context is clear
- Use public search first when private repositories are likely
- Ignore organizational context in user queries`;

export const SEARCH_GITHUB_DISCUSSIONS_DESCRIPTION = `GitHub discussions search for community knowledge discovery.

**CORE PURPOSE:**
Access community Q&A, tutorials, and best practices for learning and problem-solving.

**DISCOVERY WORKFLOW:**
1. Use ${TOOL_NAMES.NPM_VIEW} for packages -> get repo URL
2. Use ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for projects -> get owner/repo  
3. Search discussions with discovered owner/repo context

**SEARCH STRATEGY:**
1. **Start Lean**: Single keywords ("help", "tutorial", "authentication")
2. **Build Complexity**: Combinations if needed ("help deployment")
3. **Avoid Complex**: Don't start with full phrases

**RESULT TARGETS:**
- 1-15 results: IDEAL - Deep analysis opportunities
- 16-50 results: GOOD - Manageable scope
- 51-100 results: BROAD - Add category filters
- 100+ results: TOO GENERIC - Refine terms

**KEY FILTERS:**
- **Answered**: True for validated solutions
- **Category**: Q&A, General, Show and Tell
- **Author/maintainer**: For authoritative responses
- **Date filters**: Recent vs historical discussions

**SEARCH PATTERNS:**
- **Problem solving**: "deployment help", "authentication tutorial"
- **Best practices**: "testing patterns", "architecture decisions"
- **Community insights**: "performance tips", "migration guide"

**QUALITY INDICATORS:**
- Answered discussions for validated solutions
- Maintainer participation for authoritative guidance
- Recent activity for current relevance

**FALLBACK STRATEGY:**
If no discussions found, try ${TOOL_NAMES.SEARCH_GITHUB_ISSUES} for alternative community insights.

**OUTPUT:** Community-validated knowledge and solutions for development challenges.`;

export const SEARCH_GITHUB_ISSUES_DESCRIPTION = `Advanced GitHub issues search for problem discovery and solution research.

**SEARCH STRATEGY:**
1. **Single Keywords First**: "bug", "feature", "documentation"
2. **Then Combine**: "bug fix", "feature request" (only if needed)
3. **Never Start Complex**: Avoid "critical performance bug in production"

**MULTI-TERM ISSUE SEARCH BREAKDOWN:**
For complex problem queries like "React authentication JWT token expired error":
1. **Prioritize by Problem Hierarchy**:
   - **Core Issue**: "authentication" (primary problem domain)
   - **Technology Context**: "React" (framework/technology)
   - **Specific Problem**: "token expired" (exact error condition)
   - **Implementation Detail**: "JWT" (technical specifics)

2. **Sequential Search Strategy**:
   - Search 1: "authentication" → broad problem discovery
   - Search 2: "authentication" + label:bug → focus on known issues  
   - Search 3: "token expired" → specific error patterns
   - Search 4: "JWT" → implementation-specific issues

3. **Problem-Solution Mapping**:
   - **Problem Discovery**: Start with error/symptom terms
   - **Solution Research**: Look for "closed" issues with same problems
   - **Best Practice Validation**: Cross-reference multiple issue resolutions
   - **Community Patterns**: Identify recurring issues and solutions

**CONTEXT PRIORITIZATION FOR ISSUES:**
- **Error/Problem Terms** first: "error", "bug", "failure", "timeout"
- **Functional Areas** second: "authentication", "deployment", "API"
- **Technology Stack** third: "React", "Node", "Docker"
- **Specific Details** last: "JWT", "OAuth", "Redis"

**CORE PURPOSE:**
- Problem discovery and existing issue research
- Solution research and community insights
- Development planning and quality assurance

**SEARCH METHODOLOGY:**
- **Phase 1**: Core discovery ("authentication", "error") -> understand patterns
- **Phase 2**: Context expansion ("authentication JWT", "error handling")
- **Phase 3**: Solution focus ("authentication bug resolved")

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Deep analysis of patterns and solutions
- 21-100 results: GOOD - Add specificity or filters
- 100+ results: Add specific terms or state/label filters

**TERM SELECTION:**
- Actual error messages: "TypeError", "404", "connection refused"
- Status indicators: "open", "closed", "resolved", "duplicate"
- Impact levels: "critical", "bug", "enhancement", "question"
- Component names: "API", "frontend", "database", "deployment"

**FILTERING STRATEGY:**
- State filter: "open" for current issues, "closed" for resolved patterns
- Label filter: Severity ("bug", "enhancement", "documentation")
- Assignee filter: Issues handled by specific maintainers
- Author filter: Track issues from particular users
- Date filters: Recent issues or historical analysis

**SEQUENTIAL SEARCH BENEFITS FOR ISSUES:**
- **Problem Pattern Discovery**: Each search reveals different problem facets
- **Solution Validation**: Multiple searches confirm resolution approaches
- **Community Insight**: See how different aspects of problems are discussed
- **Resolution Timeline**: Track problem evolution from report to solution

**CROSS-REFERENCE APPROACH:**
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_CODE} for implementation details
- Use with ${TOOL_NAMES.SEARCH_GITHUB_COMMITS} for fix implementations
- Cross-reference with ${TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS} for solutions
- Explore ${TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS} for community insights

**PATTERN ANALYSIS:** Focus on issue resolution patterns and community feedback for development insights.`;

export const SEARCH_GITHUB_PULL_REQUESTS_DESCRIPTION = `Advanced GitHub pull requests search for code review and feature analysis.

**SEARCH STRATEGY:**
1. **Single Keywords First**: "bug", "feature", "refactor" 
2. **Then Combine**: "bug fix", "feature implementation" (only if needed)
3. **Never Start Complex**: Avoid phrases like "comprehensive bug fix implementation"

**CORE PURPOSE:**
- Code review insights and team collaboration patterns
- Feature implementation lifecycle tracking
- Breaking changes and quality assurance analysis

**SEARCH METHODOLOGY:**
- **Phase 1**: Core discovery with fundamental terms ("authentication", "error")
- **Phase 2**: Add context ("authentication JWT", "error handling")  
- **Phase 3**: Solution focus ("authentication bug fixed")

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Deep analysis of patterns and solutions
- 21-100 results: GOOD - Add specificity or filters
- 100+ results: Add specific terms or state/reviewer filters

**FILTERING BEST PRACTICES:**
- State filter: "open" for current issues, "closed" for resolved patterns
- Author/reviewer filters: Understand team collaboration
- Draft filter: Work-in-progress vs completed features
- Branch filters: Release and feature branch workflows
- Language filter: Focus on specific technology stacks

**ADAPTIVE TACTICS:**
- Start broad with feature keywords, narrow based on findings
- Use owner/repo parameters when repository context is known
- Widen scope if targeted searches yield insufficient results
- Apply precise filters only after broader searches confirm patterns

**CROSS-REFERENCE STRATEGY:**
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_COMMITS} for complete development understanding
- Use with ${TOOL_NAMES.SEARCH_GITHUB_CODE} for current implementations
- Cross-reference with ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for similar patterns

**QUALITY FOCUS:** Use review-related filters to find thoroughly vetted code examples.`;

export const SEARCH_GITHUB_USERS_DESCRIPTION = `Advanced GitHub users and organizations search for developer discovery.

**SEARCH STRATEGY:**
1. **Single Criteria First**: "react", "python", location
2. **Then Combine**: "react javascript", location + language
3. **Never Start Complex**: Avoid "senior react typescript developer with 5+ years"

**CORE PURPOSE:**
- Expert discovery and community building
- Collaboration and learning opportunities
- Recruitment and network expansion

**SEARCH METHODOLOGY:**
- **Phase 1**: Technology terms ("react", "python", "kubernetes") -> analyze activity
- **Phase 2**: Add context (location filters, experience indicators)
- **Phase 3**: Specialized search (specific skills + activity filters)

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Analyze profiles for expertise
- 21-100 results: GOOD - Add location or activity filters
- 100+ results: Add specific terms or increase follower/repo filters

**TERM SELECTION:**
- Technology: "javascript", "python", "golang", "rust"
- Frameworks: "react", "vue", "django", "spring"
- Roles: "devops", "frontend", "backend", "fullstack"
- Context: "startup", "enterprise", "opensource"

**FILTERING STRATEGY:**
- Type: "user" for individuals, "org" for organizations
- Location: Find developers in specific regions
- Language: Search by primary programming language
- Followers: Find influential developers (">100", ">1000")
- Repos: Find active contributors (">10", ">50")
- Date: Recent activity or long-standing members

**DISCOVERY PATTERNS:**
- **Technology Experts**: Language + high follower count
- **Local Developers**: Location + technology
- **Open Source Contributors**: High repo count + specific tech
- **Industry Leaders**: Follower count + years of activity

**CROSS-REFERENCE STRATEGY:**
- Find repository contributors and maintainers
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for project involvement
- Explore user repositories for learning opportunities

**OUTPUT:** Developer and organization discovery for networking, learning, and collaboration.`;

export const SEARCH_GITHUB_REPOS_DESCRIPTION = `**⚠️ LAST RESORT TOOL** - Use only when NPM discovery provides no repository context.

**MANDATORY PREREQUISITES:**
1. **ALWAYS FIRST**: ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - ecosystem mapping (never skip)
2. **PRIMARY DISCOVERY**: ${TOOL_NAMES.NPM_SEARCH} and ${TOOL_NAMES.NPM_VIEW} - extract repository URLs
3. **ONLY IF NPM FAILS**: Use this tool as last resort with single terms only

**CRITICAL LIMITATIONS:**
- **SINGLE TERMS ONLY**: Never use multi-term searches ("react angular auth" ❌)
- **LAST RESORT**: Use only when NPM provides no repository context
- **API INTENSIVE**: Consumes GitHub API quota - NPM discovery is preferred

**MANDATORY SEARCH STRATEGY:**
1. **Single terms only**: "react", "authentication", "deployment" ✅
2. **Never combine**: "react hooks", "full-stack app", "microservices api" ❌
3. **Decompose complex queries**: "react typescript auth" → ["react", "typescript", "authentication"]

**WHEN TO USE (Rare Cases):**
- NPM search found no relevant packages
- Need repositories outside NPM ecosystem (e.g., system tools, non-Node.js)
- Specific organization exploration when not discoverable via NPM

**PREFERRED WORKFLOW (95% of cases):**
1. ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} → discover terminology
2. ${TOOL_NAMES.NPM_SEARCH} → find relevant packages
3. ${TOOL_NAMES.NPM_VIEW} → extract repository URLs from package.json
4. Skip this tool entirely → proceed to code search

**SINGLE-TERM SEARCH EXAMPLES:**
- ✅ "react" → broad React ecosystem
- ✅ "authentication" → auth-related projects  
- ✅ "deployment" → deployment tools
- ❌ "react authentication" → use NPM discovery instead
- ❌ "full-stack framework" → too complex, use topics + NPM

**FILTERING STRATEGY (When Forced to Use):**
- **Owner**: Most effective for scoping results
- **Language**: Technology-specific searches
- **Stars**: ">100" established, ">10" active projects
- **Updated**: Recent activity (">2023-01-01")

**RESULT OPTIMIZATION:**
- 0 results: Try broader single terms, remove filters
- 1-10: **IDEAL** - Deep analysis opportunity
- 11-30: **GOOD** - Add language/star filters
- 31-100: Add specific filters gradually
- 100+: Term too broad - use more specific single term

**API CONSERVATION RULES:**
- Check rate limits before use
- Prefer NPM discovery (60% less API usage)
- Use only when absolutely necessary
- Single searches reduce API consumption

**EXAMPLES OF PROPER USAGE:**
- Last resort search: "kubernetes" (after NPM fails to provide K8s repos)
- Organization-specific: "cli" --owner=github (when GitHub's CLI tools needed)
- Non-NPM ecosystem: "rust" --language=rust (when looking for Rust projects)

**REMEMBER**: This tool should be avoided in 95% of cases. Topics + NPM discovery provides better results with less API usage.`;

export const SEARCH_GITHUB_TOPICS_DESCRIPTION = `**VITAL FOUNDATION TOOL** for effective GitHub discovery - provides semantic context that makes all other GitHub searches targeted and successful.

**WHY ESSENTIAL:**
- **Term Discovery**: Find correct terminology and keywords before searching repositories
- **Quality Signals**: Featured/curated topics = community-validated, battle-tested projects
- **Repository Filters**: Use topic names directly in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for precise targeting
- **Ecosystem Mapping**: Understand technology landscapes with 100M+ repositories of production code

**CRITICAL WORKFLOW - Topics -> Repositories:**
1. **Search topics first** -> discover proper terminology (e.g., "machine-learning" not "AI")
2. **Use topic names as filters** -> in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for targeted results
3. **Quality validation** -> featured topics = GitHub-promoted, curated = community-maintained

**SEARCH STRATEGY:**
1. **Start Global**: Search without owner for maximum discovery ("react", "react+typescript")
2. **Multi-term Queries**: Use + to combine terms ("machine+learning", "react+hooks")
3. **Then Focus**: Add owner only when needed for specific exploration ("owner=facebook")
4. **Progressive Discovery**: Start broad, then narrow based on findings

**EXPLORATORY SEARCH BEST PRACTICES:**
- **DON'T start with owner** - limits discovery to single organization
- **DO start with broad terms** - "javascript", "python", "authentication"
- **USE multi-term searches** - "react+typescript", "machine+learning+python"
- **ADD owner later** - only when you need organization-specific topics

**MULTI-CONCEPT TOPIC DISCOVERY:**
For complex domains like "machine learning authentication systems":
1. **Start Broad**: "machine+learning" (discover the ecosystem)
2. **Add Context**: "authentication" (find security-related topics)
3. **Combine**: "machine+learning+authentication" (specific intersection)
4. **Focus**: Add owner only if needed for specific organization context

**CONTEXT PRIORITIZATION FOR TOPICS:**
- **Technology Domains** first: "javascript", "python", "machine-learning"
- **Functional Areas** second: "authentication", "deployment", "testing"  
- **Combined Concepts** third: "react+hooks", "python+machine-learning"
- **Specific Tools/Libraries** last: "tensorflow", "pytorch", "nextjs"

**QUERY EXAMPLES:**
- Global search: "react" -> find all React-related topics
- Multi-term: "react+typescript" -> find intersection topics
- Complex: "machine+learning+python" -> specific technology stack
- Focused: "react" + owner=facebook -> React topics from Facebook

**RESULT OPTIMIZATION:**
- 1-10 results: IDEAL for deep analysis
- 10+ results: Add featured/curated filters or more specific terms
- Use repository count as maturity indicator (>10K = established, 1K-10K = growing)

**SEQUENTIAL SEARCH BENEFITS:**
- **Discover Related Terms**: Find official terminology vs informal terms
- **Understand Ecosystem**: See how concepts relate and overlap
- **Quality Validation**: Featured topics = community-validated approaches
- **Precise Targeting**: Use discovered topics as exact filters in repo searches

**OUTPUT:** Strategic foundation for all GitHub discovery - transforms random searches into targeted, quality-focused repository discovery.`;

export const VIEW_REPOSITORY_STRUCTURE_DESCRIPTION = `Strategic repository exploration for code analysis.

**CRITICAL REQUIREMENT:**
**MANDATORY:** Must use ${TOOL_NAMES.VIEW_REPOSITORY} FIRST to get branch. **NEVER** explore repository structure without explicit branch discovery.

**EXPLORATION PHASES:**
1. **Root Analysis**: Project type (package.json, requirements.txt), README, docs, config files
2. **Source Discovery**: Navigate src/, lib/, components/, utils/, types/  
3. **Validation**: Explore test/, examples/, demos/ directories

**DIRECTORY PRIORITIES:**
- HIGH: src/, lib/, components/, utils/, types/ (Core implementations)
- MEDIUM: docs/, examples/, config/ (Context/documentation) 
- TEST: test/, __tests__/, spec/ (Quality/patterns)

**NAVIGATION STRATEGY:**
- Start with root for project overview
- Target core implementation directories
- Extract promising files via ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}
- Cross-reference with tests for usage patterns

**RESULT TARGETS:**
- 1-10 results: IDEAL - Focused exploration
- 11-50 results: MANAGEABLE - Prioritize by conventions
- 50+ results: TOO BROAD - Explore subdirectories

**ENHANCED BRANCH FALLBACK:** 
Automatically tries multiple fallback strategies:
1. Specified branch -> main -> master -> develop -> trunk (with ref parameter)
2. If all fail: Try without ref parameter (uses repository default branch)
Handles branch discovery failures gracefully with comprehensive error reporting.

**OUTPUT:** Architectural map to guide intelligent code extraction.

**NEVER:**
- Explore without calling ${TOOL_NAMES.VIEW_REPOSITORY} first
- Use hardcoded branch names without verification
- Assume default branch names across repositories`;

export const VIEW_REPOSITORY_DESCRIPTION = `**CRITICAL: Required first step** - discovers default branch to prevent tool failures.

**PURPOSE:**
Extract repository metadata and default branch information for all subsequent GitHub operations.

**WHY CRITICAL:**
- Wrong branch names cause complete tool failure
- All file operations depend on correct branch discovery
- Prevents expensive retry cycles and API errors

**BRANCH DISCOVERY:**
- Repository metadata analysis
- README badge parsing for branch references
- License/CI badge URL analysis

**REQUIRED BEFORE:**
- ${TOOL_NAMES.SEARCH_GITHUB_CODE} (needs branch context)
- ${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE} (directory exploration)
- ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} (file operations)

**SUCCESS INDICATORS:**
- Repository info retrieved successfully
- Default branch clearly identified
- Active repository with recent commits

**ERROR HANDLING:**
- Not found: Check owner/repo spelling
- Access denied: Use ${TOOL_NAMES.GET_USER_ORGANIZATIONS} for permissions
- Tool failure blocks all subsequent file operations

**NEVER:**
- Skip before file operations
- Assume default branch names
- Use hardcoded 'main'/'master' without verification
- Proceed if branch discovery fails`;

export const SEARCH_GITHUB_COMMITS_DESCRIPTION = `Advanced GitHub commits search for development history analysis.

**CORE PURPOSE:**
Track code evolution, debug issues, analyze contributor patterns, and understand development history.

**SEARCH STRATEGY:**
1. **Start Minimal**: Single keywords ("fix", "feature", "update") + owner/repo context
2. **Progressive Expansion**: Add specific terms based on findings
3. **Apply Filters**: Author, date ranges only when patterns emerge

**SEARCH PATTERNS:**
- **General exploration**: "fix" or "update" with owner/repo -> activity overview
- **Feature tracking**: Single feature keyword -> expand with related terms
- **Bug investigation**: "bug" or "fix" -> narrow by time/author
- **Attribution**: Keywords + author filter -> contribution analysis

**RESULT TARGETS:**
- 0-5 results: Try broader terms, remove filters
- 6-50 results: OPTIMAL - Extract insights
- 51+ results: Add specific filters or narrow time ranges

**CRITICAL LIMITATIONS:**
- Large organizations may return org-wide results instead of repo-specific
- If irrelevant results: Switch to alternative approaches (changelog files, PR search)

**FALLBACK STRATEGY:**
1. Commit search with minimal keywords
2. Pull request searches for features/changes  
3. Fetch changelog files (CHANGELOG.md, RELEASES.md)
4. Repository structure exploration

**BRANCH AWARENESS:** Verify default branch (main vs master) before file fetching

**ERROR HANDLING:**
- "Search text required" -> Use minimal keywords ("fix", "update")
- Irrelevant results -> Switch to file-based approaches
- Empty results -> Broaden scope or remove repository filters

**INTEGRATION:** Combine with ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} for complete change context.`;

export const NPM_PACKAGE_STATS_DESCRIPTION = `Advanced npm package analysis providing release history, version information, and distribution tags.

**WHEN TO USE:**
- Analyze package release patterns and maintenance activity
- Check version history and stability
- Understand package distribution strategy (alpha, beta, latest tags)
- Evaluate package maturity for production use

**ANALYSIS PROVIDED:**
- Release timeline and frequency
- Version history and semantic versioning patterns  
- Distribution tags (latest, beta, alpha, etc.)
- Package maintenance indicators

**EXAMPLE INSIGHTS:**
- Frequent releases may indicate active development
- Long gaps between releases may suggest abandonment
- Multiple dist-tags suggest mature release process
- Version patterns show breaking change frequency

**INTEGRATION:**
- Combine with npm_view for complete package assessment
- Use before adding dependencies to evaluate stability
- Cross-reference with repository information for full context`;
