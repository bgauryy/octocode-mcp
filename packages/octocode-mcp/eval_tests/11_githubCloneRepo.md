# Eval Test: `githubCloneRepo`

> **Rating: 9/10** | Category: GitHub | Last tested: Feb 17, 2026

---

## Tool Overview

Clones a GitHub repository (shallow, `--depth 1`) to a local cache directory (`~/.octocode/repos/`). Supports sparse checkout for fetching only specific subdirectories. Cache expires after 24 hours. Returns `localPath` for use with local tools and LSP.

### Prerequisites

| Requirement | Details |
|-------------|---------|
| `ENABLE_LOCAL` | Must be `true` |
| `ENABLE_CLONE` | Must be `true` |
| `GITHUB_TOKEN` | Valid GitHub token (also via `OCTOCODE_TOKEN`, `GH_TOKEN`) |
| **git** | Must be installed and on PATH |

### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | Yes | 1-200 chars, GitHub identifier regex | - |
| `repo` | string | Yes | 1-150 chars, GitHub identifier regex | - |
| `branch` | string | No | 1-255 chars, no `..`, no leading `-` | Default branch (API lookup) |
| `sparse_path` | string | No | 1-500 chars, relative, no `..`, no leading `-` or `/` | Full clone |
| `mainResearchGoal` | string | Yes | Research context | - |
| `researchGoal` | string | Yes | Research context | - |
| `reasoning` | string | Yes | Research context | - |

**Max queries per call: 3**

---

## Test Cases

### TC-1: Full Clone

**Goal:** Verify full repository clone without sparse path.

```json
{
  "mainResearchGoal": "Clone octocode-mcp for local analysis",
  "researchGoal": "Full shallow clone",
  "reasoning": "Full clone enables comprehensive local analysis",
  "owner": "bgauryy",
  "repo": "octocode-mcp"
}
```

**Expected:**
- [ ] Successful clone to `~/.octocode/repos/bgauryy/octocode-mcp/{branch}/`
- [ ] `localPath` returned as absolute path
- [ ] `expiresAt` shows 24-hour TTL
- [ ] `cached: false` on first call
- [ ] `.git/` directory exists in `localPath`
- [ ] Shallow clone (only 1 commit in git log)
- [ ] Helpful hints for using local tools on cloned path

---

### TC-2: Sparse Checkout

**Goal:** Verify `sparse_path` clones only a specific subdirectory.

```json
{
  "mainResearchGoal": "Clone only the tools directory",
  "researchGoal": "Sparse checkout of subdirectory",
  "reasoning": "Sparse checkout is faster for large repos",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "sparse_path": "packages/octocode-mcp/src/tools"
}
```

**Expected:**
- [ ] Only `packages/octocode-mcp/src/tools` tree downloaded
- [ ] Cache path includes hash suffix (`__sp_{hash}`)
- [ ] `sparse_path` returned in result
- [ ] Much faster than full clone
- [ ] Files outside sparse_path are NOT present on disk

---

### TC-3: Explicit Branch

**Goal:** Verify `branch` parameter selects correct branch.

```json
{
  "mainResearchGoal": "Clone specific branch",
  "researchGoal": "Branch selection",
  "reasoning": "Branch parameter should clone specific branch",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main"
}
```

**Expected:**
- [ ] Cloned from `main` branch
- [ ] Cache path includes branch name (`main/`)
- [ ] `branch: "main"` in result
- [ ] Content matches `main` branch on GitHub

---

### TC-4: Default Branch Auto-Detection

**Goal:** Verify branch is auto-detected when omitted.

```json
{
  "mainResearchGoal": "Test auto branch detection",
  "researchGoal": "Clone without specifying branch",
  "reasoning": "Tool should detect default branch via GitHub API",
  "owner": "expressjs",
  "repo": "express"
}
```

**Expected:**
- [ ] Default branch auto-detected via API (e.g. `master` or `main`)
- [ ] Branch name included in response
- [ ] No error about missing branch
- [ ] `localPath` under `~/.octocode/repos/expressjs/express/{branch}/`

---

### TC-5: Cache Behavior (Repeat Clone)

**Goal:** Verify cached clone returns immediately on second call.

```json
{
  "mainResearchGoal": "Test cache behavior",
  "researchGoal": "Verify cache hit on repeat clone",
  "reasoning": "Second clone should use cache within 24h window",
  "owner": "bgauryy",
  "repo": "octocode-mcp"
}
```

**Expected:**
- [ ] `cached: true` on second call (within 24h)
- [ ] Same `localPath` as first clone
- [ ] Much faster response time
- [ ] `expiresAt` shows remaining TTL
- [ ] `.octocode-clone-meta.json` exists with `clonedAt`, `expiresAt`, `owner`, `repo`, `branch`, `source: "clone"`

---

### TC-6: Sparse Clone with Branch

**Goal:** Verify sparse checkout works with explicit branch.

```json
{
  "mainResearchGoal": "Clone sparse from specific branch",
  "researchGoal": "Sparse + branch combination",
  "reasoning": "Both parameters should work together",
  "owner": "facebook",
  "repo": "react",
  "branch": "main",
  "sparse_path": "packages/react"
}
```

**Expected:**
- [ ] Only `packages/react` tree from `main` branch
- [ ] Cache path includes branch + sparse hash
- [ ] `localPath` usable by local tools

---

### TC-7: Different Sparse Paths Same Repo

**Goal:** Verify different sparse paths create separate cache entries.

```json
[
  {
    "mainResearchGoal": "Test separate sparse caches",
    "researchGoal": "Sparse path A",
    "reasoning": "Different sparse paths should have different caches",
    "owner": "facebook",
    "repo": "react",
    "sparse_path": "packages/react"
  },
  {
    "mainResearchGoal": "Test separate sparse caches",
    "researchGoal": "Sparse path B",
    "reasoning": "Different sparse paths should have different caches",
    "owner": "facebook",
    "repo": "react",
    "sparse_path": "packages/react-dom"
  }
]
```

**Expected:**
- [ ] Two separate cache directories (`__sp_{hash1}` vs `__sp_{hash2}`)
- [ ] Each `localPath` contains only its sparse subtree
- [ ] Both return independently valid results

---

### TC-8: Local Tools Integration

**Goal:** Verify cloned path works with all local tools.

```json
{
  "mainResearchGoal": "Verify local tools work on clone",
  "researchGoal": "Test local tool integration after clone",
  "reasoning": "Clone's value comes from using local + LSP tools",
  "owner": "expressjs",
  "repo": "express"
}
```

**Post-clone steps:**
1. `localViewStructure(path=localPath, depth=2)` → shows `lib/`, `test/`, `package.json`
2. `localSearchCode(pattern="middleware", path=localPath)` → finds matches
3. `localGetFileContent(path=localPath + "/package.json", fullContent=true)` → valid JSON
4. `localFindFiles(path=localPath, name="*.js", type="f")` → returns JS files

**Expected:**
- [ ] All four local tools work on the cloned path
- [ ] File content matches GitHub version
- [ ] Structure shows expected directories

---

### TC-9: Clone → LSP Workflow

**Goal:** Verify full research funnel works on cloned repo.

```json
{
  "mainResearchGoal": "Full LSP workflow on clone",
  "researchGoal": "Clone then use LSP tools",
  "reasoning": "LSP tools should work on cloned TypeScript code",
  "owner": "bgauryy",
  "repo": "octocode-mcp"
}
```

**Post-clone steps:**
1. `localSearchCode(pattern="export function", path=localPath)` → get lineHint
2. `lspGotoDefinition(uri=file, symbolName=fn, lineHint=N)` → resolves definition
3. `lspFindReferences(uri=file, symbolName=fn, lineHint=N)` → finds usages
4. `lspCallHierarchy(uri=file, symbolName=fn, lineHint=N, direction="incoming")` → traces calls

**Expected:**
- [ ] LSP resolves definitions from cloned code
- [ ] References found across cloned files
- [ ] Call hierarchy traces function relationships

---

### TC-10: Security — Path Traversal

**Goal:** Verify path traversal attempts are rejected.

| Input | Expected |
|-------|----------|
| `owner="../etc"` | Schema validation error (regex rejects `..`) |
| `repo="../../passwd"` | Schema validation error |
| `sparse_path="../../etc/passwd"` | Schema validation error |
| `sparse_path="/etc/passwd"` | Schema validation error (leading `/`) |

```json
{
  "mainResearchGoal": "Security test",
  "researchGoal": "Path traversal prevention",
  "reasoning": "Ensure malicious paths are rejected",
  "owner": "../etc",
  "repo": "passwd"
}
```

**Expected:**
- [ ] All path traversal variants rejected at schema level
- [ ] Error messages do not expose internal paths

---

### TC-11: Security — Flag Injection

**Goal:** Verify git flag injection attempts are rejected.

| Input | Expected |
|-------|----------|
| `branch="--upload-pack=evil"` | Schema error (starts with `-`) |
| `sparse_path="--config=evil"` | Schema error (starts with `-`) |
| `owner="foo\\bar"` | Schema error (no backslash) |

**Expected:**
- [ ] Leading dash rejected in branch and sparse_path
- [ ] Backslash rejected in owner/repo
- [ ] Token NOT present in error messages

---

### TC-12: Failure — Non-Existent Targets

**Goal:** Verify graceful errors for invalid repos/branches.

| Input | Expected Error |
|-------|----------------|
| `owner="facebook", repo="nonexistent-xyz-999"` | Clone failed error |
| `branch="nonexistent-branch-xyz"` | Clone failed error |
| `sparse_path="nonexistent/deep/path"` | Empty tree or warning |

**Expected:**
- [ ] Clear error messages (not stack traces)
- [ ] Token NOT exposed in error output
- [ ] Errors isolated per query in bulk calls

---

### TC-13: Failure — Missing Prerequisites

**Goal:** Verify errors when prerequisites are not met.

| Condition | Expected Error |
|-----------|----------------|
| `ENABLE_LOCAL=false` | Tool not registered / not available |
| `ENABLE_CLONE=false` | Tool not registered / not available |
| git not on PATH | "git is not installed or not on PATH" |
| GitLab provider active | "only available with the GitHub provider" |

**Expected:**
- [ ] Clear, actionable error messages
- [ ] Tool does not appear in tool list when disabled

---

### TC-14: Failure — Schema Validation

**Goal:** Verify schema rejects invalid inputs.

| Input | Expected Error |
|-------|----------------|
| Missing `owner` | Validation error: owner required |
| Missing `repo` | Validation error: repo required |
| `owner=""` | Validation error: min 1 char |
| `queries=[]` | Validation error: min 1 query |
| 4 queries | Validation error: max 3 queries |

**Expected:**
- [ ] All validation errors caught before any API/git calls
- [ ] Descriptive error messages

---

### TC-15: Bulk Queries

**Goal:** Verify multiple clones in a single call.

```json
{
  "queries": [
    {
      "mainResearchGoal": "Bulk clone test",
      "researchGoal": "Clone repo 1",
      "reasoning": "Parallel clone",
      "owner": "expressjs",
      "repo": "express"
    },
    {
      "mainResearchGoal": "Bulk clone test",
      "researchGoal": "Clone repo 2",
      "reasoning": "Parallel clone",
      "owner": "lodash",
      "repo": "lodash"
    },
    {
      "mainResearchGoal": "Bulk clone test",
      "researchGoal": "Clone repo 3",
      "reasoning": "Parallel clone",
      "owner": "bgauryy",
      "repo": "octocode-mcp"
    }
  ]
}
```

**Expected:**
- [ ] 3 result sets returned, each with `localPath`
- [ ] All three repos cloned independently
- [ ] Mixed valid/invalid queries: failures isolated per query

---

### TC-16: Edge Cases

**Goal:** Verify handling of unusual but valid inputs.

| Input | Expected |
|-------|----------|
| `owner="user.name", repo="my.repo"` | Handles dots in identifiers |
| `owner="my_org", repo="my_repo"` | Handles underscores |
| `branch="feature/new-api"` | Handles slashes in branch |
| `sparse_path="README.md"` | Sparse checkout of single file area |
| No branch (omitted) | Falls back to API default branch |

**Expected:**
- [ ] All valid edge cases accepted and clone succeeds
- [ ] Identifiers with special chars handled correctly

---

### TC-17: Bulk Queries with Mixed Results (Error Isolation)

**Goal:** Verify error isolation in bulk queries — valid and invalid mixed.

```json
{
  "queries": [
    {
      "mainResearchGoal": "Bulk error test",
      "researchGoal": "Clone valid repo",
      "reasoning": "Should succeed",
      "owner": "bgauryy",
      "repo": "octocode-mcp"
    },
    {
      "mainResearchGoal": "Bulk error test",
      "researchGoal": "Clone non-existent repo",
      "reasoning": "Should fail gracefully",
      "owner": "bgauryy",
      "repo": "nonexistent-xyz-99999"
    },
    {
      "mainResearchGoal": "Bulk error test",
      "researchGoal": "Clone with bad branch",
      "reasoning": "Should fail gracefully",
      "owner": "bgauryy",
      "repo": "octocode-mcp",
      "branch": "nonexistent-branch-xyz"
    }
  ]
}
```

**Expected:**
- [ ] First query succeeds with valid `localPath`
- [ ] Second query returns clone error (repo not found)
- [ ] Third query returns clone error (branch not found)
- [ ] Token NOT exposed in any error messages
- [ ] Each result isolated — first success not affected by later failures

---

### TC-18: Owner/Repo Max Length (Boundary)

**Goal:** Verify schema handles owner and repo at max allowed length.

| Input | Expected |
|-------|----------|
| `owner` = 200 char string | Accepted (max 200) |
| `owner` = 201 char string | Schema validation error |
| `repo` = 150 char string | Accepted (max 150) |
| `repo` = 151 char string | Schema validation error |

**Expected:**
- [ ] Values at max length accepted
- [ ] Values over max length rejected with validation error
- [ ] No crash on boundary values

---

### TC-19: Branch With Special Characters

**Goal:** Verify branch names with slashes and dots work correctly.

```json
{
  "mainResearchGoal": "Test branch name edge cases",
  "researchGoal": "Branch with special characters",
  "reasoning": "Real-world branches often have slashes and dots",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "improve-local-tools"
}
```

**Expected:**
- [ ] Clone succeeds with hyphenated branch name
- [ ] Cache path includes branch name
- [ ] `localPath` usable by local tools

---

### TC-20: Sparse Path to Single File Area

**Goal:** Verify `sparse_path` targeting a very specific/small directory.

```json
{
  "mainResearchGoal": "Test minimal sparse checkout",
  "researchGoal": "Sparse path to small directory",
  "reasoning": "Sparse checkout of smallest useful unit",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "sparse_path": "docs"
}
```

**Expected:**
- [ ] Only `docs/` directory contents downloaded
- [ ] Very fast clone (small scope)
- [ ] `localPath` contains docs files
- [ ] Other directories NOT present

---

## Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All TC-1 through TC-20 pass. Full/sparse/cache/security/integration all work. |
| 9 | 18-19 pass; minor issue (e.g. default branch fallback) |
| 8 | 16-17 pass; sparse clone works but cache edge cases fail |
| 7 | 14-15 pass; full clone works but sparse or LSP issues |
| ≤6 | Core cloning fails, cache broken, security validation missing |

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Full clone | |
| 2 | Sparse checkout | |
| 3 | Explicit branch | |
| 4 | Default branch detection | |
| 5 | Cache behavior | |
| 6 | Sparse clone with branch | |
| 7 | Different sparse paths | |
| 8 | Local tools integration | |
| 9 | Clone → LSP workflow | |
| 10 | Security — path traversal | |
| 11 | Security — flag injection | |
| 12 | Failure — non-existent targets | |
| 13 | Failure — missing prerequisites | |
| 14 | Failure — schema validation | |
| 15 | Bulk queries | |
| 16 | Edge cases | |
| 17 | Bulk queries with mixed results (error isolation) | |
| 18 | Owner/repo max length (boundary) | |
| 19 | Branch with special characters | |
| 20 | Sparse path to single file area | |
