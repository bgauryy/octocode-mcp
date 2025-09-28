import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `#Fetch file content

#GOAL:
- Get quality context for research
- Get implementation details from real code, docs, and config files

#FETCHING FEATURES:
- fullContent
- startLine + endLine for specific line range
- matchString + matchStringContextLines for pattern-based extraction (used with ${TOOL_NAMES.GITHUB_SEARCH_CODE} tool)

#MUST:
- VERIFY path before fetching using other tools (e.g. ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} and ${TOOL_NAMES.GITHUB_SEARCH_CODE}). DO NOT HALLUCINATE

#HINTS:
- Combine with search and structure tools after fetching for discovery and better research context
- Quality data should be fetched for better research context`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `#Search code

#GOAL:
Find relevant content for research context

#FEATURES:
GitHub search API, search several queries at once

FILTERING:
- filename: Filter by patterns (e.g., "*.js", "App.js") - searches across all directories
- path: Filter by location (e.g., "src/components", "test") - searches within specific paths
- match: Control search scope - "file" (default, searches content) or "path" (searches in filenames/paths)

HINTS:
- SIMPLE keywordsToSearch: Use up to 3 focused one word terms per query for best results
- AVOID complex keywords and terms on exploratory research 
- Use separate queries rather than cramming multiple concepts into one query
- ALWAYS fetch quality results for better research context
- Get relevance of results by its content and its path
- Search more if needed for better context`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `#Search repositories

#GOAL:
Find repositories for research

#FEATURES:
GitHub search API, search several queries at once

#HINTS:
- Use match parameter to reduce noise and focus results
- Combine filters for targeted discovery
- Popular repos (high stars) often have better examples`,
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: `#Explore repository structure

#GOAL:
Understand repository structure for better research context

#FEATURES:
GitHub search API, search several queries at once

#HINTS:
- Start with root path, use specific paths for focus
- Use findings to guide other tools for more research context
- Use to understand repository structure and more relevant files`,
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
