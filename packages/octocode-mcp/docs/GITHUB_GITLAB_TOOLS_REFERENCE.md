# GitHub & GitLab Tools Reference

> Complete reference for Octocode MCP code host tools - External research, code search, repository exploration, and package discovery across **GitHub and GitLab**.

---

## Overview

Octocode MCP provides **6 unified tools** for external code research that work with both **GitHub** and **GitLab**:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Search Tools** (3) | `githubSearchCode`, `githubSearchRepositories`, `githubSearchPullRequests` | Find code, repos, and PRs/MRs across providers |
| **Content Tools** (2) | `githubGetFileContent`, `githubViewRepoStructure` | Read files and browse repository trees |
| **Package Tools** (1) | `packageSearch` | Lookup NPM/PyPI packages → get repo URLs |

### Provider Selection

The active provider is determined by the **server configuration** (environment variables), not per tool call.

- **GitHub** (Default): Active when `GITHUB_TOKEN` is set.
- **GitLab**: Active when `GITLAB_TOKEN` is set (overrides GitHub).

**To switch providers:** You must change the environment variables of the MCP server.

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
| **`githubGetFileContent`** | Read file content from repositories. Supports line ranges, string matching with context, and pagination for large files. |
| **`githubViewRepoStructure`** | Display directory tree structure of a repository. Configurable depth and pagination. |

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
- `match`: Match scope (`name`, `description`, `readme`)
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

**What it does:** Read file content from repositories with flexible extraction options.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Branch** | Optional (auto-detects default) | **Required** (`branch` param) |
| **Identifier** | `owner` + `repo` + `path` | `owner` + `repo` + `path` + `branch` |

**Key parameters:**
- `owner`: Repository owner / GitLab Group
- `repo`: Repository name / GitLab Project
- `path` (required): File path in repository
- `branch`: Branch name (**required for GitLab**)
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
# GitHub: Read specific function
owner="vercel", repo="next.js", path="packages/next/src/server/app-render.tsx",
matchString="export function handleAuth", matchStringContextLines=20

# GitHub: Read file header
owner="facebook", repo="react", path="packages/react/index.js",
startLine=1, endLine=50

# GitLab: Read file (branch required!)
owner="group", repo="project", path="src/main.ts",
branch="main", matchString="export class"

# Read entire config (small files only)
path="package.json", fullContent=true, owner="org", repo="repo"
```

**⚠️ Gotchas:**
- Choose ONE mode: `matchString` OR `startLine/endLine` OR `fullContent`
- Max file size: 300KB (FILE_TOO_LARGE error)
- **GitLab REQUIRES `branch`** - unlike GitHub which auto-detects
- For `branch`: Use NAME (e.g., `main`), not SHA
- Prefer `matchString` for large files (token efficient)

---

### `githubViewRepoStructure`

**What it does:** Display the directory tree structure of a repository.

| Feature | GitHub | GitLab |
|---------|--------|--------|
| **Identifier** | `owner` + `repo` + `branch` | `owner` + `repo` + `branch` |
| **Depth control** | 1-2 levels | Recursive by default |

**Key parameters:**
- `owner`: Repository owner / GitLab Group
- `repo`: Repository name / GitLab Project
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

## Quick Reference

### Tool Selection Guide

| Question | Tool |
|----------|------|
| "Search code patterns" | `githubSearchCode` |
| "Find repositories/projects about X" | `githubSearchRepositories` |
| "Find PRs/MRs that changed X" | `githubSearchPullRequests` |
| "Read file from repo" | `githubGetFileContent` |
| "Browse repo directory tree" | `githubViewRepoStructure` |
| "Get repo URL for package X" | `packageSearch` |

### Provider vs Local Tools

| Scenario | Use |
|----------|-----|
| Your codebase (files on disk) | **Local tools** + LSP |
| External repos / libraries | **GitHub/GitLab tools** |
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

---

## Environment Variables

### GitHub

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `OCTOCODE_TOKEN` | Octocode-specific token (highest priority) |
| `GH_TOKEN` | GitHub CLI compatible token |
| `GITHUB_API_URL` | Custom API URL for GitHub Enterprise |

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
```

**Batch limits:**
- GitHub tools: Up to 3 queries per call
- GitLab tools: Up to 3 queries per call
- Package search: Up to 3 queries per call
