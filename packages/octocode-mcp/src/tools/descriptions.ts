import { TOOL_NAMES } from '../constants.js';

export const DESCRIPTIONS = {
  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: `FILE READER - Read file contents with smart extraction

PARAMS: See schema for parameter details

PURPOSE: Read file contents using patterns, line ranges, or full file mode

USE_WHEN: Have file path | After ${TOOL_NAMES.GITHUB_SEARCH_CODE}/${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} discovery
AVOID: Unknown location - search first

WORKFLOW:
  Step 1: Discovery (${TOOL_NAMES.GITHUB_SEARCH_CODE}/${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE})
  Step 2: Read (matchString or line range)
  Step 3: Explore related patterns

STRATEGY (choose based on what you know):
  - matchString: Know function/class/pattern name → start here [most efficient]
  - startLine + endLine: Know location from prior search → precise extraction
  - fullContent: Need entire file → use ONLY for small files (<500KB)

OPTIMIZATION:
  - Start lean: Single matchString query first
  - If related context needed: Bulk queries for multiple files (e.g., auth.ts + user.ts + session.ts in parallel)

GOTCHAS:
  - minified=true breaks JSON/YAML formatting → use minified=false for config files
  - matchString returns empty if no matches → try broader pattern or use fullContent
  - Files >500KB: MUST use matchString or line ranges, fullContent will truncate

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

PARAMS: See schema for parameter details

PURPOSE: Search file contents for code patterns or search file/directory names

USE_WHEN: Know patterns | Need discovery
AVOID: Broad terms | No owner/repo (rate limits)

WORKFLOW:
  Step 1: Discovery (match="path") - Find files [fastest, most token efficient]
  Step 2: (Optional) Use ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} to understand structure when exploring unfamiliar repos
  Step 3: Detailed (match="file", limit=5) - Get matches with context
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT} matchString) - Full content

STRATEGY:
  - match="path": Fast discovery, returns paths only
  - match="file": Detailed search, returns text_matches[] with context
  - Always scope: owner/repo to avoid rate limits

OPTIMIZATION:
  - Start lean: Know exact term? → Single specific query (e.g., "authenticate")
  - Uncertain about terms? → Bulk query with variants upfront (e.g., [{keywordsToSearch:["auth"]}, {keywordsToSearch:["authenticate"]}, {keywordsToSearch:["credential"]}])
  - Semantic variants: "auth"→"authorization"/"authenticate"/"credential", "config"→"configuration"/"settings"/"options"

GOTCHAS:
  - match="file" without limit = token explosion
  - No owner/repo = rate limits
  - text_matches show exact locations → copy match text into ${TOOL_NAMES.GITHUB_FETCH_CONTENT} matchString for precise extraction

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

PARAMS: See schema for parameter details

PURPOSE: Discover GitHub repositories. Gateway for codebase exploration.

USE_WHEN: Starting research | Finding projects/libraries
AVOID: Know repo name - go to ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} | Need code patterns - use ${TOOL_NAMES.GITHUB_SEARCH_CODE}

WORKFLOW:
  Step 1: Discover (topicsToSearch or keywordsToSearch)
  Step 2: Explore (${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE})
  Step 3: Search (${TOOL_NAMES.GITHUB_SEARCH_CODE})
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT})

STRATEGY:
  - topicsToSearch: Most precise for curated topic tags
  - keywordsToSearch: Flexible search across name/desc/README
  - Always add stars filter for quality (e.g., stars=">1000")

OPTIMIZATION:
  - Start lean: Know exact topic? → topicsToSearch with stars filter (e.g., topicsToSearch=["typescript"], stars=">1000")
  - Uncertain? → Bulk with variants: topics + keywords in parallel (e.g., [{topicsToSearch:["cli"]}, {keywordsToSearch:["command-line"]}])
  - Semantic variants: "auth"→"authentication"/"oauth", "ai"→"machine-learning"/"llm"
  - Quality: stars=">1000" for production-ready, sort="stars" for popularity

GOTCHAS:
  - topicsToSearch: use popular topics (e.g., "mcp", "react", "nextjs", "langchain") for best results
  - size filter uses KB not MB ("1000" = 1MB)
  - No filters = generic, low-quality results

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE} or ${TOOL_NAMES.GITHUB_SEARCH_CODE}
  empty → Try semantic variants or broaden stars filter

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

PARAMS: See schema for parameter details

PURPOSE: Display directory structure with file sizes

USE_WHEN: New codebase | Need structure overview
AVOID: Know filename - use ${TOOL_NAMES.GITHUB_SEARCH_CODE} | Need content - use ${TOOL_NAMES.GITHUB_FETCH_CONTENT}

WORKFLOW:
  Step 1: Overview (depth=1, path="")
  Step 2: Drill down (depth=2, path="src")
  Step 3: Search (${TOOL_NAMES.GITHUB_SEARCH_CODE})
  Step 4: Read (${TOOL_NAMES.GITHUB_FETCH_CONTENT})

STRATEGY:
  - depth=1: Fast overview, see immediate files/folders
  - depth=2: Deeper view, includes subdirectories (slower)
  - path="": Start at root, then drill into specific dirs

OPTIMIZATION:
  - Start lean: depth=1 for overview, only go depth=2 if structure unclear
  - Bulk queries: Explore key directories in parallel (e.g., [{path:"src"}, {path:"tests"}, {path:"docs"}])
  - Use for discovery, then ${TOOL_NAMES.GITHUB_SEARCH_CODE} for content

GOTCHAS:
  - depth=2 on dirs with >50 subdirs = slow, stick to depth=1
  - path format: "src/api" NOT "/src/api" (no leading slash)
  - Returns files[] and folders[], no content
  - Dirs with >100 items: result truncates at 100 → use ${TOOL_NAMES.GITHUB_SEARCH_CODE} with path filter instead

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

PARAMS: See schema for parameter details

PURPOSE: Get PRs with metadata, discussions, and diffs

USE_WHEN: PR context | Implementation research | Review merged changes
AVOID: Current code → ${TOOL_NAMES.GITHUB_FETCH_CONTENT} | Code patterns → ${TOOL_NAMES.GITHUB_SEARCH_CODE}

WORKFLOW:
  Step 1: Discover (prNumber or filters)
  Step 2: Analyze (withComments/withContent)
  Step 3: Compare (${TOOL_NAMES.GITHUB_FETCH_CONTENT} for current)

STRATEGY:
  - prNumber: Direct fetch [fastest] when you know PR number
  - Search: Filter by state/author/labels/dates for discovery
  - withContent/withComments: Start without them, add only when needed
  - limit: Use 3 for initial scan, 5-10 for comprehensive review

OPTIMIZATION:
  - Start lean: Know PR number? → prNumber (fastest, most direct)
  - Searching? → Start with limit=3, no withContent/withComments
  - Need details? → Sequential: analyze metadata first, then fetch with withContent=true if relevant
  - Multiple PRs: Bulk queries (e.g., [{prNumber:123}, {prNumber:456}, {prNumber:789}])

GOTCHAS:
  - merged=true needs state="closed"
  - prNumber ignores other filters
  - label accepts string or array for OR matching

NEXT_STEP:
  hasResults → ${TOOL_NAMES.GITHUB_FETCH_CONTENT} for current | ${TOOL_NAMES.GITHUB_SEARCH_CODE} for patterns
  empty → Broaden filters or change state

EXAMPLES:
  prNumber=123  # FASTEST
  state="open", limit=5  # Recent
  state="closed", merged=true, withContent=true  # Implementation research
  author="username", state="closed", merged=true  # Expert contributions
  query="auth", match=["title","body"], limit=3  # Text search
  queries=[{prNumber:123},{prNumber:456}]  # Bulk

GUARDS:
  implementation? - withContent=true | discussion? - withComments=true | production? - merged=true`,
};
