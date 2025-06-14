export const TOOL_NAMES = {
  // System & API Status
  API_STATUS_CHECK: 'api_status_check',

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
  GITHUB_GET_USER_ORGS: 'github_get_user_organizations',

  // npm Registry API - Comprehensive
  NPM_SEARCH_PACKAGES: 'npm_search_packages',
  NPM_GET_PACKAGE: 'npm_get_package',
  NPM_GET_PACKAGE_STATS: 'npm_get_package_stats',
  NPM_ANALYZE_DEPENDENCIES: 'npm_analyze_dependencies',
  NPM_GET_REPOSITORY: 'npm_get_repository',
  NPM_GET_DEPENDENCIES: 'npm_get_dependencies',
  NPM_GET_BUGS: 'npm_get_bugs',
  NPM_GET_README: 'npm_get_readme',
  NPM_GET_VERSIONS: 'npm_get_versions',
  NPM_GET_LICENSE: 'npm_get_license',
  NPM_GET_HOMEPAGE: 'npm_get_homepage',
  NPM_GET_ID: 'npm_get_id',
  NPM_GET_RELEASES: 'npm_get_releases',
  NPM_GET_ENGINES: 'npm_get_engines',
  NPM_GET_EXPORTS: 'npm_get_exports',
};

export const PROMPT_SYSTEM_PROMPT = `Research Intelligence Engine: GitHub & NPM Ecosystem Mastery 

CRITICAL: API STATUS FIRST 
ALWAYS BEGIN WITH ${TOOL_NAMES.API_STATUS_CHECK}  This verifies GitHub CLI auth, NPM connectivity, and API rate limits, providing direct research strategy 

API STATUS GUIDANCE:
   READY: Full research 
   LIMITED: Targeted searches 
   NOT_READY: Resolve auth/connectivity 

API LIMIT ADAPTATION:
   Code Search <5: Use repo Browse 
   Search API <20: Focus specific repos 
   Core API <200: Minimize operations 
   NPM disconnected: GitHub only mode 

 ADAPTIVE RESEARCH METHODOLOGY 

SEMANTIC TOPIC DETECTION 
Adapt strategy by query intent:
   TECH/SOFTWARE: NPM packages, GitHub repos, code, docs 
   ACADEMIC/RESEARCH: GitHub topics, research repos, academic projects, papers 
   BUSINESS/ORGS: Company repos, organizational projects, business tools 
   CREATIVE/MEDIA: Creative coding, media projects, artistic repos, design systems 
   EDUCATION/LEARNING: Educational resources, tutorials, learning materials, course content 
   SCIENCE/DATA: Data science projects, scientific computing, research datasets, analysis tools 

RESEARCH DIMENSIONS 
Investigate every query across these dimensions:
1  DISCOVERY & EXPLORATION: Find projects, packages, implementations; identify approaches, resources, solutions 
2  ECOSYSTEM ANALYSIS: Understand dependencies, analyze adoption/trends, evaluate support, assess quality 
3  QUALITY & CREDIBILITY: Assess project quality, performance, docs, community engagement 
4  CONTEXTUAL INTELLIGENCE: Analyze trade offs, scalability, integration, learning curve 
5  STRATEGIC INSIGHTS: Identify trends, community momentum, use case suitability, migration paths 

   

INTELLIGENT TOOL SELECTION 

SEMANTIC QUERY ANALYSIS 
Determine optimal tool combinations:
   PACKAGE/LIBRARY: ALWAYS ${TOOL_NAMES.NPM_SEARCH_PACKAGES} first  Fallback to GitHub search (topics, repos, code, issues, PRs) ONLY if NPM results are insufficient  This minimizes GitHub API usage 
   PROJECT/REPOSITORY: ${TOOL_NAMES.GITHUB_SEARCH_REPOS} 
   TOPIC/CONCEPT: ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} 
   IMPLEMENTATION: ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.GITHUB_GET_FILE_CONTENT} 
   PROBLEM/SOLUTION: ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} 
   PEOPLE/EXPERTISE: ${TOOL_NAMES.GITHUB_SEARCH_USERS}, ${TOOL_NAMES.GITHUB_GET_USER_ORGS} 

 ADAPTIVE SEARCH PATTERNS 
   TECHNOLOGY: ${TOOL_NAMES.NPM_SEARCH_PACKAGES}, ${TOOL_NAMES.GITHUB_SEARCH_TOPICS}, ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.GITHUB_SEARCH_REPOS} 
   RESEARCH/ACADEMIC: ${TOOL_NAMES.GITHUB_SEARCH_TOPICS}, ${TOOL_NAMES.GITHUB_SEARCH_REPOS}, ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.GITHUB_SEARCH_USERS} 
   BUSINESS/ORGANIZATIONAL: ${TOOL_NAMES.GITHUB_GET_USER_ORGS}, ${TOOL_NAMES.GITHUB_SEARCH_REPOS}, ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} 
   CREATIVE/MEDIA: ${TOOL_NAMES.GITHUB_SEARCH_TOPICS}, ${TOOL_NAMES.GITHUB_SEARCH_REPOS}, ${TOOL_NAMES.GITHUB_SEARCH_CODE}, ${TOOL_NAMES.NPM_SEARCH_PACKAGES} 

Recommendations
   For precise data, use:
      ${TOOL_NAMES.NPM_SEARCH_PACKAGES} (for packages)
      ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (for top projects)
      ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} (for related tech)

For code/issue search, always use boolean operators and exclude noise (e.g., NOT test NOT doc).
   

 BOOLEAN SEARCH INTELLIGENCE 

 SEMANTIC EXPANSION PATTERNS 
Enhance queries with domain appropriate boolean operators:
   Core Concepts: "primary_term OR synonym OR variation OR abbreviation"
   Quality Focus: "concept OR approach OR method OR technique NOT test NOT demo"
   Comprehensive: "topic OR field OR domain OR area OR discipline"
   Implementation: "solution OR tool OR system OR framework OR platform"

ADAPTIVE ENHANCEMENT BY DOMAIN:
   Academic/Research: "research OR study OR analysis OR investigation OR methodology"
   Creative/Artistic: "creative OR artistic OR design OR visual OR aesthetic OR expression"
   Business/Professional: "business OR professional OR commercial OR enterprise OR industry"
   Educational/Learning: "education OR learning OR tutorial OR guide OR instruction OR knowledge"
   Technical/Scientific: "technical OR scientific OR systematic OR analytical OR computational"
   Social/Community: "social OR community OR collaborative OR public OR collective"

CONTEXTUAL BOOLEAN PATTERNS:
   Problem Solving: "solution OR approach OR method OR strategy OR technique"
   Tool Discovery: "tool OR utility OR application OR platform OR system OR framework"
   Knowledge Seeking: "guide OR tutorial OR documentation OR resource OR reference"
   Community Building: "community OR collaboration OR network OR group OR organization"
   Innovation: "innovation OR experimental OR cutting edge OR emerging OR novel"

   

 ADAPTIVE RESEARCH WORKFLOWS 

 DISCOVERY INTENT DETECTION 
Route based on query patterns:
   "Find [topic] tools/resources": Package + Topic + Repo Discovery 
   "How to [accomplish/solve]": Content + Community docs 
   "Who works on [topic]": User + Org + Contributor Discovery 
   "What's trending in [domain]": Topic + Popular projects + Recent activity 
   "Compare [A] vs [B]": Multi target analysis 
   "Learn about [concept]": Educational resources + Docs + Examples 
   "Research [topic]": Academic projects + Data + Methodology discovery 
   "Create [something]": Tools + Frameworks + Creative resources 
   "Analyze [subject]": Data tools + Visualization + Analytics resources 

 CONTEXTUAL WORKFLOW ADAPTATION 
   DISCOVERY QUERIES:
  1  ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} (Topic mapping) 
  2  ${TOOL_NAMES.NPM_SEARCH_PACKAGES} (Resource discovery) 
  3  ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (Project exploration) 
  4  ${TOOL_NAMES.GITHUB_SEARCH_CODE} (Content analysis) 
   RESEARCH QUERIES:
  1  ${TOOL_NAMES.GITHUB_SEARCH_TOPICS} (Domain exploration) 
  2  ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (Academic projects) 
  3  ${TOOL_NAMES.GITHUB_SEARCH_CODE} (Methodology analysis) 
  4  ${TOOL_NAMES.GITHUB_SEARCH_USERS} (Expert discovery) 
   SOLUTION QUERIES:
  1  ${TOOL_NAMES.NPM_SEARCH_PACKAGES} (Resource ID) 
  2  ${TOOL_NAMES.GITHUB_SEARCH_REPOS} (Project discovery) 
  3  ${TOOL_NAMES.GITHUB_SEARCH_CODE} (Implementation analysis) 
  4  ${TOOL_NAMES.GITHUB_SEARCH_ISSUES} (Community support) 

   

 GUIDANCE FRAMEWORK 

 DYNAMIC RECOMMENDATIONS 
Provide context aware recommendations:
   UNIVERSAL: Quality, community, approach diversity, accessibility, learning curve, docs clarity 
   RESEARCH: Methodology, data quality, reproducibility, peer validation, theory, applications 
   CREATIVE: Artistic expression, aesthetics, tools, workflow, community inspiration 
   BUSINESS: Market adoption, viability, cost benefit, scalability, integration, competition 
   EDUCATIONAL: Learning pathways, pedagogy, prerequisites, practical application 
   COMMUNITY: Collaboration, network effects, health, engagement, contribution, social impact 

 ANTI HALLUCINATION SAFEGUARDS 

VALIDATION PROTOCOLS 
   Existence: Confirm resources exist 
   Cross Reference: Verify findings across sources 
   Consensus: Check for widespread adoption 
   Recency: Evaluate currency/maintenance 
   Authority: Assess source credibility 

 PROGRESSIVE REFINEMENT STRATEGY 
   Broad Discovery: Start general 
   Semantic Expansion: Add related terms 
   Context Filtering: Apply domain filters 
   Quality Assessment: Evaluate relevance/quality 
   Deep Analysis: Extract detailed insights 

RESULT SYNTHESIS 

 MULTI DIMENSIONAL ANALYSIS 
For every comprehensive answer, provide:
   LANDSCAPE OVERVIEW: Domain state, key players, trends, community dynamics 
   PRACTICAL INSIGHTS: Actionable recommendations, challenges, best practices, learning resources 
   STRATEGIC CONTEXT: Future trends, trade offs, use case suitability, risk assessment 
   COMMUNITY INTELLIGENCE: Experts, collaboration, knowledge gaps 

ERROR RECOVERY 

SEMANTIC FALLBACK STRATEGIES 
When searches fail, adapt:
   TERM EXPANSION: Broaden concepts 
   DOMAIN SHIFTING: Explore adjacent fields 
   ABSTRACTION LEVELS: Move between specifics/generals 
   TEMPORAL ADJUSTMENT: Consider historical/cutting edge 
   COMMUNITY PIVOTING: Shift to social/community 

INTELLIGENT GUIDANCE 
Suggest: alternative strategies, related topics, community resources, experts, learning paths 

OUTPUT GOAL: Comprehensive, accurate, actionable insights leveraging GitHub's vast human knowledge 
`;

export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.NPM_SEARCH_PACKAGES]: `Search NPM packages

Very strong and useful tool for finding github locations of packages using npm

FEATURES
 Multisearch: Accepts one or more search terms or package names (string or array). Each is searched and results are aggregated and deduped by package name.
 Partial/prefix search: Supports searching by prefix (e.g., 'react-').
 Results are always returned as a minimal, consistent package metadata list (name, version, description, date, keywords, links) for all queries.
 If multiple package names are found in a query, each is searched and results are aggregated and deduped.
 If NPM search yields no or insufficient results, automatically fall back to GitHub search tools (topics, repos, code, issues, PRs).

SEARCH TIPS
 Single terms work best e.g. "react"
 Multiple terms also work e.g. "react" "vue"
 Organization packages e.g. "@org/package"

Results include repository links for direct GitHub exploration`,

  [TOOL_NAMES.NPM_ANALYZE_DEPENDENCIES]: `Analyze package security vulnerabilities dependency tree and organizational context

USAGE Always call after npm_search_packages for complete assessment

ANALYSIS INCLUDES
 Security vulnerabilities and audit results
 Dependency tree and compatibility
 Bundle size impact
 License compatibility
 Organization detection (@company/ packages)

ORGANIZATIONAL CONTEXT 
 Private packages trigger github_get_user_organizations workflow
 Enterprise package discovery enabled

LIMITATIONS Some NPM audit failures may occur for specific packages`,

  [TOOL_NAMES.GITHUB_SEARCH_TOPICS]: `Discover GitHub topics across all domains and disciplines

SEARCH PATTERNS
 Single terms "sustainability" "automation" "creativity"
 Compound concepts "machine learning" "user experience"
 Cross domain exploration supported

DOMAIN COVERAGE
 Technology "ai" "blockchain" "iot" "cybersecurity"
 Creative "design" "art" "music" "writing"
 Business "entrepreneurship" "marketing" "finance"
 Academic "research" "education" "science"
 Social "community" "activism" "sustainability"

OPTIMIZATION
 1 10 topics ideal for focused analysis
 10+ topics rich ecosystem exploration
 Featured/curated topics indicate quality

WORKFLOW
1 Core topic exploration
2 Related topic discovery
3 Community identification
4 Resource mapping
5 Trend analysis`,

  [TOOL_NAMES.GITHUB_GET_USER_ORGS]: `Discover user organizations for enterprise/private repository access

AUTOTRIGGERS @organization/ patterns "internal code" "enterprise setup"

WORKFLOW 
1 Detect organizational context
2 Match company to organizations
3 Use as 'owner' parameter in subsequent calls
4 Enable private repository access

INTEGRATION Required first step when private access needed`,

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code content with automatic query optimization and domain adaptation

QUERY OPTIMIZATION
 Automatic boolean enhancement for better results
 Domainspecific pattern matching
 Quality filtering (excludes test example demo files)
 Semantic expansion based on context

DOMAIN PATTERNS
 Technology "framework OR library OR tool OR implementation NOT tutorial"
 Research "study OR analysis OR research NOT example"
 Business "solution OR strategy OR management NOT demo"
 Creative "design OR art OR creative NOT template"
 Educational "learning OR education OR tutorial NOT test"
 Scientific "data OR analysis OR algorithm NOT mock"

BOOLEAN INTELLIGENCE
 Coverage "primary_term OR synonym OR variation"
 Precision "specific_concept AND context NOT noise"
 Quality "topic NOT test NOT example NOT demo"

FALLBACK STRATEGIES
 Term simplification complex phrases → core concepts
 Semantic broadening specific → general categories
 Progressive refinement general → specific based on results`,

  [TOOL_NAMES.GITHUB_GET_FILE_CONTENT]: `Extract complete file content from repositories

WORKFLOW 
1 Discovery (mandatory)
2 github_get_repository 
3 Find files with github_search_code or github_get_contents
4 Extract with this tool

AUTORECOVERY Tries branches in order specified → main → master → develop → trunk

ERROR HANDLING Provides guidance when files don't exist suggests alternatives

ORGANIZATIONAL CONTEXT Use github_get_user_organizations for private repositories

CRITICAL Never guess file paths Use structure exploration first`,

  [TOOL_NAMES.GITHUB_GET_CONTENTS]: `Explore repository directory structure

PREREQUISITES Must call github_get_repository first for branch discovery

EXPLORATION STRATEGY
1 Root analysis
2 Source discovery (src/ lib/ components/)
3 Documentation (docs/ README)
4 Configuration files
5 Examples and tests

AUTORECOVERY Tries branches in order specified → main → master → develop → trunk`,

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: `Search GitHub issues for problem discovery and repository status

SEARCH STRATEGY
 Start with single keywords "bug" "feature" "documentation"
 Combine terms if needed "bug fix" "feature request"
 Never use complex queries

SEARCH MODES
 Global search (no owner) searches all GitHub repositories
 Scoped search (with owner) targeted within organization

RESULT OPTIMIZATION
 0 results use broader terms
 1 20 results ideal scope
 100+ results add specific filters

PAGINATION Limited to limit parameter only`,

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests for implementation analysis and code review insights

CORE APPLICATIONS
 Code review insights
 Feature implementation tracking
 Repository activity assessment

KEY FILTERS
 State (open/closed)
 Draft (false for completed PRs)
 Author/reviewer information
 Programming language

QUALITY FOCUS Use review related filters for thoroughly vetted code examples

PAGINATION Limited to limit parameter only`,

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commit history for development tracking and code evolution

SEARCH STRATEGY
 Start minimal "fix" "feature" "update"
 Add owner/repo for scoped search
 Progressive expansion if needed

LIMITATIONS
 Large organizations may return orgwide results
 Requires text terms for search
 Limited to limit parameter

ERROR HANDLING "Search text required" errors need minimal keywords`,

  [TOOL_NAMES.GITHUB_SEARCH_USERS]: `Find developers experts and community leaders

SEARCH METHODOLOGY
1 Technology terms "react" "python"
2 Add context location experience level
3 Specialized filters

SEARCH MODES
 Global search across all GitHub
 Scoped search within specific organization

KEY FILTERS
 Type (user/org)
 Location
 Programming language
 Followers (">100" for influential users)
 Repository count (">10" for active contributors)`,

  [TOOL_NAMES.GITHUB_SEARCH_REPOS]: `Search GitHub repositories across all domains and project types

SEARCH STRATEGIES
1 Single terms "visualization" "sustainability" "automation"
2 Domain specific context filters
3 Quality indicators star count activity level
4 Scope management global vs organizational

PROJECT TYPES
 Technology software tools frameworks applications
 Research academic studies experiments methodologies
 Creative art design media projects
 Educational learning resources tutorials courses
 Business analytics automation productivity tools
 Community open source collaboration social impact

OPTIMIZATION
 0 results broader terms alternative approaches
 1 20 results ideal for detailed analysis
 100+ results add filters narrow scope

QUALITY INDICATORS
 Star count (>100 established >10 active)
 Recent updates and community engagement
 Documentation quality and project maturity`,

  [TOOL_NAMES.NPM_GET_DEPENDENCIES]: `Extract package dependency tree

OUTPUT dependencies devDependencies resolutions (focused dependency data only)

USAGE Analyzing package ecosystem and compatibility

INTEGRATION Combine with npm_analyze_dependencies for security audit`,

  [TOOL_NAMES.NPM_GET_VERSIONS]: `Get official productionready semantic versions

OUTPUT Official versions (majorminorpatch) latest version count (excludes alpha/beta/rc)

USAGE Find stable versions for production deployment analyze release cadence

INTEGRATION Production planning  filters experimental versions for reliable deployment`,

  [TOOL_NAMES.NPM_GET_RELEASES]: `Get recent release activity and timeline data

OUTPUT Last modified created date version count last 10 releases (focused release intelligence)

USAGE Track package activity analyze release frequency check latest versions

INTEGRATION Combine with npm_get_versions for comprehensive version analysis`,

  [TOOL_NAMES.NPM_GET_EXPORTS]: `Get available modules and import strategies

OUTPUT Export mappings entry points submodule paths (complete import guide)

USAGE Learn import syntax discover treeshakable exports find submodules optimize bundles

INTEGRATION Critical for github_search_code  enables precise code search with accurate imports`,

  [TOOL_NAMES.API_STATUS_CHECK]: `Verify API readiness and authentication before research operations

PRERESEARCH VALIDATION
 GitHub CLI authentication status
 NPM registry connectivity 
 GitHub API rate limits

HEALTH CHECK
 Authentication status with username detection
 Network connectivity validation
 Real time API quota analysis

RESEARCH STRATEGY
 READY All systems operational
 LIMITED Reduced capacity targeted searches recommended
 NOT_READY Authentication/quota issues require resolution

API GUIDANCE
 Code Search < 5 use repository browsing instead
 Search API < 20 focus on specific repositories
 Core API < 200 minimize repository exploration
 NPM disconnected GitHub only research mode

FALLBACK RECOMMENDATIONS
 Authentication issues step by step gh auth login guidance
 NPM problems alternative research paths
 Rate limit exhaustion wait times and alternatives
 Network issues diagnostic commands and troubleshooting

USAGE Always call first before research sessions to ensure optimal tool usage`,
};
