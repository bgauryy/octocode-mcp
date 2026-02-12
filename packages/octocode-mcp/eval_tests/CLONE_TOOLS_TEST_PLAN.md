# Clone & Directory Fetch Tools — Comprehensive Test Plan

> Test plan for evaluating `githubCloneRepo` and `githubGetFileContent` (directory mode).
> Both tools download repository content to local disk for offline analysis with local tools and LSP.

---

## Prerequisites & Environment Requirements

### Required Environment Variables

| Variable | Required For | Default | Description |
|----------|-------------|---------|-------------|
| `GITHUB_TOKEN` | Both tools | - | GitHub personal access token (also via `OCTOCODE_TOKEN`, `GH_TOKEN`) |
| `ENABLE_LOCAL` | Both tools | `false` | Must be `true` to enable local filesystem tools |
| `ENABLE_CLONE` | Both tools | `false` | Must be `true` to enable clone/directory fetch features |

### Startup Configuration

```bash
# Minimum required environment for clone tools
export GITHUB_TOKEN="ghp_your_token_here"
export ENABLE_LOCAL=true
export ENABLE_CLONE=true
```

### System Requirements

| Requirement | Tool | Details |
|-------------|------|---------|
| **git** | `githubCloneRepo` only | Must be installed and on PATH. Verified via `git --version` pre-flight |
| **Network access** | Both tools | Access to `github.com` and `raw.githubusercontent.com` |
| **Disk space** | Both tools | Repos cached under `~/.octocode/repos/` (24h TTL) |
| **Node.js** | Both tools | For MCP server runtime |

### Verification Steps Before Testing

```
1. Verify git is installed:          git --version
2. Verify GitHub token works:        curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
3. Verify cache directory writable:  mkdir -p ~/.octocode/repos && touch ~/.octocode/repos/.test && rm ~/.octocode/repos/.test
4. Verify env vars set:              echo "LOCAL=$ENABLE_LOCAL CLONE=$ENABLE_CLONE TOKEN=${GITHUB_TOKEN:0:4}..."
```

---

## Table of Contents

1. [githubCloneRepo](#1-githubclonerepo)
   - [1.1 Full Clone Tests](#11-full-clone-tests)
   - [1.2 Sparse Clone Tests](#12-sparse-clone-tests)
   - [1.3 Cache Behavior Tests](#13-cache-behavior-tests)
   - [1.4 Security Tests](#14-security-tests)
   - [1.5 Edge Case Tests](#15-edge-case-tests)
   - [1.6 Failure Tests](#16-failure-tests)
   - [1.7 Integration Tests](#17-integration-tests-clone--local-tools)
2. [githubGetFileContent (directory mode)](#2-githubgetfilecontent-directory-mode)
   - [2.1 Normal Directory Fetch Tests](#21-normal-directory-fetch-tests)
   - [2.2 Cache Behavior Tests](#22-cache-behavior-tests)
   - [2.3 Filtering & Limits Tests](#23-filtering--limits-tests)
   - [2.4 Schema Validation Tests](#24-schema-validation-tests)
   - [2.5 Edge Case Tests](#25-edge-case-tests)
   - [2.6 Failure Tests](#26-failure-tests)
   - [2.7 Integration Tests](#27-integration-tests-directory-fetch--local-tools)
3. [Cross-Tool Tests](#3-cross-tool-tests)
4. [Bulk Query Tests](#4-bulk-query-tests)
5. [Quick Validation Sequence](#5-quick-validation-sequence)
6. [Scoring](#6-scoring)

---

## Test Repository Targets

| Repository | Owner | Purpose | Size |
|------------|-------|---------|------|
| express | expressjs | Small Node.js library, fast clones | Small |
| react | facebook | Large monorepo, sparse checkout testing | Large |
| next.js | vercel | TypeScript monorepo, directory fetch | Very Large |
| octocode-mcp | bgauryy | Self-reference, known structure | Medium |
| lodash | lodash | Utility library, many small files | Medium |

---

## 1. githubCloneRepo

### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | ✅ Yes | 1-200 chars, matches `/^(?!\.\.?$)(?!.*\.\.)[a-zA-Z0-9._-]+$/` | - |
| `repo` | string | ✅ Yes | 1-150 chars, matches same GitHub identifier regex | - |
| `branch` | string | No | 1-255 chars, matches `/^(?!-)(?!.*\.\.)(?!.*\\)[a-zA-Z0-9._/-]+$/` | Default branch (API lookup, fallback "main") |
| `sparse_path` | string | No | 1-500 chars, no leading `/`, no `..`, matches safe path regex | - (full clone) |
| `mainResearchGoal` | string | ✅ Yes | Research context | - |
| `researchGoal` | string | ✅ Yes | Research context | - |
| `reasoning` | string | ✅ Yes | Research context | - |

### Max queries per call: **3**

---

### 1.1 Full Clone Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GCR-N01 | Clone small public repo | `owner="expressjs", repo="express"` | Returns `localPath` under `~/.octocode/repos/expressjs/express/{branch}/`, `cached: false`, `expiresAt` ~24h from now |
| GCR-N02 | Clone with explicit branch | `owner="facebook", repo="react", branch="main"` | Returns `localPath`, `branch: "main"` in result |
| GCR-N03 | Default branch auto-detection | `owner="expressjs", repo="express"` (no branch) | Resolves default branch via API (e.g. "master" or "main"), returns `branch` in result |
| GCR-N04 | Clone returns absolute localPath | Any valid clone | `localPath` starts with `/` and is under `~/.octocode/repos/` |
| GCR-N05 | Clone creates valid git repo | Clone any repo, then verify | `localPath` contains `.git/` directory |
| GCR-N06 | Shallow clone (depth=1) | Clone any repo, check history | Only 1 commit in git log |
| GCR-N07 | Clone medium repo | `owner="lodash", repo="lodash"` | Completes within 2-minute timeout, returns valid `localPath` |

### Verification for Full Clone

```
After GCR-N01:
  ✓ localViewStructure(path=localPath) → shows repo files
  ✓ localSearchCode(pattern="express", path=localPath) → finds matches
  ✓ localGetFileContent(path=localPath + "/package.json", fullContent=true) → readable JSON
```

---

### 1.2 Sparse Clone Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GCR-S01 | Sparse clone single directory | `owner="facebook", repo="react", sparse_path="packages/react"` | `localPath` ends with `__sp_{hash}`, `sparse_path` in result |
| GCR-S02 | Sparse clone nested path | `owner="vercel", repo="next.js", sparse_path="packages/next/src/server"` | Only server directory files on disk |
| GCR-S03 | Sparse clone docs folder | `owner="bgauryy", repo="octocode-mcp", sparse_path="docs"` | Returns docs directory content, `sparse_path: "docs"` |
| GCR-S04 | Sparse clone root-level file area | `owner="expressjs", repo="express", sparse_path="lib"` | Only `lib/` directory fetched |
| GCR-S05 | Sparse path with slashes | `owner="facebook", repo="react", sparse_path="packages/react/src"` | Handles multi-level sparse path |
| GCR-S06 | Sparse clone with explicit branch | `owner="vercel", repo="next.js", branch="canary", sparse_path="packages/next"` | Uses canary branch |
| GCR-S07 | Different sparse paths same repo | Clone same repo twice with different `sparse_path` | Two separate cache directories (`__sp_{hash1}` vs `__sp_{hash2}`) |

### Verification for Sparse Clone

```
After GCR-S01:
  ✓ localPath contains "__sp_" suffix (sparse indicator)
  ✓ localViewStructure(path=localPath) → shows sparse-checkout files
  ✓ Files outside sparse_path are NOT present on disk
  ✓ localSearchCode works within the sparse subtree
```

---

### 1.3 Cache Behavior Tests

| Test ID | Description | Action | Expected Result |
|---------|-------------|--------|-----------------|
| GCR-C01 | Second clone returns cached | Clone same repo twice in quick succession | Second call: `cached: true`, same `localPath` |
| GCR-C02 | Cache includes expiresAt | Any successful clone | `expiresAt` is valid ISO-8601, ~24h from first clone |
| GCR-C03 | Cache metadata written | Clone repo, inspect on-disk | `.octocode-clone-meta.json` exists in clone dir |
| GCR-C04 | Cache metadata content | Read `.octocode-clone-meta.json` | Contains: `clonedAt`, `expiresAt`, `owner`, `repo`, `branch`, `source: "clone"` |
| GCR-C05 | Full vs sparse separate cache | Clone full, then clone sparse | Different directories, both cached independently |
| GCR-C06 | directoryFetch cache ignored | Directory fetch first, then clone same repo | Clone does NOT use directoryFetch cache (re-clones fresh) |
| GCR-C07 | Cached hints | Second call to cached clone | Response includes cache hit hint ("Served from 24-hour cache") |

---

### 1.4 Security Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GCR-SEC01 | Path traversal in owner | `owner="../etc"` | Schema validation error (regex rejects `..`) |
| GCR-SEC02 | Path traversal in repo | `repo="../../passwd"` | Schema validation error |
| GCR-SEC03 | Path traversal in sparse_path | `sparse_path="../../etc/passwd"` | Schema validation error (regex rejects `..`) |
| GCR-SEC04 | Leading slash in sparse_path | `sparse_path="/etc/passwd"` | Schema validation error ("must be a relative path") |
| GCR-SEC05 | Flag injection in branch | `branch="--upload-pack=evil"` | Schema validation error (starts with `-`) |
| GCR-SEC06 | Flag injection in sparse_path | `sparse_path="--config=evil"` | Schema validation error (starts with `-`) |
| GCR-SEC07 | Backslash in owner | `owner="foo\\bar"` | Schema validation error (no backslash) |
| GCR-SEC08 | Token not in localPath | Any successful clone | Token does NOT appear in `localPath` string |
| GCR-SEC09 | Token scrubbed from errors | Clone invalid private repo | Error message does NOT contain token value |
| GCR-SEC10 | `--` separator used in git args | (Implementation check) | Git clone uses `--` before user-controlled owner/repo/path |

---

### 1.5 Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GCR-E01 | Owner with dots | `owner="user.name", repo="my.repo"` | Handles dots in GitHub identifiers |
| GCR-E02 | Owner with underscores | `owner="my_org", repo="my_repo"` | Handles underscores |
| GCR-E03 | Branch with slashes | `owner="expressjs", repo="express", branch="feature/new-api"` | Handles namespace branches |
| GCR-E04 | Sparse path with @ | `owner="facebook", repo="react", sparse_path="packages/@scope/pkg"` | Handles @ in sparse path (scoped packages) |
| GCR-E05 | Max length owner (200 chars) | `owner="a".repeat(200)` | Accepted by schema (will fail at GitHub API) |
| GCR-E06 | Max length branch (255 chars) | Very long branch name | Accepted by schema |
| GCR-E07 | Sparse path to single file area | `sparse_path="README.md"` | Sparse checkout of just README |
| GCR-E08 | Empty string branch (omitted) | `owner="expressjs", repo="express"` (no branch) | Falls back to API default branch resolution |

---

### 1.6 Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GCR-F01 | Missing owner | `repo="react"` | Validation error: owner required |
| GCR-F02 | Missing repo | `owner="facebook"` | Validation error: repo required |
| GCR-F03 | Empty owner | `owner="", repo="react"` | Validation error: min 1 char |
| GCR-F04 | Empty repo | `owner="facebook", repo=""` | Validation error: min 1 char |
| GCR-F05 | Non-existent repo | `owner="facebook", repo="this-repo-does-not-exist-xyz-999"` | Clone failed error |
| GCR-F06 | Non-existent branch | `owner="expressjs", repo="express", branch="nonexistent-branch-xyz"` | Clone failed error |
| GCR-F07 | Non-existent sparse path | `owner="expressjs", repo="express", sparse_path="nonexistent/deep/path"` | Sparse checkout may produce empty tree |
| GCR-F08 | Private repo without token | `owner="private-org", repo="private-repo"` (no GITHUB_TOKEN) | Authentication error |
| GCR-F09 | GitLab provider active | Set provider to GitLab | "only available with the GitHub provider" error |
| GCR-F10 | git not installed | Remove git from PATH | "git is not installed or not on PATH" error |
| GCR-F11 | ENABLE_LOCAL=false | Env: `ENABLE_LOCAL=false` | Tool not registered / not available |
| GCR-F12 | ENABLE_CLONE=false | Env: `ENABLE_CLONE=false` | Tool not registered / not available |
| GCR-F13 | Queries array empty | `queries=[]` | Validation error: min 1 query |
| GCR-F14 | Too many queries (4+) | 4 queries in one call | Validation error: max 3 queries |

---

### 1.7 Integration Tests (Clone → Local Tools)

| Test ID | Flow | Steps | Expected Result |
|---------|------|-------|-----------------|
| GCR-I01 | Clone → Browse | 1. `githubCloneRepo(owner="expressjs", repo="express")` <br> 2. `localViewStructure(path=localPath, depth=2)` | Structure shows `lib/`, `test/`, `package.json`, etc. |
| GCR-I02 | Clone → Search | 1. Clone express <br> 2. `localSearchCode(pattern="middleware", path=localPath)` | Finds middleware references in source files |
| GCR-I03 | Clone → Read | 1. Clone express <br> 2. `localGetFileContent(path=localPath + "/package.json", fullContent=true)` | Returns valid JSON content with version, dependencies |
| GCR-I04 | Clone → Find | 1. Clone express <br> 2. `localFindFiles(path=localPath, name="*.js", type="f")` | Returns JavaScript files sorted by default |
| GCR-I05 | Sparse Clone → Search | 1. `githubCloneRepo(owner="facebook", repo="react", sparse_path="packages/react")` <br> 2. `localSearchCode(pattern="createElement", path=localPath)` | Finds createElement in react package |
| GCR-I06 | Clone → LSP | 1. Clone a TypeScript repo <br> 2. `localSearchCode(pattern="export function", path=localPath)` → get lineHint <br> 3. `lspGotoDefinition(uri=file, symbolName=fn, lineHint=N)` | LSP resolves definition from cloned code |
| GCR-I07 | Clone → Full Workflow | 1. Clone <br> 2. `localViewStructure` <br> 3. `localSearchCode` <br> 4. `lspGotoDefinition` <br> 5. `lspFindReferences` <br> 6. `lspCallHierarchy` | Complete research funnel works on cloned repo |

---

## 2. githubGetFileContent (directory mode)

### Schema Parameters (directory mode specific)

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | ✅ Yes | 1-200 chars | - |
| `repo` | string | ✅ Yes | 1-150 chars | - |
| `path` | string | ✅ Yes | Directory path in repo | - |
| `branch` | string | No | 1-255 chars | "main" fallback |
| `type` | enum | ✅ Yes (for dir mode) | Must be `"directory"` | `"file"` |

### Parameters REJECTED in directory mode

| Parameter | Behavior when type="directory" |
|-----------|-------------------------------|
| `fullContent` | Validation error if not `false` |
| `startLine` | Validation error |
| `endLine` | Validation error |
| `matchString` | Validation error |
| `charOffset` | Validation error |
| `charLength` | Validation error |

### Max queries per call: **3**

---

### 2.1 Normal Directory Fetch Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GDF-N01 | Fetch source directory | `owner="bgauryy", repo="octocode-mcp", path="docs", type="directory"` | Returns `localPath`, `fileCount > 0`, list of `files` with path/size/type |
| GDF-N02 | Fetch with explicit branch | `owner="bgauryy", repo="octocode-mcp", path="docs", branch="main", type="directory"` | Returns `branch: "main"` in result |
| GDF-N03 | Fetch returns localPath | Any directory fetch | `localPath` is absolute, under `~/.octocode/repos/` |
| GDF-N04 | Fetch returns file list | Fetch a known directory | `files` array has entries with `path`, `size`, `type: "file"` |
| GDF-N05 | Fetch returns totals | Any directory fetch | `fileCount` matches `files.length`, `totalSize` matches sum of file sizes |
| GDF-N06 | Fetch small directory | `owner="expressjs", repo="express", path="lib", type="directory"` | Returns all files in lib/ |
| GDF-N07 | Fetch nested directory | `owner="bgauryy", repo="octocode-mcp", path="packages/octocode-shared/src/config", type="directory"` | Returns config directory files (defaults.ts, types.ts, etc.) |
| GDF-N08 | Fetch config directory | `owner="facebook", repo="react", path="packages/react", type="directory"` | Returns package files (index.js, package.json, etc.) |
| GDF-N09 | Fetch root-adjacent dir | `owner="expressjs", repo="express", path="test", type="directory"` | Returns test files |
| GDF-N10 | DirectoryPath in result | Any fetch | Result includes `directoryPath` matching the queried `path` |

### Verification for Directory Fetch

```
After GDF-N01:
  ✓ localViewStructure(path=localPath) → shows fetched files
  ✓ localSearchCode(pattern="export", path=localPath) → finds matches in fetched files
  ✓ localGetFileContent(path=localPath + "/<file>", fullContent=true) → readable content
  ✓ Files on disk match the `files` array in the response
```

---

### 2.2 Cache Behavior Tests

| Test ID | Description | Action | Expected Result |
|---------|-------------|--------|-----------------|
| GDF-C01 | Second fetch returns cached | Fetch same directory twice | Second call: `cached: true`, `fileCount: 0`, `files: []` (cached = no re-fetch) |
| GDF-C02 | Cache includes expiresAt | Any successful fetch | `expiresAt` is valid ISO-8601, ~24h ahead |
| GDF-C03 | Cache metadata written | Fetch directory, check disk | `.octocode-clone-meta.json` exists with `source: "directoryFetch"` |
| GDF-C04 | Cache separate from clone | Fetch directory, then full clone same repo | Clone does NOT use directoryFetch cache (different cache keys) |
| GDF-C05 | Cached response hints | Second call to cached directory | Response includes cache hit hint |

---

### 2.3 Filtering & Limits Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GDF-L01 | Max 50 files | Fetch a directory with 50+ files | Returns at most 50 files |
| GDF-L02 | Max 5MB total size | Fetch a directory with large files | Stops accumulating when 5MB total reached |
| GDF-L03 | Max 300KB per file | Directory with one >300KB file | That file is excluded from results |
| GDF-L04 | Binary files excluded | Fetch directory with `.png`, `.jpg` files | Binary files NOT in `files` list |
| GDF-L05 | .lock files excluded | Fetch directory with `yarn.lock` or `package-lock.json` | `.lock` files excluded |
| GDF-L06 | .min.js excluded | Fetch directory with minified JS | `.min.js` files excluded |
| GDF-L07 | .min.css excluded | Fetch directory with minified CSS | `.min.css` files excluded |
| GDF-L08 | Normal text files included | Fetch directory with `.ts`, `.js`, `.json`, `.md` | All text files included |
| GDF-L09 | Concurrent fetch (5 at a time) | Large directory | Files fetched in batches of 5 |
| GDF-L10 | Partial fetch on failure | Directory where some download_urls 404 | Successfully fetched files returned, failures silently skipped |

---

### 2.4 Schema Validation Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GDF-V01 | fullContent=true with directory | `type="directory", fullContent=true` | Validation error: "not supported when type is directory" |
| GDF-V02 | startLine with directory | `type="directory", startLine=1` | Validation error: "not supported when type is directory" |
| GDF-V03 | endLine with directory | `type="directory", endLine=10` | Validation error: "not supported when type is directory" |
| GDF-V04 | matchString with directory | `type="directory", matchString="export"` | Validation error: "not supported when type is directory" |
| GDF-V05 | charOffset with directory | `type="directory", charOffset=100` | Validation error: "not supported when type is directory" |
| GDF-V06 | charLength with directory | `type="directory", charLength=500` | Validation error: "not supported when type is directory" |
| GDF-V07 | Missing owner | `repo="react", path="src", type="directory"` | Validation error: owner required |
| GDF-V08 | Missing repo | `owner="facebook", path="src", type="directory"` | Validation error: repo required |
| GDF-V09 | Missing path | `owner="facebook", repo="react", type="directory"` | Validation error: path required |
| GDF-V10 | fullContent=false allowed | `type="directory", fullContent=false` | No error (false is the default) |

---

### 2.5 Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GDF-E01 | Directory with subdirectories | Fetch a directory that has subdirs | Subdirectories NOT fetched (only immediate files) |
| GDF-E02 | Directory with dotfiles | Fetch dir containing `.eslintrc`, `.gitignore` | Dotfiles included (not binary) |
| GDF-E03 | Root directory | `owner="expressjs", repo="express", path=".", type="directory"` | Returns root-level files |
| GDF-E04 | Empty directory | Fetch a directory with no files | `fileCount: 0`, `files: []`, `totalSize: 0` |
| GDF-E05 | Directory with only binary files | All files are .png/.jpg | `fileCount: 0` (all filtered) |
| GDF-E06 | Path with trailing slash | `path="docs/"` | Handles trailing slash gracefully |
| GDF-E07 | Feature branch | `owner="vercel", repo="next.js", path="packages", branch="canary", type="directory"` | Fetches from canary branch |
| GDF-E08 | Unicode filenames | Directory with unicode-named files | Handles unicode gracefully |
| GDF-E09 | Very deep path | `path="packages/next/src/server/app-render"` in next.js | Fetches deeply nested directory |
| GDF-E10 | Mixed file types | Directory with `.ts`, `.json`, `.md`, `.png` | Only text files returned |

---

### 2.6 Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GDF-F01 | Path is a file, not directory | `owner="facebook", repo="react", path="package.json", type="directory"` | Error: "not a directory. Use type file" |
| GDF-F02 | Non-existent path | `owner="facebook", repo="react", path="nonexistent/dir", type="directory"` | 404 or path not found error |
| GDF-F03 | Non-existent repo | `owner="facebook", repo="nonexistent-xyz-999", path="src", type="directory"` | 404 error |
| GDF-F04 | Non-existent branch | `owner="facebook", repo="react", path="src", branch="nonexistent", type="directory"` | 404 error |
| GDF-F05 | ENABLE_CLONE=false | Env: `ENABLE_CLONE=false` | Error: "requires ENABLE_LOCAL=true and ENABLE_CLONE=true" |
| GDF-F06 | ENABLE_LOCAL=false | Env: `ENABLE_LOCAL=false` | Error: tool not available or clone not enabled |
| GDF-F07 | Private repo without token | No GITHUB_TOKEN set | Authentication error |
| GDF-F08 | Rate limit exceeded | Many rapid API calls | Rate limit error with reset time |
| GDF-F09 | Network timeout | (Simulate slow network) | Fetch timeout after 10 seconds per file |
| GDF-F10 | Disk full | (Simulate full disk) | Write error, graceful handling |

---

### 2.7 Integration Tests (Directory Fetch → Local Tools)

| Test ID | Flow | Steps | Expected Result |
|---------|------|-------|-----------------|
| GDF-I01 | Fetch → Browse | 1. `githubGetFileContent(owner="bgauryy", repo="octocode-mcp", path="packages/octocode-shared/src/config", type="directory")` <br> 2. `localViewStructure(path=localPath)` | Shows config directory files |
| GDF-I02 | Fetch → Search | 1. Fetch directory <br> 2. `localSearchCode(pattern="export", path=localPath)` | Finds exports in fetched files |
| GDF-I03 | Fetch → Read | 1. Fetch directory <br> 2. `localGetFileContent(path=localPath + "/defaults.ts", fullContent=true)` | Returns readable TypeScript content |
| GDF-I04 | Fetch → Find | 1. Fetch directory <br> 2. `localFindFiles(path=localPath, name="*.ts", type="f")` | Returns TypeScript files |
| GDF-I05 | Fetch → Full Workflow | 1. Fetch directory <br> 2. Browse <br> 3. Search <br> 4. Read specific file | Complete local analysis workflow works |

---

## 3. Cross-Tool Tests

These tests verify interactions between clone and directory fetch.

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| CT-01 | Directory fetch then clone | 1. `githubGetFileContent(type="directory")` for `owner/repo` <br> 2. `githubCloneRepo` same `owner/repo` | Clone ignores directoryFetch cache, performs fresh clone |
| CT-02 | Clone then directory fetch | 1. `githubCloneRepo` for `owner/repo` <br> 2. `githubGetFileContent(type="directory")` same repo, different path | Directory fetch may use clone cache if path exists |
| CT-03 | Sparse clone vs directory fetch | 1. `githubCloneRepo(sparse_path="docs")` <br> 2. `githubGetFileContent(path="docs", type="directory")` | Different cache entries, both work independently |
| CT-04 | Both tools return localPath | Clone and fetch same content | Both `localPath` values are usable by local tools |
| CT-05 | File mode unaffected | `githubGetFileContent(type="file")` still works normally | File mode returns inline content, no disk write |

---

## 4. Bulk Query Tests

| Test ID | Tool | Description | Query | Expected Result |
|---------|------|-------------|-------|-----------------|
| BQ-C01 | `githubCloneRepo` | 3 parallel clones | `queries=[{owner:"expressjs",repo:"express"}, {owner:"lodash",repo:"lodash"}, {owner:"bgauryy",repo:"octocode-mcp"}]` | Returns 3 result sets, each with `localPath` |
| BQ-C02 | `githubCloneRepo` | Mixed valid/invalid | `queries=[{owner:"expressjs",repo:"express"}, {owner:"fake",repo:"nonexistent"}]` | First succeeds, second fails with error |
| BQ-C03 | `githubCloneRepo` | 4 queries (over limit) | 4 queries | Validation error: max 3 queries |
| BQ-C04 | `githubCloneRepo` | Empty queries | `queries=[]` | Validation error: min 1 query |
| BQ-D01 | `githubGetFileContent` | 3 directory fetches | `queries=[{path:"docs",type:"directory"}, {path:"src",type:"directory"}, {path:"lib",type:"directory"}]` | Returns 3 directory results |
| BQ-D02 | `githubGetFileContent` | Mixed file + directory | `queries=[{path:"README.md",type:"file"}, {path:"src",type:"directory"}]` | File returns content inline, directory returns localPath |
| BQ-D03 | `githubGetFileContent` | All directory queries | 3 directory queries | Keys priority uses directory format |

---

## 5. Quick Validation Sequence

Run these steps in order for a fast smoke test of both tools:

```
1. githubCloneRepo
   owner="expressjs", repo="express"
   ✓ Returns localPath, cached=false

2. localViewStructure
   path=<localPath from step 1>, depth=1
   ✓ Shows lib/, test/, package.json

3. localSearchCode
   pattern="Router", path=<localPath>, mode="discovery"
   ✓ Finds Router references

4. githubCloneRepo (cache hit)
   owner="expressjs", repo="express" (same as step 1)
   ✓ Returns cached=true, same localPath

5. githubCloneRepo (sparse)
   owner="facebook", repo="react", sparse_path="packages/react"
   ✓ Returns localPath with __sp_ suffix

6. localViewStructure
   path=<sparse localPath from step 5>
   ✓ Shows sparse checkout content

7. githubGetFileContent (directory mode)
   owner="bgauryy", repo="octocode-mcp", path="docs", type="directory"
   ✓ Returns localPath, fileCount > 0, files list

8. localViewStructure
   path=<localPath from step 7>
   ✓ Shows fetched doc files

9. localGetFileContent
   path=<localPath from step 7>/<first file>, fullContent=true
   ✓ Readable content with indentation

10. githubGetFileContent (directory cache hit)
    Same query as step 7
    ✓ Returns cached=true
```

---

## 6. Scoring

### githubCloneRepo Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All N01-N07 + S01-S07 + C01-C07 pass. Full/sparse/cache all work. Token scrubbed. |
| 9 | 18-20 pass; minor issue (e.g. default branch fallback to "main" when API unreachable) |
| 8 | 15-17 pass; sparse clone works but some cache edge cases fail |
| 7 | 12-14 pass; full clone works but sparse checkout issues |
| ≤6 | Core cloning fails, cache broken, security validation missing |

### githubGetFileContent (directory mode) Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All N01-N10 + C01-C05 + L01-L10 + V01-V10 pass. Files saved, filters work, schema validated |
| 9 | 28-34 pass; minor issue (e.g. trailing slash handling) |
| 8 | 24-27 pass; directory fetch works but some limit/filter edge cases |
| 7 | 20-23 pass; basic fetch works but cache or schema validation has gaps |
| ≤6 | Core directory fetch fails, files not saved to disk, schema allows invalid combos |

### Integration Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All I01-I07 (clone) + I01-I05 (directory) + CT-01-CT-05 pass |
| 9 | 14-16 pass; one integration path has minor issues |
| 8 | 12-13 pass; LSP on cloned code has issues |
| 7 | 10-11 pass; basic browse/search works, but deeper analysis fails |
| ≤6 | Local tools can't read cloned/fetched content |

### Scoring Summary Template

| Category | Score | Tests Passed | Notes |
|:---------|:-----:|:------------:|:------|
| `githubCloneRepo` - Full Clone | /10 | /7 | |
| `githubCloneRepo` - Sparse Clone | /10 | /7 | |
| `githubCloneRepo` - Cache | /10 | /7 | |
| `githubCloneRepo` - Security | /10 | /10 | |
| `githubCloneRepo` - Failures | /10 | /14 | |
| `githubGetFileContent` - Directory Fetch | /10 | /10 | |
| `githubGetFileContent` - Cache | /10 | /5 | |
| `githubGetFileContent` - Limits & Filters | /10 | /10 | |
| `githubGetFileContent` - Schema Validation | /10 | /10 | |
| `githubGetFileContent` - Failures | /10 | /10 | |
| Integration (Clone → Local) | /10 | /7 | |
| Integration (DirFetch → Local) | /10 | /5 | |
| Cross-Tool | /10 | /5 | |
| Bulk Queries | /10 | /7 | |
| **TOTAL** | **/140** | **/114** | |

**Thresholds**:
- **126-140** (90%+): Production-ready, all features working
- **112-125** (80%+): Functional with minor gaps — document known issues
- **98-111** (70%+): Usable but needs fixes — check scoring guides for deductions
- **<98** (<70%): Significant issues — investigate before production use

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|:--------|:-------------|:----|
| Clone tool not available | `ENABLE_LOCAL=false` or `ENABLE_CLONE=false` | Set both to `true` |
| "git is not installed" | git not on PATH | Install git |
| Clone times out | Large repo + slow network | Use `sparse_path` for large repos |
| Directory fetch returns "not a directory" | Path points to a file | Use `type="file"` or fix the path |
| "requires ENABLE_LOCAL=true and ENABLE_CLONE=true" | Clone/directory features disabled | Set env vars |
| Schema rejects `sparse_path` | Contains `..` or starts with `-` or `/` | Use relative paths, no traversal |
| `cached: true` but stale content | Cache within 24h TTL | Wait for expiry or delete `~/.octocode/repos/` manually |
| Directory fetch returns `fileCount: 0` | All files are binary or exceed size limit | Check file types in directory |
| Clone ignores directoryFetch cache | By design: `source: "directoryFetch"` is not treated as clone | This is expected behavior |
| Local tools can't find files after fetch | Wrong `localPath` used | Use the exact `localPath` from the tool response |

---

*Test Plan Version: 1.0*
*Last Updated: February 2026*
*Total Test Cases: ~130+*
