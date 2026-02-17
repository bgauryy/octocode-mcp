# Eval Test: `githubGetFileContent` (directory mode)

> **Rating: 9/10** | Category: GitHub | Last tested: Feb 17, 2026

---

## Tool Overview

Fetches all files from a GitHub directory to local disk via the Contents API. Sets `type: "directory"` to activate directory mode. Files are saved under `~/.octocode/repos/` with 24-hour cache. Returns `localPath` for use with local tools. Filters out binary files, minified files, and `.lock` files. Limited to 50 files / 5MB total / 300KB per file.

### Prerequisites

| Requirement | Details |
|-------------|---------|
| `ENABLE_LOCAL` | Must be `true` |
| `ENABLE_CLONE` | Must be `true` |
| `GITHUB_TOKEN` | Valid GitHub token (also via `OCTOCODE_TOKEN`, `GH_TOKEN`) |

### Schema Parameters (directory mode)

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | Yes | 1-200 chars | - |
| `repo` | string | Yes | 1-150 chars | - |
| `path` | string | Yes | Directory path in repo | - |
| `branch` | string | No | 1-255 chars | Default branch |
| `type` | enum | Yes | Must be `"directory"` | `"file"` |

### Parameters REJECTED in directory mode

| Parameter | Behavior |
|-----------|----------|
| `fullContent` (if `true`) | Validation error |
| `startLine` | Validation error |
| `endLine` | Validation error |
| `matchString` | Validation error |
| `charOffset` | Validation error |
| `charLength` | Validation error |

**Max queries per call: 3**

---

## Test Cases

### TC-1: Fetch Source Directory

**Goal:** Verify basic directory fetch saves files to disk.

```json
{
  "mainResearchGoal": "Fetch docs for local analysis",
  "researchGoal": "Directory fetch to disk",
  "reasoning": "Directory mode saves files for local tool usage",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "docs",
  "type": "directory"
}
```

**Expected:**
- [ ] `localPath` returned as absolute path under `~/.octocode/repos/`
- [ ] `fileCount > 0`
- [ ] `files` array has entries with `path`, `size`, `type: "file"`
- [ ] `totalSize` matches sum of file sizes
- [ ] Files exist on disk at `localPath`
- [ ] Helpful hints for using local tools

---

### TC-2: Fetch with Explicit Branch

**Goal:** Verify branch parameter works with directory mode.

```json
{
  "mainResearchGoal": "Fetch from specific branch",
  "researchGoal": "Branch-specific directory fetch",
  "reasoning": "Branch parameter should select correct branch",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "docs",
  "branch": "main",
  "type": "directory"
}
```

**Expected:**
- [ ] `branch: "main"` in result
- [ ] Content matches `main` branch on GitHub
- [ ] `localPath` usable by local tools

---

### TC-3: Fetch Nested Directory

**Goal:** Verify deeply nested directory paths work.

```json
{
  "mainResearchGoal": "Fetch nested config directory",
  "researchGoal": "Deep path directory fetch",
  "reasoning": "Nested paths should resolve correctly",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-shared/src/config",
  "type": "directory"
}
```

**Expected:**
- [ ] Returns config directory files (e.g. `defaults.ts`, `types.ts`)
- [ ] `directoryPath` matches queried path
- [ ] Files readable via `localGetFileContent`

---

### TC-4: Cache Behavior (Repeat Fetch)

**Goal:** Verify cached fetch returns immediately on second call.

```json
{
  "mainResearchGoal": "Test directory cache",
  "researchGoal": "Verify cache hit on repeat fetch",
  "reasoning": "Second fetch should use cache within 24h window",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "docs",
  "type": "directory"
}
```

**Expected:**
- [ ] `cached: true` on second call
- [ ] Same `localPath` as first fetch
- [ ] `expiresAt` valid ISO-8601, ~24h ahead
- [ ] `.octocode-clone-meta.json` exists with `source: "directoryFetch"`
- [ ] Second call much faster

---

### TC-5: File Filtering — Binary Files Excluded

**Goal:** Verify binary files are filtered out.

```json
{
  "mainResearchGoal": "Test binary file filtering",
  "researchGoal": "Verify binary exclusion",
  "reasoning": "Binary files should not be fetched",
  "owner": "facebook",
  "repo": "react",
  "path": "packages/react",
  "type": "directory"
}
```

**Expected:**
- [ ] `.png`, `.jpg`, `.gif` files NOT in `files` list
- [ ] `.lock` files excluded
- [ ] `.min.js` and `.min.css` files excluded
- [ ] Normal text files (`.ts`, `.js`, `.json`, `.md`) included

---

### TC-6: File Limits

**Goal:** Verify size and count limits are enforced.

| Limit | Value | Behavior |
|-------|-------|----------|
| Max files | 50 | Stops after 50 files |
| Max total size | 5MB | Stops accumulating at 5MB |
| Max per file | 300KB | Files >300KB excluded |
| Concurrent fetch | 5 | Files fetched in batches of 5 |

```json
{
  "mainResearchGoal": "Test file limits",
  "researchGoal": "Verify limits on large directory",
  "reasoning": "Limits prevent excessive fetching",
  "owner": "vercel",
  "repo": "next.js",
  "path": "packages/next/src/server",
  "type": "directory"
}
```

**Expected:**
- [ ] `fileCount` ≤ 50
- [ ] `totalSize` ≤ 5MB
- [ ] No individual file >300KB in results
- [ ] Partial results returned (not an error)

---

### TC-7: Schema Validation — Rejected Parameters

**Goal:** Verify file-mode parameters are rejected in directory mode.

| Query | Expected Error |
|-------|----------------|
| `type="directory", fullContent=true` | "not supported when type is directory" |
| `type="directory", startLine=1` | "not supported when type is directory" |
| `type="directory", endLine=10` | "not supported when type is directory" |
| `type="directory", matchString="export"` | "not supported when type is directory" |
| `type="directory", charOffset=100` | "not supported when type is directory" |
| `type="directory", charLength=500` | "not supported when type is directory" |
| `type="directory", fullContent=false` | No error (false is default) |

**Expected:**
- [ ] All file-mode parameters rejected with clear messages
- [ ] `fullContent=false` allowed (default value)

---

### TC-8: Failure — Invalid Targets

**Goal:** Verify graceful errors for invalid paths and repos.

| Input | Expected Error |
|-------|----------------|
| `path="package.json", type="directory"` | "not a directory. Use type file" |
| `path="nonexistent/dir", type="directory"` | 404 or path not found |
| `repo="nonexistent-xyz-999", type="directory"` | 404 error |
| `branch="nonexistent", type="directory"` | 404 error |

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "File path as directory",
  "reasoning": "Should reject file paths in directory mode",
  "owner": "facebook",
  "repo": "react",
  "path": "package.json",
  "type": "directory"
}
```

**Expected:**
- [ ] Clear error message distinguishing file vs directory
- [ ] Non-existent paths return 404
- [ ] Errors isolated per query in bulk calls

---

### TC-9: Failure — Missing Prerequisites

**Goal:** Verify errors when clone features are disabled.

| Condition | Expected Error |
|-----------|----------------|
| `ENABLE_CLONE=false` | "requires ENABLE_LOCAL=true and ENABLE_CLONE=true" |
| `ENABLE_LOCAL=false` | Tool not available or clone not enabled |
| No `GITHUB_TOKEN` | Authentication error |

**Expected:**
- [ ] Clear, actionable error messages
- [ ] File mode (`type="file"`) still works when clone is disabled

---

### TC-10: Edge Cases

**Goal:** Verify handling of unusual but valid inputs.

| Input | Expected |
|-------|----------|
| `path="."` | Returns root-level files |
| `path="docs/"` (trailing slash) | Handles trailing slash gracefully |
| Directory with only binary files | `fileCount: 0`, `files: []` |
| Directory with subdirectories | Subdirectories NOT fetched (only immediate files) |
| Directory with dotfiles (`.eslintrc`) | Dotfiles included (not binary) |
| Very deep path (`packages/next/src/server/app-render`) | Fetches deeply nested directory |

**Expected:**
- [ ] All valid edge cases handled without errors
- [ ] Empty results returned as valid (not errors)

---

### TC-11: Local Tools Integration

**Goal:** Verify fetched directory works with local tools.

```json
{
  "mainResearchGoal": "Verify local tools work on fetch",
  "researchGoal": "Test local tools after directory fetch",
  "reasoning": "Directory fetch value comes from local tool usage",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-shared/src/config",
  "type": "directory"
}
```

**Post-fetch steps:**
1. `localViewStructure(path=localPath)` → shows fetched files
2. `localSearchCode(pattern="export", path=localPath)` → finds matches
3. `localGetFileContent(path=localPath + "/defaults.ts", fullContent=true)` → readable content
4. `localFindFiles(path=localPath, name="*.ts", type="f")` → returns TypeScript files

**Expected:**
- [ ] All four local tools work on the fetched path
- [ ] Files on disk match the `files` array in response
- [ ] File content readable and valid

---

### TC-12: Cross-Tool — Directory Fetch vs Clone

**Goal:** Verify directory fetch and clone have separate caches.

**Steps:**
1. `githubGetFileContent(owner="bgauryy", repo="octocode-mcp", path="docs", type="directory")`
2. `githubCloneRepo(owner="bgauryy", repo="octocode-mcp")`

**Expected:**
- [ ] Clone ignores directoryFetch cache (performs fresh clone)
- [ ] Different cache directories
- [ ] Both `localPath` values usable by local tools
- [ ] File mode (`type="file"`) still returns inline content (no disk write)

---

### TC-13: Bulk Queries

**Goal:** Verify multiple directory fetches in a single call.

```json
{
  "queries": [
    {
      "mainResearchGoal": "Bulk directory fetch",
      "researchGoal": "Fetch docs",
      "reasoning": "Parallel fetch",
      "owner": "bgauryy",
      "repo": "octocode-mcp",
      "path": "docs",
      "type": "directory"
    },
    {
      "mainResearchGoal": "Bulk directory fetch",
      "researchGoal": "Fetch config",
      "reasoning": "Parallel fetch",
      "owner": "bgauryy",
      "repo": "octocode-mcp",
      "path": "packages/octocode-shared/src/config",
      "type": "directory"
    },
    {
      "mainResearchGoal": "Bulk directory fetch",
      "researchGoal": "Read a file",
      "reasoning": "Mixed mode test",
      "owner": "bgauryy",
      "repo": "octocode-mcp",
      "path": "README.md"
    }
  ]
}
```

**Expected:**
- [ ] Directory queries return `localPath` + file list
- [ ] File query returns inline content (no disk write)
- [ ] Mixed file + directory queries work in same call

---

### TC-14: Root Directory Fetch

**Goal:** Verify `path: ""` or `path: "."` fetches root-level files.

```json
{
  "mainResearchGoal": "Test root directory fetch",
  "researchGoal": "Fetch repo root files",
  "reasoning": "Root path edge case",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "",
  "type": "directory"
}
```

**Expected:**
- [ ] Root-level files returned (README.md, package.json, etc.)
- [ ] `fileCount > 0`
- [ ] No subdirectory files (only immediate files)
- [ ] No error with empty path

---

### TC-15: Trailing Slash in Path

**Goal:** Verify directory path with trailing slash is handled gracefully.

```json
{
  "mainResearchGoal": "Test trailing slash",
  "researchGoal": "Path with trailing slash",
  "reasoning": "Users may include trailing slash",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "docs/",
  "type": "directory"
}
```

**Expected:**
- [ ] Same results as `path: "docs"` without trailing slash
- [ ] No error
- [ ] `localPath` valid and usable

---

### TC-16: Directory with Only Filtered Files

**Goal:** Verify behavior when all files in directory are filtered out (binary, .lock, .min).

```json
{
  "mainResearchGoal": "Test all-filtered scenario",
  "researchGoal": "Directory where all files get filtered",
  "reasoning": "Edge case: all files are binary or excluded types",
  "owner": "facebook",
  "repo": "react",
  "path": "fixtures/art",
  "type": "directory"
}
```

**Expected:**
- [ ] `fileCount: 0` and `files: []` (if all files filtered)
- [ ] Or whatever files pass the filter
- [ ] No error thrown for empty result
- [ ] Valid response structure

---

### TC-17: Dotfiles in Directory

**Goal:** Verify dotfiles (like `.eslintrc`, `.gitignore`) are included.

```json
{
  "mainResearchGoal": "Test dotfile inclusion",
  "researchGoal": "Verify dotfiles fetched",
  "reasoning": "Dotfiles should be included as text files",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "",
  "type": "directory"
}
```

**Expected:**
- [ ] Dotfiles like `.gitignore`, `.eslintrc` included in files list
- [ ] Dotfiles are text files and pass binary filter
- [ ] Content readable via `localGetFileContent`

---

### TC-18: Very Deep Path

**Goal:** Verify very deep directory paths work correctly.

```json
{
  "mainResearchGoal": "Test deep path",
  "researchGoal": "Deeply nested directory fetch",
  "reasoning": "Deep paths should resolve correctly",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/security/regexes",
  "type": "directory"
}
```

**Expected:**
- [ ] Contents of deeply nested directory returned
- [ ] Files like `index.ts`, `ai-providers.ts` visible
- [ ] No path resolution errors
- [ ] `localPath` valid and usable

---

### TC-19: Default Branch Auto-Detection

**Goal:** Verify directory fetch works without explicit branch (auto-detection).

```json
{
  "mainResearchGoal": "Test auto branch detection",
  "researchGoal": "Directory fetch without branch",
  "reasoning": "Branch should be auto-detected via API",
  "owner": "expressjs",
  "repo": "express",
  "path": "lib",
  "type": "directory"
}
```

**Expected:**
- [ ] Default branch auto-detected
- [ ] Branch name included in response
- [ ] `localPath` valid and contains lib/ files
- [ ] No error about missing branch

---

## Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All TC-1 through TC-19 pass. Fetch/cache/filters/schema/integration all work. |
| 9 | 17-18 pass; minor issue (e.g. trailing slash handling) |
| 8 | 15-16 pass; directory fetch works but some limit/filter edge cases |
| 7 | 13-14 pass; basic fetch works but cache or schema validation gaps |
| ≤6 | Core directory fetch fails, files not saved to disk, schema allows invalid combos |

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Fetch source directory | |
| 2 | Fetch with explicit branch | |
| 3 | Fetch nested directory | |
| 4 | Cache behavior | |
| 5 | Binary file filtering | |
| 6 | File limits | |
| 7 | Schema validation — rejected params | |
| 8 | Failure — invalid targets | |
| 9 | Failure — missing prerequisites | |
| 10 | Edge cases | |
| 11 | Local tools integration | |
| 12 | Cross-tool — fetch vs clone | |
| 13 | Bulk queries | |
| 14 | Root directory fetch | |
| 15 | Trailing slash in path | |
| 16 | Directory with only filtered files | |
| 17 | Dotfiles in directory | |
| 18 | Very deep path | |
| 19 | Default branch auto-detection | |
