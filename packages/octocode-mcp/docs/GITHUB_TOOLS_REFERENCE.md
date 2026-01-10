# GitHub Tools Reference

> Complete reference for Octocode MCP GitHub tools - External research, code search, repository exploration, and package discovery.

---

## Overview

Octocode MCP provides **6 GitHub tools** for external code research and exploration:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Search Tools** (3) | `githubSearchCode`, `githubSearchRepositories`, `githubSearchPullRequests` | Find code, repos, and PRs across GitHub |
| **Content Tools** (2) | `githubGetFileContent`, `githubViewRepoStructure` | Read files and browse repository trees |
| **Package Tools** (1) | `packageSearch` | Lookup NPM/PyPI packages → get repo URLs |

---

## Tools at a Glance

### Search Tools

| Tool | Description |
|------|-------------|
| **`githubSearchCode`** | Search for code patterns across GitHub repositories by keywords. Filter by file extension, filename, path, or match type (content vs path). |
| **`githubSearchRepositories`** | Discover GitHub repositories by keywords or topics. Filter by stars, size, dates, and sort results. |
| **`githubSearchPullRequests`** | Search pull requests with extensive filters. Retrieve metadata, diffs, comments, and commits. |

### Content Tools

| Tool | Description |
|------|-------------|
| **`githubGetFileContent`** | Read file content from GitHub repositories. Supports line ranges, string matching with context, and pagination for large files. |
| **`githubViewRepoStructure`** | Display directory tree structure of a GitHub repository. Configurable depth and pagination. |

### Package Tools

| Tool | Description |
|------|-------------|
| **`packageSearch`** | Lookup NPM or Python packages to find repository URLs, version info, and metadata including deprecation warnings. |

### Quick Decision Guide

| Question | Tool |
|----------|------|
| "Find code pattern across GitHub" | `githubSearchCode` |
| "Find repositories about X" | `githubSearchRepositories` |
| "Find PRs that changed X" | `githubSearchPullRequests` |
| "Read file from GitHub repo" | `githubGetFileContent` |
| "Browse repository structure" | `githubViewRepoStructure` |
| "Get repo URL for npm package" | `packageSearch` |

---

## Search Tools (Detailed)

Tools for discovering code, repositories, and pull requests across GitHub.

### `githubSearchCode`

**What it does:** Search for code patterns across GitHub using the GitHub Code Search API.

| Feature | Description |
|---------|-------------|
| **Pattern matching** | Keywords (1-5), partial matches |
| **Scope filters** | Owner, repository |
| **File filters** | Extension, filename, path |
| **Match mode** | `file` (content) or `path` (file names) |
| **Pagination** | `limit` (1-100), `page` (1-10) |

**Key parameters:**
- `keywordsToSearch` (required): Array of 1-5 search keywords
- `owner`: Filter by repository owner/organization
- `repo`: Filter by specific repository
- `extension`: Filter by file extension (e.g., `ts`, `py`)
- `filename`: Filter by filename
- `path`: Filter by path prefix
- `match`: `file` (search content) or `path` (search file paths)
- `limit`: Results per page (default: 10, max: 100)
- `page`: Page number (default: 1, max: 10)

**Example queries:**
```
# Find useState hook implementations
keywordsToSearch=["useState", "hook"], extension="ts"

# Find config files in an org
owner="facebook", keywordsToSearch=["config"], match="path"

# Search specific repo
owner="vercel", repo="next.js", keywordsToSearch=["middleware"]
```

**⚠️ Gotchas:**
- Use 1-2 filters max. **Never combine** extension + filename + path together
- `path` is a strict prefix: `pkg` finds `pkg/file`, NOT `parent/pkg/file`
- Start lean: single filter → verify → add more filters

---

### `githubSearchRepositories`

**What it does:** Discover GitHub repositories by keywords or topics.

| Feature | Description |
|---------|-------------|
| **Search modes** | Keywords (name/description/readme) or topics |
| **Quality filters** | Stars, size, created/updated dates |
| **Match scope** | Name, description, readme |
| **Sorting** | Forks, stars, updated, best-match |
| **Pagination** | `limit` (1-100), `page` (1-10) |

**Key parameters:**
- `keywordsToSearch`: Keywords to search in repos
- `topicsToSearch`: Topics to filter by
- `owner`: Filter by owner/organization
- `stars`: Star count filter (e.g., `>1000`, `100..500`)
- `size`: Repository size in KB (e.g., `>5000`)
- `created`: Creation date (e.g., `>2023-01-01`)
- `updated`: Last update date
- `match`: Where to search (`name`, `description`, `readme`)
- `sort`: `forks`, `stars`, `updated`, `best-match`
- `limit`: Results per page (default: 10)

**Example queries:**
```
# Find popular TypeScript CLI tools
topicsToSearch=["typescript", "cli"], stars=">1000"

# Find auth services in an org
owner="wix-private", keywordsToSearch=["auth-service"]

# Recent React state management libraries
topicsToSearch=["react", "state-management"], updated=">2024-01-01"
```

**⚠️ Gotchas:**
- Check `pushedAt` (code change) > `updatedAt` (meta change) for activity
- `stars >1000` filters noise but may hide new projects
- Try synonyms: `auth` ↔ `authentication`, `plugin` ↔ `extension`
- Archived repos are auto-excluded

---

### `githubSearchPullRequests`

**What it does:** Search GitHub pull requests with extensive filtering and content retrieval.

| Feature | Description |
|---------|-------------|
| **Direct lookup** | Fetch specific PR by number |
| **Search filters** | State, author, assignee, labels, dates, reviewers |
| **Content types** | Metadata, full diff, partial diff |
| **Extra data** | Comments, commits |
| **Match scope** | Title, body, comments |

**Key parameters:**
- `prNumber`: Direct PR lookup (ignores all other filters)
- `owner`/`repo`: Repository scope
- `query`: Free-text search
- `state`: `open` or `closed`
- `author`/`assignee`/`commenter`: User filters
- `involves`/`mentions`: Participation filters
- `review-requested`/`reviewed-by`: Review filters
- `label`: Label filter (string or array)
- `created`/`updated`/`closed`/`merged-at`: Date filters
- `merged`: Boolean - only merged PRs
- `draft`: Boolean - draft status
- `type`: `metadata`, `fullContent`, `partialContent`
- `withComments`: Include PR comments
- `withCommits`: Include commit list
- `partialContentMetadata`: Specific files to fetch diff for

**Content retrieval types:**
- `metadata`: PR info only (fast, default)
- `fullContent`: Complete diff (token expensive)
- `partialContent`: Specific files only (use with `partialContentMetadata`)

**Example queries:**
```
# Get specific PR metadata
prNumber=123, type="metadata"

# Find merged PRs that changed auth
owner="org", repo="app", state="closed", merged=true, query="authentication"

# Get specific file diffs from a PR
prNumber=456, type="partialContent", 
partialContentMetadata=[{file: "src/auth.ts"}]

# PRs with comments (understand WHY)
prNumber=123, type="metadata", withComments=true
```

**⚠️ Gotchas:**
- `prNumber` **ignores ALL other filters** when set
- Use `type=metadata` first (fast), then `partialContent` for details
- Avoid `fullContent` on large PRs (token expensive)
- Set `withComments=true` to understand the reasoning behind changes

---

## Content Tools (Detailed)

Tools for reading file content and browsing repository structure.

### `githubGetFileContent`

**What it does:** Read file content from GitHub repositories with flexible extraction options.

| Feature | Description |
|---------|-------------|
| **Line ranges** | `startLine`/`endLine` for specific sections |
| **Match-based** | `matchString` with configurable context |
| **Full content** | Read entire file (small files only) |
| **Pagination** | `charOffset`/`charLength` for large files |

**Key parameters:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `path` (required): File path in repository
- `branch`: Branch name (default: main/master)
- `fullContent`: Read entire file (use sparingly)
- `startLine`/`endLine`: Line range (1-indexed)
- `matchString`: Find specific content with context
- `matchStringContextLines`: Lines around match (default: 5, max: 50)
- `charOffset`/`charLength`: Character-based pagination

**Extraction modes (choose ONE):**
1. `matchString` with context lines
2. `startLine` + `endLine`
3. `fullContent=true` (small configs only)

**Example queries:**
```
# Read specific function
matchString="export function handleAuth", matchStringContextLines=20

# Read file header
startLine=1, endLine=50

# Read entire config (small files)
path="package.json", fullContent=true
```

**⚠️ Gotchas:**
- Choose ONE mode: `matchString` OR `startLine/endLine` OR `fullContent`
- Max file size: 300KB (FILE_TOO_LARGE error)
- For `branch`: Use NAME (e.g., `main`), not SHA
- Prefer `matchString` for large files (token efficient)

---

### `githubViewRepoStructure`

**What it does:** Display the directory tree structure of a GitHub repository.

| Feature | Description |
|---------|-------------|
| **Depth control** | 1-2 levels deep |
| **Path targeting** | Start from any subdirectory |
| **Pagination** | Handle large directories |
| **Auto-filtering** | Ignores `.git`, `node_modules`, `dist` |

**Key parameters:**
- `owner` (required): Repository owner
- `repo` (required): Repository name
- `branch` (required): Branch name
- `path`: Starting path (default: root `""`)
- `depth`: Traversal depth (1-2, default: 1)
- `entriesPerPage`: Entries per page (default: 50, max: 200)
- `entryPageNumber`: Page number (default: 1)

**Exploration workflow:**
1. Start at root: `path=""`, `depth=1`
2. Drill into source: `path="src"`, `depth=2`
3. Explore specific area: `path="packages/core"`, `depth=1`

**Example queries:**
```
# See root structure
path="", depth=1

# Drill into source directory
path="src", depth=2

# Explore monorepo package
path="packages/core", depth=1
```

**⚠️ Gotchas:**
- Start at root (`path=""`, `depth=1`) first
- `depth=2` is slow on large directories - use on subdirs only
- For monorepos: Check `packages/`, `apps/`, `libs/`
- Max 200 entries per page - check `summary.truncated`
- Noisy directories auto-filtered: `.git`, `node_modules`, `dist`

---

## Package Tools (Detailed)

### `packageSearch`

**What it does:** Lookup NPM or Python packages to find their source repositories.

| Feature | Description |
|---------|-------------|
| **Ecosystems** | NPM (npm) and Python (PyPI) |
| **Repository URL** | Get owner/repo for GitHub exploration |
| **Metadata** | Version, description, deprecation status |
| **Alternatives** | Search for similar packages |

**Key parameters:**
- `name` (required): Package name
- `ecosystem` (required): `npm` or `python`
- `searchLimit`: Number of results (default: 1, max: 10)
- `npmFetchMetadata`: Fetch extended NPM metadata
- `pythonFetchMetadata`: Fetch extended PyPI metadata

**Example queries:**
```
# Quick lookup - get repo URL
ecosystem="npm", name="express"

# Python package
ecosystem="python", name="requests"

# Find alternatives
ecosystem="npm", name="lodash", searchLimit=5
```

**⚠️ Gotchas:**
- Use `searchLimit=1` for known package names
- Python always returns 1 result (PyPI limitation)
- NPM uses dashes (`my-package`), Python uses underscores (`my_package`)
- Check DEPRECATED warnings first before using

**vs GitHub Search:**
- `packageSearch`: Fast lookup by exact name → get repo URL
- `githubSearchRepositories`: Broad discovery by keywords

**Use `packageSearch` first** for known package names, then `github*` tools for source exploration.

---

## Research Flows

### Flow 1: "How does package X work?"

```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

**Steps:**
1. `packageSearch(name="express", ecosystem="npm")` → Get repo URL
2. `githubViewRepoStructure(owner="expressjs", repo="express", depth=1)` → See structure
3. `githubSearchCode(owner="expressjs", repo="express", keywordsToSearch=["middleware"])` → Find code
4. `githubGetFileContent(matchString="function middleware")` → Read implementation

---

### Flow 2: "Find examples of pattern X"

```
githubSearchCode → githubViewRepoStructure → githubGetFileContent
```

**Steps:**
1. `githubSearchCode(keywordsToSearch=["useReducer", "context"], extension="tsx")` → Find files
2. `githubViewRepoStructure` on interesting repos → Understand layout
3. `githubGetFileContent(matchString="useReducer")` → Read full implementation

---

### Flow 3: "Why was code changed this way?"

```
githubSearchCode → githubSearchPullRequests → githubGetFileContent
```

**Steps:**
1. `githubSearchCode(owner="org", repo="app", keywordsToSearch=["deprecatedFunc"])` → Find code
2. `githubSearchPullRequests(owner="org", repo="app", query="deprecatedFunc", merged=true)` → Find PRs
3. `githubSearchPullRequests(prNumber=123, type="partialContent", withComments=true)` → Get details

---

### Flow 4: "Explore a new codebase"

```
githubViewRepoStructure → githubGetFileContent → githubSearchCode
```

**Steps:**
1. `githubViewRepoStructure(path="", depth=1)` → Root overview
2. `githubGetFileContent(path="README.md", fullContent=true)` → Read docs
3. `githubGetFileContent(path="package.json", fullContent=true)` → Check deps
4. `githubViewRepoStructure(path="src", depth=2)` → Explore source
5. `githubSearchCode(keywordsToSearch=["export"])` → Find entry points

---

### Flow 5: "Find how others implement X"

```
githubSearchRepositories → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

**Steps:**
1. `githubSearchRepositories(topicsToSearch=["authentication"], stars=">500")` → Find projects
2. `githubViewRepoStructure` on top results → Browse structure
3. `githubSearchCode(keywordsToSearch=["oauth", "token"])` → Find implementations
4. `githubGetFileContent(matchString="async function authenticate")` → Read code

---

## Quick Reference

### Tool Selection Guide

| Question | Tool |
|----------|------|
| "Search code patterns on GitHub" | `githubSearchCode` |
| "Find repositories about X" | `githubSearchRepositories` |
| "Find PRs that changed X" | `githubSearchPullRequests` |
| "Read file from GitHub" | `githubGetFileContent` |
| "Browse repo directory tree" | `githubViewRepoStructure` |
| "Get repo URL for package X" | `packageSearch` |

### GitHub vs Local Tools

| Scenario | Use |
|----------|-----|
| Your codebase (files on disk) | **Local tools** + LSP |
| External repos / libraries | **GitHub tools** |
| Found import, need source? | `packageSearch` → GitHub tools |

**⚠️ Local code questions → NEVER use `github*` tools. Use `localSearchCode` → LSP.**

---

## Critical Rules

### ⚠️ Rule 1: Know Your Scope

```
❌ WRONG: githubSearchCode for your own project files
✅ RIGHT: localSearchCode → LSP tools for local files
✅ RIGHT: githubSearchCode for external repositories
```

### ⚠️ Rule 2: Package First for External Deps

```
❌ WRONG: githubSearchRepositories(keywordsToSearch=["express"])
✅ RIGHT: packageSearch(name="express") → githubViewRepoStructure
```

`packageSearch` gives you exact repo URL; GitHub search gives broad results.

### ⚠️ Rule 3: Start Lean with Filters

```
❌ WRONG: extension="ts" + filename="config" + path="src"
✅ RIGHT: keywordsToSearch=["config"] + extension="ts"
```

GitHub search fails with too many combined filters.

### ⚠️ Rule 4: Metadata First for PRs

```
❌ WRONG: prNumber=123, type="fullContent"
✅ RIGHT: prNumber=123, type="metadata" → then partialContent if needed
```

Avoid token-expensive operations until you know what you need.

### ⚠️ Rule 5: Prefer `matchString` for Large Files

```
❌ WRONG: githubGetFileContent(fullContent=true) on 10,000 line file
✅ RIGHT: githubGetFileContent(matchString="function authenticate")
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Using GitHub tools for local code | Slower, less semantic | Use local + LSP tools |
| Searching GitHub for known packages | Broad results | `packageSearch` first |
| Too many filters in code search | API fails | Start with 1-2 filters |
| `fullContent=true` on large files | Token waste | Use `matchString` |
| `type=fullContent` for PRs | Token expensive | `metadata` → `partialContent` |
| Ignoring `packageSearch` | Miss exact repo URL | Always check for packages |

---

## Parallel Execution

Tools with no dependencies can run in parallel:

```
✅ Parallel OK:
- githubSearchCode(owner="A") + githubSearchCode(owner="B")
- githubViewRepoStructure(repo="A") + githubViewRepoStructure(repo="B")
- packageSearch(name="express") + packageSearch(name="lodash")

❌ Must be Sequential:
- packageSearch → githubViewRepoStructure (needs owner/repo)
- githubViewRepoStructure → githubGetFileContent (needs path discovery)
- githubSearchPullRequests(metadata) → githubSearchPullRequests(partialContent)
```

**Batch limits:**
- GitHub tools: Up to 3 queries per call
- Package search: Up to 3 queries per call
