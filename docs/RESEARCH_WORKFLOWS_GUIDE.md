# Research Workflows Guide

**Concise reference for systematic code research using Octocode-MCP tools**

---

## Quick Navigation

- [The 4-Stage Research Flow](#the-4-stage-research-flow)
- [Entry Point Decision Matrix](#entry-point-decision-matrix)
- [Tool Selection Rules](#tool-selection-rules)
- [Stage A: Find Repository](#stage-a-find-repository)
- [Stage B: Explore Structure](#stage-b-explore-structure)
- [Stage C: Search Pattern](#stage-c-search-pattern)
- [Stage D: Extract Content](#stage-d-extract-content)
- [Decision Trees (Visual)](#decision-trees-visual)
- [Common Workflows](#common-workflows)
- [Recovery Strategies](#recovery-strategies)

---

## The 4-Stage Research Flow

```
A: Find Repository     → Discover repos by topic/keyword
B: Explore Structure   → Map directories and architecture  
C: Search Pattern      → Find specific code/files
D: Extract Content     → Read and analyze implementation

Flow: A → B → C → D → Loop or Complete
```

### When to Use Each Stage

| Stage | Use When | Skip When |
|-------|----------|-----------|
| **A** | Don't know which repo | Know exact repo |
| **B** | Unknown architecture | Know file paths |
| **C** | Need to find code | Have file path |
| **D** | Ready to read code | Need to search first |

---

## Entry Point Decision Matrix

```
┌─────────────────────────────┬──────────────┬─────────────────────┐
│ What You Know               │ Start Stage  │ First Tool          │
├─────────────────────────────┼──────────────┼─────────────────────┤
│ Exact repo + file path      │ Stage D      │ github_fetch_content│
│ Repo name only              │ Stage B      │ github_view_repo_   │
│                             │              │   structure         │
│ Topic/domain                │ Stage A      │ github_search_      │
│                             │              │   repositories      │
│ Function/pattern name       │ Stage C      │ github_search_code  │
│ Owner + vague description   │ Stage A      │ github_search_      │
│                             │              │   repositories      │
│ Nothing specific            │ Stage A      │ github_search_      │
│                             │              │   repositories      │
└─────────────────────────────┴──────────────┴─────────────────────┘
```

---

## Tool Selection Rules

### Quick Reference

```yaml
github_search_repositories:
  When: Starting research, finding repos
  Best: topicsToSearch + stars filter
  Bulk: Split topics/keywords into separate queries

github_view_repo_structure:
  When: New repo, unknown layout
  Best: depth=1 first, then drill down
  Bulk: Explore multiple repos in parallel

github_search_code:
  When: Finding files or implementations
  Best: match="path" for discovery, match="file" for content
  Bulk: Combine path discovery + file content queries

github_fetch_content:
  When: Reading code with known path
  Best: matchString for targeted extraction (85% token savings)
  Bulk: Fetch multiple files or sections in parallel

github_search_pull_requests:
  When: Need historical context or implementation history
  Best: state="closed" + merged=true for production code
  Bulk: Search multiple PR criteria in parallel
```

---

## Stage A: Find Repository

### Decision Tree

```
START: Need to find repository
│
├─ Know EXACT owner/repo? 
│  └─ YES → Skip to Stage B
│  
├─ Know TOPICS (e.g., "mcp", "authentication")?
│  └─ YES → Topic Search
│      • topicsToSearch: [topic1, topic2]
│      • stars: ">1000"
│      • sort: "stars"
│  
├─ Know KEYWORDS (e.g., "oauth server")?
│  └─ YES → Keyword Search
│      • keywordsToSearch: [term1, term2]
│      • stars: ">500"
│      • updated: ">=2023-01-01"
│  
└─ Have BOTH?
   └─ YES → Hybrid Bulk (auto-splits)
       • topicsToSearch: [topic]
       • keywordsToSearch: [keywords]
```

### Thinking Checkpoints

```yaml
Before Search:
  ☐ What exactly am I looking for?
  ☐ Topic or keyword search more appropriate?
  ☐ What quality threshold (stars)?

Analyzing Results:
  ☐ Do results align with research goal?
  ☐ Are repos maintained (check updated date)?
  ☐ Should I try alternative keywords?
  ☐ Too generic or too specific?

After Results:
  ☐ Select top 3-5 candidates
  ☐ Proceed to Stage B for structure
```

### Example Queries

```yaml
# Topic-based discovery
queries:
  - topicsToSearch: ["mcp", "server"]
    stars: ">100"
    sort: "stars"
    researchGoal: "Find MCP server implementations"
    reasoning: "Topic search for curated, quality repos"

# Keyword-based discovery
queries:
  - keywordsToSearch: ["authentication", "jwt"]
    stars: ">500"
    updated: ">=2023-01-01"
    researchGoal: "Find modern auth implementations"
    reasoning: "Active projects with JWT auth"

# Bulk parallel search
queries:
  - topicsToSearch: ["authentication"]
  - keywordsToSearch: ["oauth", "jwt"]
  - owner: "specific-org"
    keywordsToSearch: ["auth"]
```

---

## Stage B: Explore Structure

### Decision Tree

```
START: Need to understand repo structure
│
├─ Know TARGET directory?
│  └─ YES → Focused exploration
│      • path: "src/auth"
│      • depth: 1 or 2
│  └─ NO → Root exploration
│      • path: ""
│      • depth: 1
│
├─ Know BRANCH?
│  └─ NO → Omit (auto-detects default)
│  └─ YES → Specify branch
│
└─ MONOREPO structure?
   └─ YES → Explore packages separately
       • Bulk queries for each package
```

### Thinking Checkpoints

```yaml
Before Exploration:
  ☐ Start at root or target directory?
  ☐ Use depth=1 or depth=2?
  ☐ Is this a monorepo?

Analyzing Structure:
  ☐ Where are implementation files? (src/, lib/)
  ☐ Where are tests? (test/, __tests__/)
  ☐ What's the naming convention?
  ☐ What are the entry points? (index.*, main.*)
  ☐ Where are configs? (*.config.*)

Record Patterns:
  ☐ Directory structure mental map
  ☐ File naming patterns
  ☐ Test organization approach
  ☐ Key directories for Stage C
```

### Example Queries

```yaml
# Root overview
queries:
  - owner: "facebook"
    repo: "react"
    branch: "main"
    path: ""
    depth: 1
    researchGoal: "Understand React repository structure"
    reasoning: "Root overview to identify key directories"

# Focused deep-dive
queries:
  - owner: "facebook"
    repo: "react"
    path: "packages/react"
    depth: 2
    researchGoal: "Explore React core package structure"
    reasoning: "Deep dive into implementation directory"

# Bulk monorepo exploration
queries:
  - {owner: "...", repo: "...", path: "packages/pkg1", depth: 1}
  - {owner: "...", repo: "...", path: "packages/pkg2", depth: 1}
  - {owner: "...", repo: "...", path: "packages/pkg3", depth: 1}
```

---

## Stage C: Search Pattern

### Decision Tree

```
START: Need to find code/files
│
├─ Searching for FILENAME?
│  └─ YES → Path Mode (25x faster)
│      • match: "path"
│      • keywordsToSearch: [filename_pattern]
│  
├─ Searching for IMPLEMENTATION?
│  └─ YES → File Mode
│      • match: "file"
│      • keywordsToSearch: [function, pattern]
│      • limit: 5-10
│  
├─ NOT SURE what to search?
│  └─ Hybrid Bulk
│      • Query 1: match="path" (discovery)
│      • Query 2: match="file" + limit (content)
│  
└─ Apply FILTERS from Stage B:
    • path: "src/auth"  (from structure knowledge)
    • extension: "ts"
    • filename: "handler"
```

### Search Mode Selection

```yaml
match="path":
  ✓ Finding files by name pattern
  ✓ Fast discovery (25x faster than file mode)
  ✓ When you know approximate filename
  ✗ Doesn't show code snippets
  ✗ Can't search file content

match="file":
  ✓ Finding implementations
  ✓ Returns text_matches with code snippets
  ✓ Search actual code content
  ✗ Token expensive without limit
  ✗ Must have owner/repo (rate limits)
  
Both (bulk):
  ✓ Best of both worlds
  ✓ Discover + detailed analysis
  ✓ Single response with full context
```

### Thinking Checkpoints

```yaml
Before Search:
  ☐ Searching filename or content?
  ☐ What filters from Stage B apply?
  ☐ Should I search one repo or multiple?
  ☐ Need to set limit parameter?

Analyzing Results:
  ☐ Are results relevant to research goal?
  ☐ Too many results? Add filters
  ☐ Too few results? Broaden keywords
  ☐ Do text_matches show expected code?
  ☐ Are test files dominating? Filter them out

Extract Patterns:
  ☐ Function names for Stage D matchString
  ☐ Consistent implementation patterns
  ☐ Files to read in Stage D
```

### Example Queries

```yaml
# Fast path discovery
queries:
  - match: "path"
    keywordsToSearch: ["auth", "handler"]
    owner: "..."
    repo: "..."
    researchGoal: "Find authentication files"
    reasoning: "Fast filename-based discovery"

# Implementation search
queries:
  - match: "file"
    keywordsToSearch: ["authenticate", "verify"]
    path: "src/auth"
    extension: "ts"
    limit: 10
    researchGoal: "Find auth implementation"
    reasoning: "Content search in auth directory"

# Bulk discovery + content
queries:
  - {match: "path", keywordsToSearch: ["auth"]}
  - {match: "file", keywordsToSearch: ["authenticate"], limit: 5}
  
# Cross-repo pattern search
queries:
  - {owner: "repo1", match: "file", keywordsToSearch: ["pattern"], limit: 5}
  - {owner: "repo2", match: "file", keywordsToSearch: ["pattern"], limit: 5}
  - {owner: "repo3", match: "file", keywordsToSearch: ["pattern"], limit: 5}
```

---

## Stage D: Extract Content

### Decision Tree

```
START: Need to read file content
│
├─ File SIZE?
│  ├─ <200 lines → fullContent + minified
│  ├─ 200-1000 → Choose strategy
│  └─ >1000 → Must use targeted extraction
│
├─ What to EXTRACT?
│  ├─ Specific function/class → matchString
│  ├─ Known line range → startLine/endLine
│  ├─ Multiple sections → Bulk with matchString
│  └─ Full understanding → fullContent
│
├─ File TYPE?
│  ├─ Code (ts/js/py) → minified=true
│  ├─ Config (json/yaml) → minified=false
│  └─ Docs (md) → minified=true
│
└─ Need DEPENDENCIES?
   └─ YES → Loop back to Stage C or D
       • Extract imports
       • Fetch dependency files
```

### Extraction Mode Selection

```yaml
matchString + matchStringContextLines:
  ✓ 85% token savings
  ✓ Targeted extraction
  ✓ Adjustable context (1-50 lines)
  ✗ Need to know pattern to match
  Best: When you know function/class name

startLine + endLine:
  ✓ Precise boundaries
  ✓ Known line ranges
  ✓ Efficient for specific sections
  ✗ Need to know line numbers
  Best: When you have line references

fullContent:
  ✓ Complete picture
  ✓ All context available
  ✗ Token expensive for large files
  ✗ May hit content limits
  Best: Small files (<200 lines)
```

### Thinking Checkpoints

```yaml
Before Extraction:
  ☐ What extraction mode is most efficient?
  ☐ Do I need full file or can I target extract?
  ☐ Should I set minified=false for configs?
  ☐ Am I fetching multiple files? Use bulk

Analyzing Content:
  ☐ Do I understand the logic?
  ☐ Are imports/dependencies clear?
  ☐ Is error handling visible?
  ☐ Do I need more context (more lines)?
  ☐ Should I follow imports to other files?

After Extraction:
  ☐ Research goal answered?
  ☐ Need to fetch related files?
  ☐ Need to check tests or docs?
  ☐ Complete or loop back to Stage C?
```

### Example Queries

```yaml
# Targeted extraction (BEST for efficiency)
queries:
  - owner: "..."
    repo: "..."
    path: "src/auth/handler.ts"
    matchString: "authenticate"
    matchStringContextLines: 20
    researchGoal: "Understand auth implementation"
    reasoning: "Extract auth logic with sufficient context"

# Full file for configs
queries:
  - path: "package.json"
    fullContent: true
    minified: false
    researchGoal: "Check dependencies"
    reasoning: "Config file, preserve formatting"

# Bulk dependency fetching
queries:
  - {path: "src/auth/handler.ts", matchString: "authenticate"}
  - {path: "src/auth/validator.ts", matchString: "validate"}
  - {path: "src/auth/middleware.ts", matchString: "middleware"}

# Line range extraction
queries:
  - path: "src/index.ts"
    startLine: 1
    endLine: 50
    researchGoal: "Read imports and setup"
    reasoning: "Just need file header and initialization"
```

---

## Decision Trees (Visual)

### 1. Overall Research Flow

```
                    START
                      ↓
            ┌─────────┴─────────┐
            │                   │
      Know repo+file?     Know repo only?
            │                   │
            ↓                   ↓
        Stage D             Stage B
            │                   │
            └────────→ Stage C ←┘
                      ↓
                  Stage D
                      ↓
              ┌───────┴────────┐
              │                │
        Complete?        Need More?
              │                │
              ↓                ↓
           Done          Loop to A/B/C
```

### 2. Search Mode Decision

```
Need to Search Code
        ↓
    ┌───┴───────────────┬────────────────┐
    │                   │                │
File Name?      Implementation?     Not Sure?
    │                   │                │
match="path"      match="file"      Both (bulk)
    │                   │                │
    └─────────┬─────────┴────────────────┘
              ↓
      Results Quality?
              ↓
    ┌─────────┼─────────┐
    │         │         │
  Good    Too Many   Too Few
    │         │         │
Stage D   Add Filters  Broaden
```

### 3. Content Extraction Decision

```
Need File Content
        ↓
    File Size?
        ↓
    ┌───┴───────┬──────────┐
    │           │          │
<200 lines  200-1000   >1000
    │           │          │
fullContent  Strategy  Must Target
            ↓              ↓
      ┌─────┴────┐    matchString
      │          │         │
matchString  Range        or
      │          │         │
      └────┬─────┘     Bulk Queries
           ↓
      minified?
           ↓
    ┌──────┴──────┐
    │             │
Code/Docs    Config/JSON
    │             │
minified=T   minified=F
```

---

## Common Workflows

### Workflow 1: Understanding a New Technology

```yaml
Goal: "Understand how MCP servers implement authentication"

Stage A: Discover
  queries:
    - topicsToSearch: ["mcp", "server"]
      stars: ">100"
  
  Result: Found 5 MCP server repos

Stage B: Explore (bulk)
  queries:
    - {owner: "repo1", repo: "mcp-server1", path: "", depth: 1}
    - {owner: "repo2", repo: "mcp-server2", path: "", depth: 1}
    - {owner: "repo3", repo: "mcp-server3", path: "", depth: 1}
  
  Result: Identified auth directories

Stage C: Search (bulk)
  queries:
    - {owner: "repo1", match: "path", keywordsToSearch: ["auth"]}
    - {owner: "repo2", match: "path", keywordsToSearch: ["auth"]}
    - {owner: "repo3", match: "path", keywordsToSearch: ["auth"]}
  
  Result: Found auth implementation files

Stage D: Extract (bulk)
  queries:
    - {owner: "repo1", path: "src/auth/oauth.ts", matchString: "authenticate"}
    - {owner: "repo2", path: "lib/auth.ts", matchString: "authenticate"}
    - {owner: "repo3", path: "auth/index.ts", matchString: "authenticate"}
  
  Result: Compare implementations, synthesize patterns
```

### Workflow 2: Bug Investigation

```yaml
Goal: "Why does authentication fail intermittently?"

Stage C: Search in known repo
  queries:
    - match: "file"
      owner: "myorg"
      repo: "myapp"
      keywordsToSearch: ["authenticate", "login"]
      path: "src"
      limit: 10
  
  Result: Found auth handler files

Stage D: Extract implementation
  queries:
    - path: "src/auth/handler.ts"
      matchString: "authenticate"
      matchStringContextLines: 30
  
  Result: See auth flow

Stage C: Search error handling
  queries:
    - match: "file"
      keywordsToSearch: ["error", "catch", "retry"]
      path: "src/auth"
  
  Result: Analyze error patterns

Stage E: Historical context (github_search_pull_requests)
  queries:
    - query: "authentication fix"
      state: "closed"
      merged: true
  
  Result: Previous fixes reveal intermittent issue cause
```

### Workflow 3: API Integration Learning

```yaml
Goal: "Learn how to use GitHub API for code search"

Stage A: Find library
  queries:
    - topicsToSearch: ["github-api"]
      stars: ">1000"
  
  Result: Found octokit/rest.js

Stage B: Quick structure
  queries:
    - owner: "octokit"
      repo: "rest.js"
      path: ""
      depth: 1

Stage C: Find search implementation
  queries:
    - match: "path"
      keywordsToSearch: ["search", "code"]

Stage D: Extract (bulk)
  queries:
    - path: "src/plugins/rest/search/code.ts"
      fullContent: true
    - path: "README.md"
      matchString: "search"
      matchStringContextLines: 20

Stage C: Find usage examples
  queries:
    - match: "file"
      keywordsToSearch: ["octokit.search.code"]
      stars: ">500"
      limit: 10
  
  Result: Real-world usage patterns
```

### Workflow 4: Dependency Chain Following

```yaml
Goal: "Understand how authentication middleware works"

Stage D: Read main file
  queries:
    - path: "src/middleware/auth.ts"
      fullContent: true
  
  Analyze: Extract imports
    • import { verify } from '../utils/jwt'
    • import { User } from '../models/user'

Stage D: Follow dependencies (bulk)
  queries:
    - path: "src/utils/jwt.ts"
      matchString: "verify"
      matchStringContextLines: 20
    - path: "src/models/user.ts"
      matchString: "User"
      matchStringContextLines: 15
  
  Analyze: More imports found
    • jwt.ts imports crypto
    • user.ts imports database

Stage D: Continue chain (bulk)
  queries:
    - path: "src/utils/crypto.ts"
      matchString: "encrypt"
    - path: "src/database/connection.ts"
      matchString: "connect"
  
  Result: Complete dependency graph understood
```

---

## Recovery Strategies

### Problem: No Results

```yaml
Diagnostic:
  ☐ Keywords too specific?
  ☐ Scope too narrow (path/owner)?
  ☐ Wrong search mode?
  ☐ Pattern doesn't exist?

Quick Fixes:
  1. Broaden keywords
     FROM: ["authenticateUser"]
     TO: ["auth"]
  
  2. Remove filters
     FROM: {owner, repo, path, extension}
     TO: {owner, repo}
  
  3. Switch modes
     FROM: match="file"
     TO: match="path"
  
  4. Try alternatives
     • Search test files instead
     • Look for documentation
     • Search for usage/imports
  
  5. Go back to Stage B
     • Verify feature exists
     • Check correct directory
```

### Problem: Too Many Results

```yaml
Diagnostic:
  ☐ Keywords too generic?
  ☐ Missing filters?
  ☐ Including test/vendor files?
  ☐ Need quality threshold?

Quick Fixes:
  1. Add specificity
     ADD: extension="ts"
     ADD: path="src"
  
  2. Apply filters
     ADD: limit=10
     ADD: stars=">1000"
  
  3. Narrow scope
     FROM: entire repo
     TO: path="src/auth"
  
  4. Use knowledge from Stage B
     • Exclude test directories
     • Focus on implementation dirs
```

### Problem: Incomplete Understanding

```yaml
Diagnostic:
  ☐ Missing import context?
  ☐ Need related files?
  ☐ Complex patterns?
  ☐ Should check tests/docs?

Quick Fixes:
  1. Follow imports
     • Extract import statements
     • Bulk fetch dependencies
  
  2. Check tests
     • Tests show usage
     • Tests reveal edge cases
  
  3. Read docs
     • README.md sections
     • ARCHITECTURE.md
  
  4. Historical context
     • Search PRs (Stage E)
     • Implementation discussions
  
  5. Cross-reference
     • Same pattern in other repos
     • Compare implementations
```

### Problem: Rate Limits

```yaml
Quick Fixes:
  1. Authenticate
     • Set GITHUB_TOKEN
     • Check token scopes
  
  2. Use bulk operations
     • Fewer total requests
     • Better efficiency
  
  3. Add owner/repo filters
     • Reduces API load
     • More focused results
  
  4. Check rate limit hints
     • Error includes reset time
     • Wait before retry
```

---

## Best Practices Summary

### ✅ Do This

- **Start broad, narrow progressively**
- **Use bulk operations** (5-10x faster)
- **Define research goal** for every query
- **Follow hints** in responses
- **Apply Stage B knowledge** to Stage C filters
- **Use matchString** for targeted extraction
- **Set limit parameter** on file searches
- **Verify results** against research goal

### ❌ Avoid This

- Skipping discovery when you don't know the repo
- Using match="file" without limit parameter
- Fetching fullContent for large files
- Ignoring structure exploration (Stage B)
- Generic keywords without filters
- Not using bulk operations
- Missing research goal/reasoning

---

## Quick Decision Reference

```yaml
SITUATION → ACTION

Need repos → Stage A (topicsToSearch + stars filter)
Unknown structure → Stage B (depth=1 → depth=2)
Find files → Stage C (match="path")
Find code → Stage C (match="file" + limit)
Read code → Stage D (matchString + context)
Read config → Stage D (fullContent + minified=false)
Follow imports → Loop: Stage C → Stage D
Compare repos → Bulk queries across repos
No results → Broaden keywords, remove filters
Too many → Add filters, increase specificity
Incomplete → Follow dependencies, check tests
Historical → Stage E (github_search_pull_requests)
```

---

## Meta-Algorithm (Universal Pattern)

```yaml
1. DEFINE
   • Clear research goal
   • Success criteria
   • Time/scope constraints

2. ORIENT
   • What do I know?
   • Choose entry stage (A/B/C/D)
   • Plan approach

3. EXECUTE
   • Run queries with reasoning
   • Use bulk operations
   • Apply filters from context

4. ANALYZE
   • Evaluate quality
   • Extract patterns
   • Identify gaps

5. DECIDE
   • Continue? Next stage?
   • Refine? Alternative?
   • Complete?

6. LOOP or FINISH
   • Iterate until complete
   • Validate understanding
   • Synthesize findings
```

---

## Attribution


For detailed documentation, see:
- [Tools & Research Workflows](./TOOLS_AND_RESEARCH_WORKFLOWS.md)
- [Research Decision Trees](./RESEARCH_DECISION_TREES.md)
- [Tools Technical Reference](./TOOLS_TECHNICAL_REFERENCE.md)

