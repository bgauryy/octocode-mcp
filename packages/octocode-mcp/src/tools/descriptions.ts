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
- Use github_view_repo_structure or github_search_code FIRST to find correct file paths
- File paths must be verified from actual repository structure or search results

HINTS:
- ALWAYS use github_view_repo_structure tool first to explore repository and find correct file paths
- Use github_search_code to discover relevant files before fetching their content
- Fetch content in a smart way (token efficient while getting the most relevant context)
- Combine with search and structure tools after fetching for discovery and better research context
- Quality data should be fetched for better research context`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search code

GOAL:
Find relevant content for research context

FEATURES:
- GitHub search API
- Bulk queries for comprehensive technique discovery

HINTS:
- SIMPLE queryTerms: Use up to 3 focused terms per query for best results
- AVOID multi-word patterns on exploratory research - they reduce result quality significantly
- Each bulk query should target different aspects
- Use separate queries rather than cramming multiple concepts into one
- ALWAYS fetch quality results for better research context
- Get relevance of results by its content and its path
- Search more if needed by given results`,
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
};
