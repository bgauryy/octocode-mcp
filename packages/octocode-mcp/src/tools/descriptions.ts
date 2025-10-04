import { TOOL_NAMES } from '../constants.js';

// each tool has the XML structure below
// <tool goal="Retrieve file content">
// <behavior>
// - Modes: fullContent=true | startLine+endLine | matchString+matchStringContextLines
// </behavior>
// <must_have>
// - Required: owner, repo, path (MUST exist - verify first with ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE})
// </must_have>
// <best_practices>
// - Prefer partial reads for efficiency
// - Use matchString from code search text_matches
// </best_practices>
// <workflow>
// Search code → Fetch content
// View structure → Fetch content
// </workflow>
// <examples>
// # Line range - get partial content of package.json (10 lines)
// owner="facebook", repo="react", path="package.json", startLine=1, endLine=10
// # Match string - get content around specific pattern with context lines (3 LINES OF CONTEXT ABOVE AND BELOW THE MATCH STRING)
// owner="facebook", repo="react", path="packages/react/index.js", matchString="export type ElementType", matchStringContextLines=3
// # Full file content - get entire content of LICENSE
// owner="facebook", repo="react", path="LICENSE", fullContent=true
// </examples>
// </tool>
export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `<tool goal="Retrieve file content">

<behavior>
- Modes: fullContent=true | startLine+endLine | matchString+matchStringContextLines
</behavior>

<must_have>
- Required: owner, repo, path (MUST exist - verify first with ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE})
</must_have>

<best_practices>
- Prefer partial reads for efficiency
- Use matchString from code search text_matches
</best_practices>

<workflow>
Search code → Fetch content
View structure → Fetch content
</workflow>

<examples>
# Line range - get partial content of package.json (10 lines)
owner="facebook", repo="react", path="package.json", startLine=1, endLine=10

# Match string - get content around specific pattern with context lines (3 LINES OF CONTEXT ABOVE AND BELOW THE MATCH STRING)
owner="facebook", repo="react", path="packages/react/index.js", matchString="export type ElementType", matchStringContextLines=3

# Full file content - get entire content of LICENSE 
owner="facebook", repo="react", path="LICENSE", fullContent=true

# Branch-specific content - get content from specific branch
owner="facebook", repo="react", path="package.json", branch="main", startLine=1, endLine=10
</examples>
</tool>`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `<tool goal="Search file content or filenames/paths using keywords">
<behavior>
- Two modes: match='file' (content search, default) or match='path' (filename/directory search)
</behavior>
<best_practices>
- Use match='path' for discovery, match='file' for implementation details
- Leverage bulk queries for efficient research workflows
</best_practices>
<workflow>
Search repos → Search code # for searching terms and paths for discovery
Search code → Search code # deeper/broader discovery
Fetch content → Search code # for more details
View structure → Search code # for deeper/broader discovery
</workflow>
<examples>
# Find patterns across all public repositories - basic keyword search
keywordsToSearch=["term1", "term2"]

# Find implementations in a specific repository - repository-scoped search
owner="ownerName", repo="repoName", keywordsToSearch=["term1", "term2"]

# Discover file organization - path discovery mode
match="path", keywordsToSearch=["term1", "term2"] 

# Find code in specific directories and file types
keywordsToSearch=["term1", "term2"], path="src/utils", extension="ts" 

# Explore repository file structure - repository path search
owner="ownerName", repo="repoName", match="path", keywordsToSearch=["term1"]

# Find code with multiple filters  - precision multi-filter search
owner="ownerName", repo="repoName", keywordsToSearch=["term1"], path="src", extension="ts"

# Find patterns in specific file types - extension-filtered search
keywordsToSearch=["term1", "term2"], extension="js"

# Find complete implementations - multi-keyword search (AND logic in file search)
keywordsToSearch=["term1", "term2", "term3"], extension="jsx"

# Find code in specific directories - path-scoped search (AND logic in file search)
path="src/api", keywordsToSearch=["term1", "term2"]

# Find configuration patterns - filename-filtered search (AND logic in file search)
filename="config", keywordsToSearch=["term1", "term2"]

# Find patterns in popular repositories
keywordsToSearch=["term1", "term2"], stars=">1000"

# Find specific file patterns - complex nulti-filter combination (AND logic in file search)
filename="package.json", keywordsToSearch=["term1", "term2"], extension="json"

# Limit search results - get only top 10 most relevant matches
keywordsToSearch=["useState"], owner="facebook", repo="react", limit=10
</examples>
</tool>`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `<tool goal="Search repositories by keywords, topics, or filters">
<behavior>
- Two search modes: keywordsToSearch (text) or topicsToSearch (GitHub topics)
- keywordsToSearch: searches name, description, readme content (broader)
- topicsToSearch: searches official GitHub topics (more precise, curated)
</behavior>

<best_practices>
- Use topicsToSearch for categories: ["machine-learning", "typescript"]
- Use keywordsToSearch for functionality: ["react", "hooks"]
- Add stars filter for quality filtering
- Combine filters for precision
</best_practices>

<workflow>
Search repos → view structure / search code / fetch content
</workflow>

<examples>
# Keywords search - searches name, description, readme content
keywordsToSearch=["react", "hooks"], stars=">1000"

# Topics search - searches official GitHub topics (more precise)
topicsToSearch=["machine-learning", "deep-learning"]

# Owner-scoped search - find repositories from specific organization
owner="microsoft", keywordsToSearch=["typescript"]

# Quality filtering - high-starred repositories sorted by popularity
keywordsToSearch=["javascript", "framework"], stars=">5000", sort="stars"

# Recent projects - repositories created in current year
keywordsToSearch=["ai", "agent"], created=">=2024-01-01"

# Small repositories - lightweight projects under 1MB
keywordsToSearch=["utility", "helper"], size="<1000"

# Name-only search - search repository names specifically
keywordsToSearch=["javascript"], match=["name"], limit=5

# Recently active - sort by last update for active projects
keywordsToSearch=["llm"], sort="updated"
</examples>
</tool>`,
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: `<tool goal="Explore repository structure by path and depth">

<behavior>
- Depth: 1 (current dir) or 2 (with subdirs)
</behavior>
<must_have>
- Validate paths before fetching content
</must_have>

<workflow>
Search repos → View structure (root) → View structure (subdirs) → Search code / Fetch content
Search code → View structure (from specific path) → Fetch content
</workflow>

<examples>
# React repository root (root) - get all files and folders depth 1 to the root
owner="facebook", repo="react", branch="main", path="", depth=1 

# React packages deep exploration (depth 2 to the packages)
owner="facebook", repo="react", path="packages", branch="main", depth=2

# Specific directory deep dive (depth 2 to the specific path)
owner="facebook", repo="react", path="packages/react", branch="main", depth=2
</examples>
</tool>`,
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `<tool intent="Search pull requests">
<goal>
Search PRs or fetch specific PR by number with filtering
</goal>

<features>
- Two modes: search (filters) or direct fetch (prNumber, fastest)
- Filters: state, author, labels, branches, dates, engagement
- Optional: withComments (threads), withContent (diffs) - token expensive
- Match: title, body, comments
- Sort: created, updated, best-match
</features>

<behavior>
- Direct: prNumber + owner/repo (single PR)
- Search: owner/repo + filters (multiple PRs)
- Limit: 1-100 (default 30), order: asc/desc (default desc)
- withComments/withContent default false (expensive)
</behavior>

<best_practices>
- Use prNumber for direct access (fastest)
- Filter: state="open" (active) or state="closed"+merged=true (merged)
- Use author/label for specific work areas
- Enable withContent only for implementation analysis
- Enable withComments for discussion context
</best_practices>

<workflow>
Search repos → Search PRs → Fetch changed files / Search code
</workflow>

<examples>
# Direct PR fetch
prNumber=31813, owner="facebook", repo="react" # Result: "[compiler][ez] Add validation for auto-deps config" by jbrown215, merged on 03/03/2025

# Recent open PRs
owner="facebook", repo="react", state="open", limit=2 # Result: Found PR #34732 "Update README.md" and #34728 "chore(reconciler): fix minor comment typos"

# Author-specific PRs
owner="facebook", repo="react", author="rickhanlonii" # Result: Found 350 total PRs, including #34718 "test transition tracing" and #34476 "move devtools notify"

# PR with content analysis
prNumber=31813, owner="facebook", repo="react", withContent=true # Gets PR details plus file changes and diffs for implementation analysis

# Filtered PR search
owner="facebook", repo="react", state="closed", merged=true, limit=3 # Finds recently merged PRs with implementation details
</examples>
</tool>`,
};
