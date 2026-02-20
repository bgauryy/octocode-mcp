# Octocode MCP — Eval Test Suite

> Schema-level evaluation tests for all 14 Octocode MCP tools + cross-tool integration.
> Each document contains parameterized test cases with expected outputs and validation checklists.
> Based on the [MCP Tools Audit Report](https://github.com/bgauryy/octocode-mcp/blob/main/docs/MCP_TOOLS_AUDIT.md).

---

## Complete Test Plan

**Start here:** [COMPLETE_TEST_PLAN.md](./COMPLETE_TEST_PLAN.md) — master doc referencing every per-tool eval doc, scoring summary, quick validation sequence, and known issues.

---

## How to Use

1. **Open** [COMPLETE_TEST_PLAN.md](./COMPLETE_TEST_PLAN.md) for the full plan overview
2. **Pick a tool** from the index below and open its eval doc
3. **Run each test case** against the MCP tool
4. **Check off** expected behaviors in the validation checklist
5. **Run integration tests** from [16_integration_tests.md](./16_integration_tests.md) for cross-tool flows
6. **Record scores** in the scoring summary in the complete test plan

---

## Tool Index

### Local Tools

| # | Tool | File | Rating | TCs |
|---|------|------|--------|-----|
| 1 | `localSearchCode` | [01_localSearchCode.md](./01_localSearchCode.md) | 9/10 | 31 |
| 2 | `localViewStructure` | [02_localViewStructure.md](./02_localViewStructure.md) | 9/10 | 19 |
| 3 | `localFindFiles` | [03_localFindFiles.md](./03_localFindFiles.md) | 9/10 | 25 |
| 4 | `localGetFileContent` | [04_localGetFileContent.md](./04_localGetFileContent.md) | 10/10 | 14 |

### GitHub Tools

| # | Tool | File | Rating | TCs |
|---|------|------|--------|-----|
| 5 | `githubSearchRepositories` | [05_githubSearchRepositories.md](./05_githubSearchRepositories.md) | 9/10 | 15 |
| 6 | `githubSearchCode` | [06_githubSearchCode.md](./06_githubSearchCode.md) | 9/10 | 13 |
| 7 | `githubViewRepoStructure` | [07_githubViewRepoStructure.md](./07_githubViewRepoStructure.md) | 9/10 | 11 |
| 8 | `githubGetFileContent` | [08_githubGetFileContent.md](./08_githubGetFileContent.md) | 9/10 | 11 |
| 9 | `githubSearchPullRequests` | [09_githubSearchPullRequests.md](./09_githubSearchPullRequests.md) | 8/10 | 22 |
| 10 | `packageSearch` | [10_packageSearch.md](./10_packageSearch.md) | 4/10 | 8 |

### Clone & Directory Fetch Tools

| # | Tool | File | Rating | TCs |
|---|------|------|--------|-----|
| 11 | `githubCloneRepo` | [11_githubCloneRepo.md](./11_githubCloneRepo.md) | 9/10 | 16 |
| 15 | `githubGetFileContent` (dir) | [15_githubGetFileContent_directory.md](./15_githubGetFileContent_directory.md) | 9/10 | 13 |

### LSP Tools

| # | Tool | File | Rating | TCs |
|---|------|------|--------|-----|
| 12 | `lspGotoDefinition` | [12_lspGotoDefinition.md](./12_lspGotoDefinition.md) | 8/10 | 11 |
| 13 | `lspFindReferences` | [13_lspFindReferences.md](./13_lspFindReferences.md) | 9.5/10 | 14 |
| 14 | `lspCallHierarchy` | [14_lspCallHierarchy.md](./14_lspCallHierarchy.md) | 8/10 | 15 |

### Integration Tests

| # | Category | File | TCs |
|---|----------|------|-----|
| 16 | Cross-Tool Integration | [16_integration_tests.md](./16_integration_tests.md) | 18 |

**Total: 256 test cases across 16 eval docs**

---

## Category Summary

| Category | Tools | Avg Rating | Total TCs |
|----------|-------|------------|-----------|
| **Local** | 4 | 9.25/10 | 89 |
| **GitHub** | 6 | 8.0/10 | 80 |
| **Clone** | 2 | 9.0/10 | 29 |
| **LSP** | 3 | 8.5/10 | 40 |
| **Integration** | - | - | 18 |

---

## Audit Reports

| Report | Description |
|--------|-------------|
| [FAILURE_ANALYSIS.md](./FAILURE_ANALYSIS.md) | Root cause: design vs bug vs test |
| [MISSING_TESTS_AUDIT.md](./MISSING_TESTS_AUDIT.md) | Schema params vs test coverage |
| [EVAL_DOCS_AUDIT_REPORT.md](./EVAL_DOCS_AUDIT_REPORT.md) | Per-doc schema alignment |

---

## Reference Plans

Comprehensive test matrices with schema validation, edge cases, and failure scenarios:

| Plan | File | Scope |
|------|------|-------|
| Local Tools | [LOCAL_TOOLS_TESTS.md](./LOCAL_TOOLS_TESTS.md) | 7 local + LSP tools, 51 tests |
| GitHub Tools | [GITHUB_TOOLS_TEST_PLAN.md](./GITHUB_TOOLS_TEST_PLAN.md) | All 14 tools, 300+ tests |
| Clone Tools | [CLONE_TOOLS_TEST_PLAN.md](./CLONE_TOOLS_TEST_PLAN.md) | Clone + directory, 130+ tests |
| Public Repo Questions | [EVAL_QUESTIONS_PUBLIC_REPOS.md](./EVAL_QUESTIONS_PUBLIC_REPOS.md) | 20 real-world eval questions |

---

## Known Issues / Design Notes

| Tool | Note | Test Case |
|------|------|-----------|
| `packageSearch` | Env-dependent: npm config registry (private vs public) | TC-1, TC-2 |
| `localSearchCode` | Design: filesOnly overrides count when both set | TC-17 |
| `lspGotoDefinition` | Use orderHint=0 for single-occurrence lines (e.g. imports) | TC-5 |
| `githubSearchPullRequests` | Design: No output size limits | TC-8, TC-9 |
| `lspCallHierarchy` | Design: depth=2 produces large output for well-connected functions | TC-5 |

---

## Last Updated

Feb 19, 2026 — Design vs bug labels updated; missing tests audit added
