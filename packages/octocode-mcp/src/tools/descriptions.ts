import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `#Fetch file content

#GOAL:
- Get quality context for research
- Get implementation details from real code, docs, and config files

#FETCHING FEATURES:
- fullContent - return entire file
- startLine + endLine for specific line range (token efficient)
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
- Use Filters for targeted search (by scheme)

HINTS:
- keywordsToSearch: Use up to 3 focused one word terms per query for best results
- AVOID complex keywords and terms on exploratory research 
- Use separate queries for separate search goals
- fetch quality results for better research context
- Get relevance of results by its content and its path
- Search more if needed for better context`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `#Search repositories

#GOAL:
Find repositories for research by keywords and topics

#FEATURES:
GitHub search API, search several queries at once

#HINTS:
- Use topicsToSearch for discovery by categories / github topics
- Use filters for targeted discovery
- Popular repos (high stars) often have better examples
- Repositories from topics search should be verified for relevance using reasoning and content`,
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
