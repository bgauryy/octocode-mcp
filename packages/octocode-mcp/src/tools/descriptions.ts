import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `FILE READER - Read file contents with smart extraction

PURPOSE: Read file contents using patterns, line ranges, or full file mode

USE_WHEN: Have file path | After ${TOOL_NAMES.GITHUB_SEARCH_CODE}/${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} discovery
AVOID: Unknown location - search first

WORKFLOW:
  Step 1: Discovery (${TOOL_NAMES.GITHUB_SEARCH_CODE}/${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE})
  Step 2: Read (matchString or line range)
  Step 3: Explore related patterns

MODES:
  - matchString + matchStringContextLines: Extract specific sections [85% token savings]
  - startLine + endLine: Read line range
  - fullContent: Read entire file

OPTIMIZATION:
  - matchString: 85% token savings
  - Bulk queries: 5-10x faster
  - minified=true (default): 30-60% savings

GOTCHAS:
  - minified=true breaks JSON/YAML formatting
  - matchString returns empty if no matches
  - Large files may be truncated

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_SEARCH_CODE} for related patterns
  empty → ${TOOL_NAMES.GITHUB_SEARCH_CODE}/${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to locate file

EXAMPLES:
  matchString="validateUser", matchStringContextLines=20  # BEST: targeted read
  startLine=1, endLine=100  # Line range
  fullContent=true  # Full file
  queries=[{path:"a.ts",matchString:"fn1"},{path:"b.ts",matchString:"fn2"}]  # Bulk
  path="config.json", fullContent=true, minified=false  # Config file, keep formatting

GUARDS:
  config? - minified=false | know pattern? - matchString | large file? - use line range | efficiency? - prefer startLine/endLine over fullContent, justify range in reasoning`,
  [TOOL_NAMES.GITHUB_SEARCH_CODE]: `CODE SEARCH - Search file content or filenames/paths

PURPOSE: Search file contents for code patterns or search file/directory names

USE_WHEN: Know patterns | Need discovery
AVOID: Broad terms | No owner/repo (rate limits)

WORKFLOW:
  Step 1: Discovery (match="path") - Find files [25x faster]
  Step 2: (Optional) Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to understand structure when exploring unfamiliar repos
  Step 3: Detailed (match="file", limit=5) - Get matches with context
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT} matchString) - Full content

MODES:
  - match="file": Search IN content → returns text_matches[]
  - match="path": Search filenames/dirs → 25x faster

FILTERS:
  - owner/repo: Repository scope (RECOMMENDED)
  - path: Directory scope
  - extension: File type
  - stars: Popular repos only

OPTIMIZATION:
  - match="path": 20 tokens vs 500 with text_matches
  - Bulk queries: 5-10x faster
  - limit=5-10: Focused results
  - Specific keywords over generic terms

GOTCHAS:
  - keywordsToSearch uses AND logic
  - match="file" without limit = token explosion
  - No owner/repo = rate limits
  - text_matches → use for ${TOOL_NAMES.GITHUB_FETCH_CONTENT} matchString

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_FETCH_CONTENT} matchString for full context
  empty → ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or broaden search

EXAMPLES:
  match="path", keywordsToSearch=["auth"]  # Fast: find files with "auth" in path
  owner="facebook", repo="react", keywordsToSearch=["useState"]  # Content search
  path="src/api", extension="ts", keywordsToSearch=["export", "function"]  # Precise
  queries=[{keywordsToSearch:["termExample"],match:"path"},{keywordsToSearch:["patternExample"],match:"file",limit:5}]  # Bulk: combine discovery + detailed search
  keywordsToSearch=["validateUser"], match="file", limit=5  # Detailed matches

GUARDS:
  discovery? - match="path" | many results? - limit=5-10 | no scope? - add owner/repo`,
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: `REPOSITORY SEARCH - Search repos by keywords/topics

PURPOSE: Discover GitHub repositories. Gateway for codebase exploration.

USE_WHEN: Starting research | Finding projects/libraries
AVOID: Know repo name - go to ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} | Need code patterns - use ${TOOL_NAMES.GITHUB_SEARCH_CODE}

WORKFLOW:
  Step 1: Discover (topicsToSearch or keywordsToSearch)
  Step 2: Explore (${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE})
  Step 3: Search (${TOOL_NAMES.GITHUB_SEARCH_CODE})
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT})

MODES:
  - topicsToSearch: ["typescript", "cli"] - curated, exact topic tags (BEST)
  - keywordsToSearch: ["term1", "term2"] - name/desc/README, AND logic

FILTERS:
  - stars=">1000": Quality filter
  - owner: Scope to org/user
  - created/updated: Date filters (">=YYYY-MM-DD")
  - match=["name"]: Search scope

OPTIMIZATION:
  - topicsToSearch: Most precise
  - stars=">1000": Quality filter
  - sort="stars": Popular repos
  - limit=5-10: Focused results
  - Bulk queries: Parallel searches

GOTCHAS:
  - keywordsToSearch uses AND logic
  - topicsToSearch needs exact tags
  - size in KB not MB ("1000" = 1MB)
  - No filters = generic results

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE}
  empty → Broaden filters or try synonyms

EXAMPLES:
  topicsToSearch=["typescript", "cli"], stars=">1000"  # BEST: curated quality repos
  keywordsToSearch=["authentication", "jwt"], stars=">500"  # Keyword search with quality
  owner="facebook", sort="stars", limit=10  # Org's popular repos
  keywordsToSearch=["react"], match=["name"], stars=">1000"  # Name-only search
  created=">=2024-01-01", sort="updated", limit=5  # Recent active projects
  queries=[{topicsToSearch:["mcp"]},{keywordsToSearch:["mcp"]}]  # Bulk parallel

GUARDS:
  discovery? - topicsToSearch+stars | quality? - stars=">1000" | maintained? - updated filter`,
  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: `DIRECTORY EXPLORER - Understand codebase organization

PURPOSE: Display directory structure with file sizes

USE_WHEN: New codebase | Need structure overview
AVOID: Know filename - use ${TOOL_NAMES.GITHUB_SEARCH_CODE} | Need content - use ${TOOL_NAMES.GITHUB_FETCH_CONTENT}

WORKFLOW:
  Step 1: Overview (depth=1, path="")
  Step 2: Drill down (depth=2, path="src")
  Step 3: Search (${TOOL_NAMES.GITHUB_SEARCH_CODE})
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT})

OPTIONS:
  - depth: 1 (fast) or 2 (includes subdirs)
  - path: "" (root) or "src/api" (specific dir)
  - branch: "main" or branch/tag/SHA

OPTIMIZATION:
  - depth=1 first, drill down later
  - Bulk queries: Parallel exploration
  - Use for discovery, then ${TOOL_NAMES.GITHUB_SEARCH_CODE} for content

GOTCHAS:
  - depth=2 on large dirs = slow
  - path no leading slash: "src/api" not "/src/api"
  - Returns files[] and folders[], no content
  - >100 files may truncate

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_SEARCH_CODE} or ${TOOL_NAMES.GITHUB_FETCH_CONTENT}
  empty → Check parent or verify repo

EXAMPLES:
  owner="facebook", repo="react", branch="main", path="", depth=1  # Root overview
  owner="facebook", repo="react", branch="main", path="src", depth=2  # Deep dive
  queries=[{owner:"facebook",repo:"react",branch:"main",path:""},{owner:"facebook",repo:"react",branch:"main",path:"src"}]  # Bulk
  owner="facebook", repo="react", branch="main", path="packages/react-dom", depth=1  # Monorepo

GUARDS:
  new? - depth=1, path="" | large? - depth=1 first | monorepo? - explore each package`,
  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: `PR SEARCH - Search or fetch PRs

PURPOSE: Search/fetch PRs with metadata, discussions, and diffs

USE_WHEN: Need PR context | Research implementations | Review merged changes
AVOID: Need current code - use ${TOOL_NAMES.GITHUB_FETCH_CONTENT} | Need all patterns - use ${TOOL_NAMES.GITHUB_SEARCH_CODE}

WORKFLOW:
  Step 1: Discover (prNumber or search filters)
  Step 2: Analyze (withComments/withContent)
  Step 3: Compare (${TOOL_NAMES.GITHUB_FETCH_CONTENT} for current state)

MODES:
  - prNumber=123: Direct fetch (10x faster)
  - Search: state/author/labels/dates filters

FILTERS:
  - state="open"|"closed": PR status
  - merged=true: Production code (with state="closed")
  - author/label/query: Filter criteria
  - created/updated/closed: Date filters
  - comments/reactions: Engagement filters

OPTIMIZATION:
  - prNumber: 10x faster
  - state="closed"+merged=true: Production only
  - limit=3-5: Focused results
  - withComments=false: 50% token savings
  - withContent=false: 80% token savings
  - Bulk queries: Parallel analysis

GOTCHAS:
  - withContent=true = VERY token expensive
  - withComments=true = token expensive
  - merged=true requires state="closed"
  - label can be string or array (OR logic)
  - prNumber ignores other filters

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for current code or ${TOOL_NAMES.GITHUB_SEARCH_CODE} for patterns
  empty → Broaden filters or try different state

COMMON PATTERNS:
  - Research implementations: state="closed", merged=true, withContent=true
  - Track discussions: state="open", withComments=true, limit=5
  - Find expert contributions: author="username", state="closed", merged=true

EXAMPLES:
  owner="facebook", repo="react", prNumber=123  # FASTEST: direct fetch
  owner="facebook", repo="react", state="open", limit=5  # Recent open PRs
  owner="facebook", repo="react", state="closed", merged=true, limit=5  # Production code
  owner="facebook", repo="react", author="username", label="bug"  # Author's bug fixes
  owner="facebook", repo="react", query="authentication", match=["title", "body"]  # Text search
  owner="facebook", repo="react", prNumber=123, withContent=true  # PR with diffs
  owner="facebook", repo="react", prNumber=123, withComments=true  # PR with discussions
  queries=[{owner:"facebook",repo:"react",prNumber:123},{owner:"vercel",repo:"next.js",prNumber:456}]  # Bulk

GUARDS:
  code analysis? - withContent=true | context? - withComments=true | production? - state="closed"+merged=true`,
};
