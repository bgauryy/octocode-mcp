# Eval Docs Audit Report

> **Generated:** Feb 19, 2026 | **Method:** MCP tools (localViewStructure, localFindFiles, localGetFileContent, localSearchCode) + schema comparison

---

## Summary

| Category | Docs | Status | Notes |
|----------|------|--------|-------|
| **Local** | 4 | ✅ Aligned | Params match schema; eval docs show single-query format |
| **GitHub** | 6 | ✅ Aligned | All include mainResearchGoal, researchGoal, reasoning |
| **Clone** | 2 | ✅ Aligned | Prerequisites and schema params documented |
| **LSP** | 3 | ✅ Aligned | lineHint prerequisite documented; uri/symbolName/lineHint correct |
| **Integration** | 1 | ✅ Aligned | Cross-tool flows match funnel method |
| **Meta** | 3 | ⚠️ Minor | TC count mismatch (see below) |

---

## Per-Doc Audit

### 01_localSearchCode.md
- **Rating:** 9/10 | **TCs:** 31
- **Schema:** `packages/octocode-mcp/src/tools/local_ripgrep/scheme.ts`
- **Params validated:** pattern, path, mode, filesOnly, include, exclude, excludeDir, matchContentLength, matchesPerPage, filesPerPage, filePageNumber, caseInsensitive, maxMatchesPerFile, maxFiles, sort, lineNumbers, fixedString, multiline, wholeWord, count, invertMatch, beforeContext, afterContext, type, countMatches, hidden
- **Format:** Single-query object (wrap in `queries: [...]` when calling)
- **Known issue:** TC-17 documents count+filesOnly conflict ✅

### 02_localViewStructure.md
- **Rating:** 9/10 | **TCs:** 19
- **Schema:** `packages/octocode-mcp/src/tools/local_view_structure/scheme.ts`
- **Params validated:** path, depth, filesOnly, directoriesOnly, extension, extensions, sortBy, reverse, limit, pattern, entriesPerPage, entryPageNumber, details, hidden, recursive, summary, showFileLastModified, charOffset, charLength, humanReadable
- **Format:** Single-query object
- **Boundaries:** depth 1–5, entriesPerPage 1–50, limit 1–10000 ✅

### 03_localFindFiles.md
- **Rating:** 9/10 | **TCs:** 25
- **Schema:** `packages/octocode-mcp/src/tools/local_find_files/scheme.ts`
- **Params validated:** path, name, iname, names, maxDepth, minDepth, type, regex, regexType, sizeGreater, sizeLess, modifiedWithin, modifiedBefore, accessedWithin, excludeDir, sortBy, limit, details, filesPerPage, filePageNumber, empty, pathPattern, executable, permissions, readable, writable
- **Format:** Single-query object
- **Error cases:** TC-23 (non-existent path), TC-24 (invalid regex) ✅

### 04_localGetFileContent.md
- **Rating:** 10/10 | **TCs:** 22
- **Schema:** `packages/octocode-mcp/src/tools/local_fetch_content/scheme.ts`
- **Params validated:** path, startLine, endLine, matchString, matchStringContextLines, matchStringIsRegex, matchStringCaseSensitive, fullContent, charOffset, charLength
- **Format:** Single-query or bulk (`queries` array) — TC-22 tests bulk
- **Validation:** fullContent+matchString conflict, startLine>endLine documented ✅

### 05_githubSearchRepositories.md
- **Rating:** 9/10 | **TCs:** 15
- **Params:** mainResearchGoal, researchGoal, reasoning, topicsToSearch, keywordsToSearch, stars, sort, limit, owner
- **Format:** Single-query with required research context ✅

### 06_githubSearchCode.md
- **Rating:** 9/10 | **TCs:** 13
- **Params:** mainResearchGoal, researchGoal, reasoning, keywordsToSearch, match, extension, owner, repo, limit
- **Format:** Single-query with required research context ✅

### 07_githubViewRepoStructure.md
- **Rating:** 9/10 | **TCs:** 11
- **Params:** mainResearchGoal, researchGoal, reasoning, owner, repo, branch, path, depth, entriesPerPage
- **Format:** Single-query with required research context ✅

### 08_githubGetFileContent.md
- **Rating:** 9/10 | **TCs:** 11
- **Params:** mainResearchGoal, researchGoal, reasoning, owner, repo, path, matchString, matchStringContextLines, startLine, endLine, fullContent
- **Format:** Single-query with required research context ✅

### 09_githubSearchPullRequests.md
- **Rating:** 8/10 | **TCs:** 22
- **Params:** mainResearchGoal, researchGoal, reasoning, owner, repo, type, state, merged, withComments, withCommits, limit
- **Format:** Single-query with required research context ✅
- **Known issue:** Large output (78KB+) documented ✅

### 10_packageSearch.md
- **Rating:** 4/10 | **TCs:** 8
- **Params:** mainResearchGoal, researchGoal, reasoning, name, ecosystem, searchLimit, npmFetchMetadata, pythonFetchMetadata
- **Format:** Single-query with required research context ✅
- **Known issue:** npm public search broken ✅

### 11_githubCloneRepo.md
- **Rating:** 9/10 | **TCs:** 16
- **Params:** mainResearchGoal, researchGoal, reasoning, owner, repo, branch, sparse_path
- **Prerequisites:** ENABLE_LOCAL, ENABLE_CLONE, GITHUB_TOKEN, git
- **Schema table:** Matches scheme ✅

### 12_lspGotoDefinition.md
- **Rating:** 8/10 | **TCs:** 11
- **Params:** uri, symbolName, lineHint, contextLines, orderHint
- **Prerequisite:** localSearchCode first to get lineHint ✅
- **Known issue:** orderHint fails on re-exports ✅

### 13_lspFindReferences.md
- **Rating:** 9.5/10 | **TCs:** 14
- **Params:** uri, symbolName, lineHint, includeDeclaration, contextLines, includePattern, excludePattern
- **Prerequisite:** localSearchCode first ✅

### 14_lspCallHierarchy.md
- **Rating:** 8/10 | **TCs:** 15
- **Params:** uri, symbolName, lineHint, direction, depth, contextLines
- **Prerequisite:** localSearchCode first; use for functions only (lspFindReferences for types) ✅
- **Known issue:** depth:2 produces 101KB+ output ✅

### 15_githubGetFileContent_directory.md
- **Rating:** 9/10 | **TCs:** 13
- **Params:** mainResearchGoal, researchGoal, reasoning, owner, repo, path, type: "directory", branch
- **Rejected params:** fullContent, startLine, endLine, matchString, charOffset, charLength
- **Prerequisites:** ENABLE_LOCAL, ENABLE_CLONE, GITHUB_TOKEN ✅

### 16_integration_tests.md
- **Category:** Cross-tool integration
- **TCs:** 18 flows
- **Funnel:** Structure → Search → Locate → Analyze → Read ✅
- **Flows validated:** Local funnel, call hierarchy, package discovery, clone→LSP, directory fetch→local, PR archaeology, local vs GitHub search, etc.

---

## Discrepancies Found

| Doc | Issue | Severity |
|-----|-------|----------|
| COMPLETE_TEST_PLAN.md | githubSearchPullRequests listed as "46 TCs" but 09_githubSearchPullRequests.md has ~22 TCs | Low |
| README.md | Total "256 test cases" — verify sum (89+80+29+40+18=256) | None |
| 04_localGetFileContent.md | README says 14 TCs, doc has 22 TCs | Low |

---

## Input Format Reminder

All tools accept **bulk format** with `queries` array:

```json
{
  "queries": [
    { "pattern": "<...>", "path": "<...>", "mode": "discovery" }
  ]
}
```

Eval docs show the **inner query object** for single-query tests. When running, wrap in `queries: [ ... ]`.

---

## Files Audited

| File | Size | Last Modified |
|------|------|---------------|
| 01_localSearchCode.md | 19.5KB | Feb 18, 2026 |
| 02_localViewStructure.md | 11.1KB | Feb 18, 2026 |
| 03_localFindFiles.md | 14.6KB | Feb 17, 2026 |
| 04_localGetFileContent.md | 10.5KB | Feb 17, 2026 |
| 05_githubSearchRepositories.md | 12.1KB | Feb 17, 2026 |
| 06_githubSearchCode.md | 11.2KB | Feb 17, 2026 |
| 07_githubViewRepoStructure.md | 10.0KB | Feb 17, 2026 |
| 08_githubGetFileContent.md | 11.4KB | Feb 17, 2026 |
| 09_githubSearchPullRequests.md | 20.6KB | Feb 17, 2026 |
| 10_packageSearch.md | 8.8KB | Feb 17, 2026 |
| 11_githubCloneRepo.md | 15.2KB | Feb 17, 2026 |
| 12_lspGotoDefinition.md | 9.3KB | Feb 17, 2026 |
| 13_lspFindReferences.md | 12.3KB | Feb 17, 2026 |
| 14_lspCallHierarchy.md | 13.3KB | Feb 17, 2026 |
| 15_githubGetFileContent_directory.md | 14.7KB | Feb 17, 2026 |
| 16_integration_tests.md | 21.6KB | Feb 17, 2026 |
| README.md | 4.4KB | Feb 17, 2026 |
| COMPLETE_TEST_PLAN.md | 8.4KB | Feb 17, 2026 |
| EVAL_QUESTIONS_PUBLIC_REPOS.md | 17.5KB | Jan 22, 2026 |

---

## Conclusion

**All 16 tool eval docs are schema-aligned and correctly document parameters, prerequisites, and known issues.** Minor discrepancies exist in TC counts between README, COMPLETE_TEST_PLAN, and individual docs — consider reconciling for consistency.
