# GitHub & GitLab Tools Reference

> Complete reference for Octocode MCP code host tools - External research, code search, repository exploration, and package discovery across **GitHub and GitLab**.

---

## Overview

Octocode MCP provides **7 tools** for external code research that work with **GitHub** (and most with **GitLab**):

| Category | Tools | Purpose |
|----------|-------|---------|
| **Search Tools** (3) | `githubSearchCode`, `githubSearchRepositories`, `githubSearchPullRequests` | Find code, repos, and PRs/MRs across providers |
| **Content Tools** (3) | `githubGetFileContent`, `githubViewRepoStructure`, `githubCloneRepo` | Read files, browse trees, clone repos locally |
| **Package Tools** (1) | `packageSearch` | Lookup NPM/PyPI packages → get repo URLs |

### Provider Selection

The active provider is determined by the **server configuration** (environment variables), not per tool call.

- **GitHub** (Default): Active when `GITHUB_TOKEN` is set.
- **GitLab**: Active when `GITLAB_TOKEN` is set (overrides GitHub).

**To switch providers:** You must change the environment variables of the MCP server.

### Research Context (All Tools)

Every tool query **requires** three research context fields:

| Field | Description |
|-------|-------------|
| `mainResearchGoal` | High-level objective of the research session |
| `researchGoal` | Specific goal for this particular query |
| `reasoning` | Why this tool/query was chosen |

These fields are required on **every query** for all GitHub/GitLab and package tools. They help track research intent and improve result quality.

---

## Provider Mapping

Tools use unified parameters that map to provider-specific concepts:

| Parameter | GitHub | GitLab |
|-----------|--------|--------|
| `owner` | Organization / User | Group / Namespace |
| `repo` | Repository | Project Name |
| `owner` + `repo` | `owner/repo` | `group/project` (Project ID) |
| `branch` | Branch Name | Ref (Branch/Tag) |
| `prNumber` | Pull Request # | Merge Request IID |

### GitLab-Specific Notes

1.  **Scope is Required**: You must provide `owner` and `repo` to target a specific project (e.g., `owner="my-group"`, `repo="my-project"`).
2.  **`branch` is Required**: GitLab requires a ref for file content retrieval (unlike GitHub which auto-detects default branch).
3.  **Global Search**: GitLab global code search requires authentication and potentially Enterprise/Premium features. Scope to a project for best results.

---

## Tools at a Glance

### Search Tools

| Tool | Description |
|------|-------------|
| **`githubSearchCode`** | Search for code patterns across repositories by keywords. Filter by file extension, filename, path, or match type (content vs path). |
| **`githubSearchRepositories`** | Discover repositories by keywords or topics. Filter by stars, size, dates, and sort results. |
| **`githubSearchPullRequests`** | Search pull requests/merge requests with extensive filters. Retrieve metadata, diffs, comments, and commits. |

### Content Tools

| Tool | Description |
|------|-------------|
| **`githubGetFileContent`** | Read file content from repositories, or fetch an entire directory to disk (`type: "directory"`). Supports line ranges, string matching with context, and pagination for large files. Directory mode requires `ENABLE_CLONE=true`. |
| **`githubViewRepoStructure`** | Display directory tree structure of a repository. Configurable depth and pagination. |
| **`githubCloneRepo`** | Clone a repository (or subdirectory) locally for deep analysis with local + LSP tools. GitHub only. Requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`. |

### Package Tools

| Tool | Description |
|------|-------------|
| **`packageSearch`** | Lookup NPM or Python packages to find repository URLs, version info, and metadata including deprecation warnings. |

### Quick Decision Guide

| Question | Tool |
|----------|------|
| "Find code pattern across repos" | `githubSearchCode` |
| "Find repositories about X" | `githubSearchRepositories` |
| "Find PRs/MRs that changed X" | `githubSearchPullRequests` |
| "Read file from repo" | `githubGetFileContent` |
| "Browse repository structure" | `githubViewRepoStructure` |
| "Clone repo for deep local analysis" | `githubCloneRepo` |
| "Get repo URL for npm package" | `packageSearch` |

---

## Search Tools (Detailed)

Tools for discovering code, repositories, and pull requests/merge requests.

### `githubSearchCode`

**What it does:** Search for code patterns using keywords across repositories.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Scope** | Global or per-repo | Per-project (Group + Project) |
| **Pattern matching** | Keywords (1-5), partial matches | Keywords with path/filename filters |
| **Project filter** | `owner` + `repo` | `owner` (Group) + `repo` (Project) |

**Key parameters:**
- `keywordsToSearch` (required): Array of 1-5 search keywords
- `owner`: Repository owner / GitLab Group
- `repo`: Specific repository / GitLab Project
- `extension`: Filter by file extension (e.g., `ts`, `py`)
- `filename`: Filter by filename
- `path`: Filter by path prefix
- `match`: `file` (search content) or `path` (search file paths)
- `limit`: Results per page (default: 10, max: 100)
- `page`: Page number (default: 1, max: 10)

**Example queries:**

```
# GitHub: Find useState hook implementations
keywordsToSearch=["useState", "hook"], extension="ts"

# GitHub: Find config files in an org
owner="facebook", keywordsToSearch=["config"], match="path"

# GitLab: Search in specific project (group/project)
owner="mygroup", repo="myproject", keywordsToSearch=["middleware"]
```

**⚠️ Gotchas:**
- Use 1-2 filters max. **Never combine** extension + filename + path together
- `path` is a strict prefix: `pkg` finds `pkg/file`, NOT `parent/pkg/file`

---

### `githubSearchRepositories`

**What it does:** Discover repositories/projects by keywords or topics.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Search modes** | Keywords, topics | Keywords, topics |
| **Visibility** | Public (mostly) | Public/Internal/Private based on token |

**Key parameters:**
- `keywordsToSearch`: Keywords to search in repos
- `topicsToSearch`: Topics to filter by
- `owner`: Filter by owner/organization/group
- `stars`: Star count filter (e.g., `>1000`, `100..500`)
- `size`: Repository size in KB
- `created`: Creation date filters
- `updated`: Last update date
- `sort`: Sorting field (`forks`, `stars`, `updated`, `best-match`)
- `match`: Match scope — array of: `name`, `description`, `readme`
- `limit`: Results per page (default: 10)
- `page`: Page number (default: 1, max: 10)

**Example queries:**

```
# GitHub: Find popular TypeScript CLI tools
topicsToSearch=["typescript", "cli"], stars=">1000"

# GitHub: Find auth services in an org
owner="wix-private", keywordsToSearch=["auth-service"]
```

**⚠️ Gotchas:**
- Check `pushedAt` (code change) > `updatedAt` (meta change) for activity
- `stars >1000` filters noise but may hide new projects
- Try synonyms: `auth` ↔ `authentication`, `plugin` ↔ `extension`
- Archived repos are auto-excluded

---

### `githubSearchPullRequests`

**What it does:** Search GitHub Pull Requests or GitLab Merge Requests with extensive filtering.

| Feature | GitHub (PRs) | GitLab (MRs) |
|---------|--------------|--------------|
| **Direct lookup** | `prNumber` | `prNumber` (maps to IID) |
| **State values** | `open`, `closed` | `open`, `closed`, `merged`, `all` |
| **Branch filters** | `head`, `base` | `source`, `target` |

**Key parameters:**
- `prNumber`: Direct lookup (ignores all other filters). Maps to GitLab MR IID.
- `owner`: Repository owner / GitLab Group
- `repo`: Repository name / GitLab Project
- `query`: Free-text search
- `state`: `open`, `closed`
- `author`: User filter
- `assignee`: Assignee filter
- `label`: Label filter (string or array)
- `created`: Date filters
- `updated`: Update date
- `merged`: Boolean - only merged PRs/MRs
- `draft`: Boolean - draft status
- `sort`: `created`, `updated`, `best-match`
- `order`: `asc` or `desc` (default: desc)
- `type`: `metadata`, `fullContent`, `partialContent`
- `withComments`: Include comments/notes
- `withCommits`: Include commit list
- `partialContentMetadata`: Specific files to fetch diff for (`[{ file, additions?, deletions? }]`)
- `limit`: Max results (default: 5, max: 10)
- `page`: Page number (default: 1, max: 10)

**Additional filters:**
- `head`/`base`: Branch filters (source/target branch)
- `commenter`/`involves`/`mentions`: User involvement filters
- `review-requested`/`reviewed-by`: Review filters
- `no-label`/`no-milestone`/`no-project`/`no-assignee`: Negative filters
- `closed`/`merged-at`: Date-based close/merge filters
- `comments`/`reactions`/`interactions`: Numeric range filters
- `match`: Search scope (`title`, `body`, `comments`)

**Example queries:**

```
# Get specific PR/MR metadata
prNumber=123, type="metadata", owner="org", repo="app"

# Find merged PRs that changed auth
owner="org", repo="app", state="closed", merged=true, query="authentication"

# GitLab: Find MRs by state
owner="group", repo="project", state="merged", author="johndoe"

# Get PR with comments (understand WHY)
prNumber=123, type="metadata", withComments=true, owner="org", repo="app"
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

**What it does:** Read file content from repositories with flexible extraction options, or fetch an entire directory to disk for local tool analysis.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Branch** | Optional (auto-detects default) | **Required** (`branch` param) |
| **Identifier** | `owner` + `repo` + `path` | `owner` + `repo` + `path` + `branch` |
| **Directory fetch** | ✅ Supported (`type: "directory"`) | Not supported |

**Key parameters:**
- `owner` (required): Repository owner / GitLab Group
- `repo` (required): Repository name / GitLab Project
- `path` (required): File path or directory path in repository
- `branch`: Branch name (**required for GitLab**, optional for GitHub)
- `type`: `"file"` (default) or `"directory"` — controls fetch mode
- `fullContent`: Read entire file (use sparingly, file mode only)
- `startLine`/`endLine`: Line range (1-indexed, file mode only)
- `matchString`: Find specific content with context (file mode only)
- `matchStringContextLines`: Lines around match (default: 5, max: 50, file mode only)
- `charOffset`/`charLength`: Character-based pagination (file mode only)

**Fetch modes (choose ONE via `type`):**

| Mode | `type` | What it does | Returns |
|------|--------|-------------|---------|
| **File** (default) | `"file"` | Read a single file with extraction options | Inline content |
| **Directory** | `"directory"` | Fetch all files in a directory to disk | `localPath` for local tools |

**File mode extraction (choose ONE):**
1. `matchString` with context lines
2. `startLine` + `endLine`
3. `fullContent=true` (small configs only)

**Directory mode details:**
- **Requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`** (same as `githubCloneRepo`)
- Fetches all files via GitHub Contents API + `download_url` (no git required)
- Saves to `~/.octocode/repos/{owner}/{repo}/{branch}/{path}/` (same cache as clone tool)
- **Branch resolution**: If `branch` is omitted, auto-detects the default branch via GitHub API (same as `githubCloneRepo`)
- The resolved branch name is always included in the result (`branch` field) and the cache path
- 24-hour cache TTL (same as `githubCloneRepo`)
- Returns `localPath` — use with `localSearchCode`, `localGetFileContent`, `localViewStructure`, etc.
- Limits: max 50 files, max 5MB total, max 300KB per file, skips binary files
- Shares cache with clone tool — fetching multiple directories builds up the same repo cache

**Example queries:**

```
# GitHub: Read specific function (file mode, default)
owner="vercel", repo="next.js", path="packages/next/src/server/app-render.tsx",
matchString="export function handleAuth", matchStringContextLines=20

# GitHub: Read file header
owner="facebook", repo="react", path="packages/react/index.js",
startLine=1, endLine=50

# GitHub: Fetch entire directory to disk (directory mode)
# Requires ENABLE_LOCAL=true and ENABLE_CLONE=true
owner="facebook", repo="react", path="packages/react/src",
type="directory", branch="main"
# Returns localPath — use with localSearchCode, localGetFileContent, etc.

# GitLab: Read file (branch required!)
owner="group", repo="project", path="src/main.ts",
branch="main", matchString="export class"

# Read entire config (small files only)
path="package.json", fullContent=true, owner="org", repo="repo"
```

**⚠️ Gotchas:**
- Choose ONE mode: `matchString` OR `startLine/endLine` OR `fullContent` (file mode only)
- When `type="directory"`: `startLine`, `endLine`, `matchString`, `charOffset`, `charLength` are rejected
- **Directory mode requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`**
- Max file size: 300KB (FILE_TOO_LARGE error)
- Directory mode: max 50 files, max 5MB total, skips binary files
- **GitLab REQUIRES `branch`** - unlike GitHub which auto-detects
- For `branch`: Use NAME (e.g., `main`), not SHA
- Prefer `matchString` for large files (token efficient)
- Directory mode shares cache with `githubCloneRepo` — if a clone exists, it's reused

---

### `githubViewRepoStructure`

**What it does:** Display the directory tree structure of a repository.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Identifier** | `owner` + `repo` + `branch` | `owner` + `repo` + `branch` |
| **Depth control** | 1-2 levels | Recursive by default |

**Key parameters:**
- `owner` (required): Repository owner / GitLab Group
- `repo` (required): Repository name / GitLab Project
- `branch` (required): Branch name (required for both GitHub and GitLab)
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
# GitHub: See root structure
owner="vercel", repo="next.js", branch="canary", path="", depth=1

# GitHub: Drill into source directory
owner="facebook", repo="react", branch="main", path="packages", depth=2

# GitLab: View project structure
owner="group", repo="project", branch="main", path=""

# GitLab: Explore specific path
owner="group", repo="project", branch="develop", path="src/api"
```

**⚠️ Gotchas:**
- Start at root (`path=""`, `depth=1`) first
- `depth=2` is slow on large directories - use on subdirs only
- For monorepos: Check `packages/`, `apps/`, `libs/`
- Max 200 entries per page - check `summary.truncated`
- Noisy directories auto-filtered: `.git`, `node_modules`, `dist`

---

### `githubCloneRepo`

**What it does:** Clone or partially fetch a GitHub repository to the local filesystem for deep analysis with local and LSP tools.

> **GitHub only** — not available with GitLab. Requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true`.

| Feature | Description |
|---------|-------------|
| **Full clone** | Shallow `git clone --depth 1` of the entire repo |
| **Partial fetch** | Sparse checkout of a single subdirectory (fast for monorepos) |
| **Caching** | Cloned repos cached for **24 hours** under `~/.octocode/repos/` |
| **After clone** | Returns `localPath` — pass it to local + LSP tools |

**Key parameters:**
- `owner` (required): Repository owner or organization (max 200 chars)
- `repo` (required): Repository name (max 150 chars)
- `branch`: Branch to clone (max 255 chars). Omit to auto-detect the repo's default branch via the GitHub API (falls back to `main`)
- `sparse_path`: Fetch only this subdirectory via sparse checkout (max 500 chars). Dramatically faster for large monorepos. Examples: `src/compiler`, `packages/core/src`

**Two modes:**

| Mode | When to use | Parameter |
|------|-------------|-----------|
| **Full clone** | General exploration, LSP needs full project context | _(default — omit `sparse_path`)_ |
| **Partial fetch** | Large monorepo, only need a specific package/dir | `sparse_path="packages/core"` |

**Branch resolution:**
- If `branch` is provided, that specific branch is cloned
- If `branch` is **omitted**, the default branch is **auto-detected** via the GitHub API (falls back to `main`)
- The resolved branch name is **always included** in the result (`branch` field) and the cache path

**Cache path format:** `~/.octocode/repos/{owner}/{repo}/{branch}/` (branch is always present)

**Example queries:**

```
# Clone entire repo (branch auto-detected)
owner="vercel", repo="next.js"
# → localPath: ~/.octocode/repos/vercel/next.js/canary (auto-detected default branch)

# Clone specific branch
owner="facebook", repo="react", branch="main"
# → localPath: ~/.octocode/repos/facebook/react/main

# Sparse checkout — only fetch one directory (fast!)
owner="microsoft", repo="TypeScript", sparse_path="src/compiler"
# → localPath: ~/.octocode/repos/microsoft/TypeScript/main__sp_a3f8c1
```

**After cloning, use these tools on the returned `localPath`:**
- `localSearchCode` — ripgrep code search
- `localGetFileContent` — read files
- `localViewStructure` — browse directory tree
- `localFindFiles` — find files by name/metadata
- `lspGotoDefinition` — jump to symbol definitions
- `lspFindReferences` — find all usages of a symbol
- `lspCallHierarchy` — trace call relationships

**⚠️ Gotchas:**
- **GitHub only** — returns an error if GitLab is the active provider
- Requires `ENABLE_LOCAL=true` and `ENABLE_CLONE=true` (both must be enabled)
- Clone timeout: **2 minutes** for full clone, **30 seconds** for sparse checkout
- Use `sparse_path` for large monorepos to avoid downloading unnecessary files
- Cached clones are reused within 24 hours (idempotent)
- Branch is **auto-detected** when omitted — the resolved branch is always in the result
- Cache path includes branch: `{owner}/{repo}/{branch}/` — different branches get separate caches
- Auth token is passed via `http.extraHeader` — never persisted in the clone URL or on-disk git config

---

## Package Tools (Detailed)

### `packageSearch`

**What it does:** Lookup NPM or Python packages to find their source repositories.

| Feature | Description |
|---------|-------------|
| **Ecosystems** | NPM (npm) and Python (PyPI) |
| **Repository URL** | Get owner/repo for further exploration |
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

**vs GitHub/GitLab Search:**
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

### Flow 6: "Research GitLab internal projects" (GitLab-specific)

```
githubSearchRepositories (gitlab) → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

**Steps:**
1. **Ensure `GITLAB_TOKEN` is set.**
2. `githubSearchRepositories(keywordsToSearch=["auth"])` → Find projects
3. `githubViewRepoStructure(owner="group", repo="project", branch="main")` → See structure
4. `githubSearchCode(owner="group", repo="project", keywordsToSearch=["handler"])` → Find code
5. `githubGetFileContent(owner="group", repo="project", branch="main", path="src/handler.ts")` → Read

---

### Flow 7: "Deep analysis of external repo with LSP"

```
githubCloneRepo → localSearchCode → lspGotoDefinition → lspCallHierarchy
```

**Steps:**
1. `githubCloneRepo(owner="vercel", repo="next.js", sparse_path="packages/next/src")` → Get `localPath`
2. `localSearchCode(pattern="handleRequest", path=localPath)` → Find code + get `lineHint`
3. `lspGotoDefinition(uri="file.ts", symbolName="handleRequest", lineHint=42)` → Jump to definition
4. `lspCallHierarchy(direction="incoming")` → Trace callers

**When to use:** You need semantic analysis (LSP) on an external codebase — definitions, references, call hierarchy. Clone it first, then use local + LSP tools.

---

## Quick Reference

### Tool Selection Guide

| Question | Tool |
|----------|------|
| "Search code patterns" | `githubSearchCode` |
| "Find repositories/projects about X" | `githubSearchRepositories` |
| "Find PRs/MRs that changed X" | `githubSearchPullRequests` |
| "Read file from repo" | `githubGetFileContent` |
| "Browse repo directory tree" | `githubViewRepoStructure` |
| "Clone repo for local + LSP analysis" | `githubCloneRepo` |
| "Get repo URL for package X" | `packageSearch` |

### Provider vs Local Tools

| Scenario | Use |
|----------|-----|
| Your codebase (files on disk) | **Local tools** + LSP |
| External repos — quick browse/read | **GitHub/GitLab tools** |
| External repos — deep LSP analysis | `githubCloneRepo` → **Local tools** + LSP |
| Found import, need source? | `packageSearch` → Provider tools |

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

`packageSearch` gives you exact repo URL; search gives broad results.

### ⚠️ Rule 3: Start Lean with Filters

```
❌ WRONG: extension="ts" + filename="config" + path="src"
✅ RIGHT: keywordsToSearch=["config"] + extension="ts"
```

Search APIs fail with too many combined filters.

### ⚠️ Rule 4: Metadata First for PRs/MRs

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

### ⚠️ Rule 6: GitLab Requires `branch` for File Content

```
❌ WRONG (GitLab): githubGetFileContent(owner="g", repo="p", path="file.ts")
✅ RIGHT (GitLab): githubGetFileContent(owner="g", repo="p", path="file.ts", branch="main")
```

Unlike GitHub, GitLab does not auto-detect the default branch.

### ⚠️ Rule 7: GitLab Code Search Needs Scope

```
❌ WRONG (GitLab): githubSearchCode(keywordsToSearch=["auth"])
✅ RIGHT (GitLab): githubSearchCode(owner="g", repo="p", keywordsToSearch=["auth"])
```

GitLab requires project scope for code search.

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Using provider tools for local code | Slower, less semantic | Use local + LSP tools |
| Searching GitHub for known packages | Broad results | `packageSearch` first |
| Too many filters in code search | API fails | Start with 1-2 filters |
| `fullContent=true` on large files | Token waste | Use `matchString` |
| `type=fullContent` for PRs | Token expensive | `metadata` → `partialContent` |
| Ignoring `packageSearch` | Miss exact repo URL | Always check for packages |
| GitLab without `branch` | API error | Always specify `branch` for GitLab file content |
| GitLab code search without scope | API error | Specify `owner` and `repo` |
| Cloning repo just to read one file | Slow, wastes disk | Use `githubGetFileContent` instead |
| Cloning without `sparse_path` on monorepo | Downloads everything | Set `sparse_path` to the dir you need |

---

## Environment Variables

### GitHub

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `OCTOCODE_TOKEN` | Octocode-specific token (highest priority) |
| `GH_TOKEN` | GitHub CLI compatible token |
| `GITHUB_API_URL` | Custom API URL for GitHub Enterprise |
| `ENABLE_CLONE` | Enable `githubCloneRepo` tool and `githubGetFileContent` directory mode (requires `ENABLE_LOCAL=true`) |

### GitLab

| Variable | Description |
|----------|-------------|
| `GITLAB_TOKEN` | GitLab personal access token |
| `GL_TOKEN` | GitLab token (fallback) |
| `GITLAB_HOST` | GitLab instance URL (default: `https://gitlab.com`) |

**Auto-detection:** If `GITLAB_TOKEN` is set, GitLab becomes the active provider.

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
- githubCloneRepo → localSearchCode / lspGotoDefinition (needs localPath)
```

**Batch limits:**
- All GitHub/GitLab tools: Up to **3 queries** per call
- Package search: Up to **3 queries** per call
