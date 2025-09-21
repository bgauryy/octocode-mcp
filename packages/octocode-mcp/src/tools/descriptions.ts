import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `Fetch file content

GOAL:
Get implementation details from real code, docs, and config files.

FEATURES:
- Fetching types: fullContent, specific line range (startLine+endLine), pattern-based extraction (matchString+matchStringContextLines)
- Bulk queries for comparative analysis across files

MUST:
- Verify path before fetching (do not hallucinate)

HINTS:
- Fetch content in a smart way (token efficient while getting the most relevant context)
- Combine with search and strcuture tools after fetching for discovery and better research context
- Quality data should be fetched for better research context`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code

GOAL:
Find relevant content for research context

FEATURES:
- GitHub search API
- Bulk queries for comprehensive technique discovery

HINTS:
- TECHNICAL Search query: use queryTerms with Code patterns and specific terms for targeting
- SEMANTIC Search query: use queryTerms with Natural language for exploration
- Each query on bulk should search different part of research
- ALWAYS fetch quality results for better research context`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `Search repositories

GOAL:
Find repositories for research

FEATURES:
- GitHub search API
- Bulk queries
- Two complementary search approaches: queryTerms AND topics

SEARCH STRATEGY:
- queryTerms: Use for SPECIFIC keyword searches
- topics: Use for GITHUB TOPIC exploration
- CRITICAL: For exploratory research, ALWAYS use BOTH approaches in different queries

HINTS:
- MANDATORY for exploration: Mix queryTerms and topics queries in bulk operations
- queryTerms queries: Target specific repo
- topics queries: Discover via GitHub repository topics 
- Each query in bulk MUST use different approach (queryTerms and topics)
- NEVER use only queryTerms OR only topics - combine both for comprehensive coverage
- Prefer popular and updated repositories in results
`,
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: `Explore repository structure

GOAL:
Understand repository structure for better research context

FEATURES:
- GitHub API structure exploration with bulk queries
- Depth control for performance
- File/folder filtering options

HINTS:
- Start with root path, use specific paths for focus
- Use bulk queries for comprehensive mapping
- Use findings to guide targeted searches/fetches
- Clean results with filtering options`,
  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: `Search commits

GOAL:
Track code evolution, changes, and development patterns.

FEATURES:
- Commit search by message/author/date/repo with bulk queries
- Date range filtering (author-date, committer-date)
- Optional diff content (WARNING: token expensive)

HINTS:
- Use queryTerms for commit message keywords
- Filter by author/author-date for developer analysis
- Use date ranges with operators for time filtering
- Use bulk queries for comprehensive analysis`,
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search pull requests

GOAL:
Understand code reviews, features, and development workflows.

FEATURES:
- PR search by state/author/labels with bulk queries
- Direct PR fetching by number (prNumber + owner/repo)
- Optional comments/diffs (WARNING: token expensive)

HINTS:
- Use prNumber for direct PR access (most efficient)
- Filter by state/review status for targeted results
- Use query for PR content search, not title matching
- Use bulk queries for comprehensive analysis`,
  [TOOL_NAMES.PACKAGE_SEARCH]: `Search packages

GOAL:
Discover NPM/Python packages with metadata and repository links.

FEATURES:
- Multi-ecosystem search (NPM + Python) with bulk queries
- Rich metadata with GitHub repository links
- Configurable search strategies and limits

HINTS:
- Search by functionality rather than exact names
- Use bulk queries for comparing alternatives
- Configure metadata fetching as needed
- Combine with GitHub tools for package→code analysis`,
};
