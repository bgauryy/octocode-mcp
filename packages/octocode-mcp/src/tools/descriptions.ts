import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `Retrieve file content

Modes: fullContent | startLine+endLine | matchString+matchStringContextLines
Required: path (verify with ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE})
Best: Partial reads, matchString from code search  (From text_matches)
Workflow: Search code/View structure → Fetch content

Examples:
# Line range
startLine=1 endLine=10

# Match string (5 lines context above/below specific string) - usually used after ${TOOL_NAMES.GITHUB_SEARCH_CODE} for more context on relevant lines
matchString="some string to find" matchStringContextLines=5

# Branch-specific
branch="main"`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `Search file content or filenames/paths using keywords

Modes: match='file' (content, default) or match='path' (filenames/dirs)
- match='file': Search IN content → returns files[{path, text_matches[]}] - DEFAULT
- match='path': Search filenames/dirs → returns files[{path}] only
Best: Path for discovery, file for details. Bulk queries for efficiency. Search specific patterns and semantic 
Workflow: Search repos/code/View structure → Search code → Fetch content

Examples:

# Basic content search (default)
keywordsToSearch=["term1", "term2"]

# Path discovery (find files by name)
match="path", keywordsToSearch=["term1", "term2"]

# Repository-scoped search
owner="facebook", repo="react", keywordsToSearch=["term1", "term2"]

# Directory-scoped search (content in specific folder)
path="src/api", keywordsToSearch=["function", "export"]

# Filename filter (content in files matching name pattern)
filename="config", keywordsToSearch=["term1", "term2"]

# Combined filters (directory + extension + content)
path="src/utils", extension="ts", keywordsToSearch=["term1", "term2"]

# Multi-keyword AND logic
keywordsToSearch=["term1", "term2", "term3"]

# Popular repos
keywordsToSearch=["term1", "term2"], stars=">1000"

# Limit results
keywordsToSearch=["term1", "term2"], limit=10`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `Search repositories by keywords, topics, or filters

Modes: keywordsToSearch (name/desc/readme, broader) OR topicsToSearch (GitHub topics, precise, BEST FOR EXPLORATION)
Best: Topics for discovery, keywords for specific functionality, stars for quality
Workflow: Search repos → View structure/Search code/Fetch content

Examples:

# Topics search (best for discovery - returns curated repos)
topicsToSearch=["topic1", "topic2"]

# Keywords with quality filter
keywordsToSearch=["term1", "term2"], stars=">1000"

# Owner-scoped search (repos from specific org/user)
owner="ownerName", keywordsToSearch=["term1", "term2"]

# Name-only search (keyword in repo name only)
keywordsToSearch=["term1", "term2"], match=["name"]

# Sort by popularity
stars=">1000", sort="stars"

# Recent repos
keywordsToSearch=["term1", "term2"], created=">=YYYY-MM-DD"

# Recently updated (active development)
keywordsToSearch=["term1", "term2"], sort="updated", updated=">=YYYY-MM-DD"

# Limit results
keywordsToSearch=["term1", "term2"], limit=5`,
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: `Explore repository structure by path and depth

Depth: 1 (current dir only) or 2 (includes subdirs). Returns files[] and folders[]
Best: Use to discover paths before fetching content or searching code
Workflow: Search repos → View structure → Search code/Fetch content

Examples:

# Root exploration (depth 1 - files/folders in root)
owner="ownerName", repo="repoName", branch="main", path="", depth=1

# Directory with subdirs (depth 2 - includes nested structure)
owner="ownerName", repo="repoName", branch="main", path="src", depth=2`,
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `Search PRs or fetch specific PR by number

Modes: Direct fetch (prNumber) or Search (filters). Returns pull_requests[] with metadata
Filters: state, author, labels, branches, dates, query. Sort: created/updated/best-match. Limit 1-10 (default 5)
Optional: withComments (discussion threads), withContent (code diffs) - token expensive
Best: prNumber for direct access, state="open"|"closed"+merged=true for production code
Workflow: Search repos → Search PRs → Analyze changes/discussions

Examples:

# Direct PR fetch (fastest)
prNumber=123, owner="ownerName", repo="repoName"

# Recent open PRs
owner="ownerName", repo="repoName", state="open", limit=5

# Merged PRs (production code)
owner="ownerName", repo="repoName", state="closed", merged=true

# Filter by author/label
owner="ownerName", repo="repoName", author="username", label="bug"

# Search by text
owner="ownerName", repo="repoName", query="term1", match=["title", "body"]

# With implementation details (diffs)
prNumber=123, owner="ownerName", repo="repoName", withContent=true

# With discussion context (comments)
prNumber=123, owner="ownerName", repo="repoName", withComments=true`,
};
