# Octocode MCP — Complete Eval Test Plan

> Master test plan referencing all per-tool eval docs and integration tests.
> Each tool has its own eval doc with parameterized test cases, expected outputs, and validation checklists.
> Run these tests after deployment, upgrades, or configuration changes.

---

## Agent Instructions (Testing Prompt)

**When validating Octocode MCP tools:**

1. **Run the Quick Validation Sequence** (10 steps below) using actual MCP tools — do not skip steps.
2. **For each step:** Execute the tool call, verify the expected outcome, record pass/fail.
3. **For LSP steps (5–7):** Always get `lineHint` from `localSearchCode` first — never guess line numbers.
4. **Reference all eval docs** when running full test suites — each tool has a dedicated doc with TCs.
5. **Output a summary** after validation: failures/successes, insights, what went well, what did not.

**All Eval Docs (run each for full coverage):**

| Doc | Tool(s) | Path |
|-----|---------|------|
| 01 | localSearchCode | [01_localSearchCode.md](./01_localSearchCode.md) |
| 02 | localViewStructure | [02_localViewStructure.md](./02_localViewStructure.md) |
| 03 | localFindFiles | [03_localFindFiles.md](./03_localFindFiles.md) |
| 04 | localGetFileContent | [04_localGetFileContent.md](./04_localGetFileContent.md) |
| 05 | githubSearchRepositories | [05_githubSearchRepositories.md](./05_githubSearchRepositories.md) |
| 06 | githubSearchCode | [06_githubSearchCode.md](./06_githubSearchCode.md) |
| 07 | githubViewRepoStructure | [07_githubViewRepoStructure.md](./07_githubViewRepoStructure.md) |
| 08 | githubGetFileContent | [08_githubGetFileContent.md](./08_githubGetFileContent.md) |
| 09 | githubSearchPullRequests | [09_githubSearchPullRequests.md](./09_githubSearchPullRequests.md) |
| 10 | packageSearch | [10_packageSearch.md](./10_packageSearch.md) |
| 11 | githubCloneRepo | [11_githubCloneRepo.md](./11_githubCloneRepo.md) |
| 12 | lspGotoDefinition | [12_lspGotoDefinition.md](./12_lspGotoDefinition.md) |
| 13 | lspFindReferences | [13_lspFindReferences.md](./13_lspFindReferences.md) |
| 14 | lspCallHierarchy | [14_lspCallHierarchy.md](./14_lspCallHierarchy.md) |
| 15 | githubGetFileContent (dir) | [15_githubGetFileContent_directory.md](./15_githubGetFileContent_directory.md) |
| 16 | Integration (cross-tool) | [16_integration_tests.md](./16_integration_tests.md) |

---

## Prerequisites

### Environment Variables

| Variable | Required For | Default | Description |
|----------|-------------|---------|-------------|
| `GITHUB_TOKEN` | GitHub tools, Clone tools | - | GitHub PAT (also via `OCTOCODE_TOKEN`, `GH_TOKEN`) |
| `ENABLE_LOCAL` | Local tools, LSP tools, Clone tools | `false` | Must be `true` for local filesystem tools |
| `ENABLE_CLONE` | Clone tools, Directory fetch | `false` | Must be `true` for clone/directory features |

### System Requirements

| Requirement | Tools | Details |
|-------------|-------|---------|
| **git** | `githubCloneRepo` | Must be installed and on PATH |
| **Node.js** | All tools | MCP server runtime |
| **Network** | GitHub tools | Access to `github.com` |
| **TypeScript LSP** | LSP tools | Bundled; other languages need server installation |

### Test Repositories

| Repository | Owner | Purpose | Size |
|------------|-------|---------|------|
| octocode-mcp | bgauryy | Self-reference, known structure | Medium |
| react | facebook | Large monorepo, sparse checkout | Large |
| next.js | vercel | TypeScript monorepo, directory fetch | Very Large |
| express | expressjs | Small Node.js library, fast clones | Small |
| lodash | lodash | Utility library, many small files | Medium |

---

## Test Plan Overview

### Per-Tool Eval Docs

Each tool has a dedicated eval doc with:
- Tool overview & schema parameters
- Parameterized test cases (JSON queries)
- Expected behavior checklists
- Scoring criteria
- Validation checklist

### How to Use

1. **Pick a tool** from the index below
2. **Open the eval doc** and run each test case against the MCP tool
3. **Check off** expected behaviors in the validation checklist
4. **Run integration tests** from [16_integration_tests.md](./16_integration_tests.md)
5. **Review known issues** and common failure modes below

---

## Tool Index

### Local Tools

| # | Tool | Eval Doc | TCs | Description |
|---|------|----------|-----|-------------|
| 1 | `localSearchCode` | [01_localSearchCode.md](./01_localSearchCode.md) | 31 | Text/regex search via ripgrep. Modes: discovery, paginated, detailed. |
| 2 | `localViewStructure` | [02_localViewStructure.md](./02_localViewStructure.md) | 19 | Browse directory structure with sorting, filtering, pagination. |
| 3 | `localFindFiles` | [03_localFindFiles.md](./03_localFindFiles.md) | 25 | Find files by name, metadata (time, size, permissions). |
| 4 | `localGetFileContent` | [04_localGetFileContent.md](./04_localGetFileContent.md) | 14 | Read file content with matchString, line ranges, full content. |

**Local Tools Total: 89 test cases**

### GitHub Tools

| # | Tool | Eval Doc | TCs | Description |
|---|------|----------|-----|-------------|
| 5 | `githubSearchRepositories` | [05_githubSearchRepositories.md](./05_githubSearchRepositories.md) | 15 | Search repos by keywords, topics, stars, dates. |
| 6 | `githubSearchCode` | [06_githubSearchCode.md](./06_githubSearchCode.md) | 13 | Search code across GitHub with file/path matching. |
| 7 | `githubViewRepoStructure` | [07_githubViewRepoStructure.md](./07_githubViewRepoStructure.md) | 11 | Display repo file/directory tree with depth control. |
| 8 | `githubGetFileContent` | [08_githubGetFileContent.md](./08_githubGetFileContent.md) | 11 | Fetch file content with matchString, line ranges. |
| 9 | `githubSearchPullRequests` | [09_githubSearchPullRequests.md](./09_githubSearchPullRequests.md) | 46 | Search PRs with filters, diffs, comments, commits. |
| 10 | `packageSearch` | [10_packageSearch.md](./10_packageSearch.md) | 8 | Search NPM/PyPI packages by name. |

**GitHub Tools Total: 104 test cases**

### Clone & Directory Fetch Tools

| # | Tool | Eval Doc | TCs | Description |
|---|------|----------|-----|-------------|
| 11 | `githubCloneRepo` | [11_githubCloneRepo.md](./11_githubCloneRepo.md) | 16 | Shallow clone with sparse checkout, 24h cache. |
| 15 | `githubGetFileContent` (dir) | [15_githubGetFileContent_directory.md](./15_githubGetFileContent_directory.md) | 13 | Fetch directory contents to disk for local analysis. |

**Clone Tools Total: 29 test cases**

### LSP Tools

| # | Tool | Eval Doc | TCs | Description |
|---|------|----------|-----|-------------|
| 12 | `lspGotoDefinition` | [12_lspGotoDefinition.md](./12_lspGotoDefinition.md) | 11 | Jump to symbol definition via Language Server. |
| 13 | `lspFindReferences` | [13_lspFindReferences.md](./13_lspFindReferences.md) | 14 | Find all usages of a symbol across codebase. |
| 14 | `lspCallHierarchy` | [14_lspCallHierarchy.md](./14_lspCallHierarchy.md) | 15 | Trace function call relationships (incoming/outgoing). |

**LSP Tools Total: 40 test cases**

### Integration Tests

| # | Category | Eval Doc | TCs | Description |
|---|----------|----------|-----|-------------|
| 16 | Cross-Tool Integration | [16_integration_tests.md](./16_integration_tests.md) | 42 | Multi-tool workflows, edge cases, bulk queries, rate limiting. |

**Integration Total: 42 test cases**

---

## Quick Validation Sequence

Run these 10 steps in order for a fast smoke test across all categories:

```
1. localViewStructure       → path="<root>", depth=1
   ✓ Lists files and dirs

2. localSearchCode          → pattern="function", mode="discovery", path="<root>/src"
   ✓ Files found, matchCount >= 1

3. localFindFiles           → path="<root>", name="*.ts", sortBy="size", type="f"
   ✓ Sorted by size, no dist/node_modules

4. localGetFileContent      → path="<any .ts file>", matchString="export", matchStringContextLines=10
   ✓ Readable content with indentation

5. lspGotoDefinition        → uri="<file from step 2>", symbolName="<from step 2>", lineHint=<N>
   ✓ Definition found

6. lspFindReferences        → uri="<definition from step 5>", symbolName="<same>", lineHint=<N>
   ✓ Multiple references found

7. lspCallHierarchy         → uri="<file>", symbolName="<function>", lineHint=<N>, direction="incoming"
   ✓ Callers found with context

8. githubViewRepoStructure  → owner="bgauryy", repo="octocode-mcp", branch="main"
   ✓ Root structure displayed

9. githubCloneRepo          → owner="expressjs", repo="express"
   ✓ Returns localPath (cached=true if already cloned, false if fresh)

10. localViewStructure      → path=<localPath from step 9>, depth=2
    ✓ Shows lib/, examples/, package.json (express: lib/ + examples/ at root)
```

Each step feeds into the next — the **Funnel Method**: Structure → Search → Locate → Analyze → Read.

---

## Validation Run Summary (Template)

After running the Quick Validation Sequence, fill in:

| Step | Tool | Result | Notes |
|------|------|--------|-------|
| 1 | localViewStructure | ☐ Pass / ☐ Fail | |
| 2 | localSearchCode | ☐ Pass / ☐ Fail | |
| 3 | localFindFiles | ☐ Pass / ☐ Fail | |
| 4 | localGetFileContent | ☐ Pass / ☐ Fail | |
| 5 | lspGotoDefinition | ☐ Pass / ☐ Fail | |
| 6 | lspFindReferences | ☐ Pass / ☐ Fail | |
| 7 | lspCallHierarchy | ☐ Pass / ☐ Fail | |
| 8 | githubViewRepoStructure | ☐ Pass / ☐ Fail | |
| 9 | githubCloneRepo | ☐ Pass / ☐ Fail | |
| 10 | localViewStructure | ☐ Pass / ☐ Fail | |

**Summary:** _Failures / Successes | Insights | What went well | What did not_

### Latest Run: Feb 19, 2026

| Step | Tool | Result | Notes |
|------|------|--------|-------|
| 1 | localViewStructure | ✓ Pass | 16 entries (11 files, 5 dirs) at root |
| 2 | localSearchCode | ✓ Pass | 713 matches, 179 files in packages/octocode-mcp/src |
| 3 | localFindFiles | ✓ Pass | 20 .ts files sorted by size, excludes dist/node_modules |
| 4 | localGetFileContent | ✓ Pass | client.ts export sections with context |
| 5 | lspGotoDefinition | ✓ Pass | resolveDefaultBranch → line 241 |
| 6 | lspFindReferences | ✓ Pass | 16+ refs (def + cloneRepo, execution, tests) |
| 7 | lspCallHierarchy | ✓ Pass | handleDirectoryFetch, cloneRepo, test module |
| 8 | githubViewRepoStructure | ✓ Pass | bgauryy/octocode-mcp root: 16 files, 4 folders |
| 9 | githubCloneRepo | ✓ Pass | expressjs/express → localPath, cached=true |
| 10 | localViewStructure | ✓ Pass | lib/, examples/, index.js, History.md |

**Failures:** 0  
**Successes:** 10/10

**Insights:**
- Funnel works: localSearchCode → lineHint → LSP tools. Searching for `resolveDefaultBranch` gave line 241; LSP tools resolved correctly.
- Clone cache hit is normal: express was already cloned; `cached: true` is valid.
- Express root has `lib/`, `examples/`, `index.js` — no top-level `test/`; test dir may be elsewhere.

**What went well:**
- All tools returned structured data with hints.
- LSP chain (goto def → find refs → call hierarchy) traced `resolveDefaultBranch` across 4 files.
- packageSearch (express) returned owner/repo for githubViewRepoStructure.

**What did not:**
- `executeLocalSearch` search returned empty (symbol may not exist); switched to `resolveDefaultBranch` — always verify symbol exists before LSP.
- localFindFiles limit=20 returned octocode-shared files first (largest .ts); pagination needed for full workspace.

---

## Known Issues / Design Notes

| Tool | Note | Eval Doc |
|------|------|----------|
| `packageSearch` | Env-dependent: npm config registry (private vs public) | [10_packageSearch.md](./10_packageSearch.md) TC-1, TC-2 |
| `localSearchCode` | Design: filesOnly overrides count when both set | [01_localSearchCode.md](./01_localSearchCode.md) TC-17 |
| `lspGotoDefinition` | Use orderHint=0 for single-occurrence lines (e.g. imports) | [12_lspGotoDefinition.md](./12_lspGotoDefinition.md) TC-5 |
| `githubSearchPullRequests` | Design: No output size limits | [09_githubSearchPullRequests.md](./09_githubSearchPullRequests.md) TC-8, TC-9 |
| `lspCallHierarchy` | Design: depth=2 produces large output | [14_lspCallHierarchy.md](./14_lspCallHierarchy.md) TC-5 |

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|:--------|:-------------|:----|
| LSP returns `symbol_not_found` | Wrong `lineHint` | Always get `lineHint` from `localSearchCode` first |
| `localFindFiles` returns dist files | `excludeDir: []` passed explicitly | Remove `excludeDir` to use defaults |
| `localGetFileContent` returns single-line blob | Aggressive minification on file type | Check minifier strategy for that extension |
| `localViewStructure` shows no dates | `showFileLastModified: false` (default) | Set `showFileLastModified: true` |
| Clone tool not available | `ENABLE_LOCAL=false` or `ENABLE_CLONE=false` | Set both to `true` |
| "git is not installed" | git not on PATH | Install git |
| Directory fetch returns `fileCount: 0` | All files are binary or exceed size limit | Check file types in directory |
| Discovery mode `matchCount` always 1 | ripgrep `-l` returns filenames only | Use `mode: "detailed"` or `countMatches: true` |
| LSP tools no results on Python/Go | Language server not installed | Install required server (pyright, gopls) |

---

*Complete Test Plan Version: 2.4*
*Last Updated: Feb 19, 2026*
*Total Tool Docs: 16 | Total Test Cases: 304*

**Related:** [FAILURE_ANALYSIS.md](./FAILURE_ANALYSIS.md) | [MISSING_TESTS_AUDIT.md](./MISSING_TESTS_AUDIT.md) | [EVAL_DOCS_AUDIT_REPORT.md](./EVAL_DOCS_AUDIT_REPORT.md)
