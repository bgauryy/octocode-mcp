# Eval Test: `packageSearch`

> **Rating: 4/10** | Category: GitHub | Last tested: Feb 17, 2026

---

## Tool Overview

Searches npm and PyPI package registries. Returns package metadata including name, description, version, repository URL, and publish date. **Known critical issue:** npm public registry search returns empty results for well-known packages.

---

## Test Cases

### TC-1: npm — Popular Package (express)

**Goal:** Verify npm search for well-known package. **KNOWN FAILURE.**

```json
{
  "mainResearchGoal": "Find express package",
  "researchGoal": "npm search for express",
  "reasoning": "express is a top-5 npm package — must be findable",
  "name": "express",
  "ecosystem": "npm"
}
```

**Expected:**
- [ ] **KNOWN BUG:** Returns empty result
- [ ] Should return express with repo URL, version, description

---

### TC-2: npm — Popular Package (zod) with Metadata

**Goal:** Verify npm metadata fetch. **KNOWN FAILURE.**

```json
{
  "mainResearchGoal": "Find zod package with metadata",
  "researchGoal": "npm search with metadata",
  "reasoning": "zod is a popular validation library",
  "name": "zod",
  "ecosystem": "npm",
  "npmFetchMetadata": true
}
```

**Expected:**
- [ ] **KNOWN BUG:** Returns empty result
- [ ] Should return zod with version, description, lastPublished

---

### TC-3: npm — Scoped Package (mcp)

**Goal:** Verify npm search works for scoped/private packages.

```json
{
  "mainResearchGoal": "Find MCP packages on npm",
  "researchGoal": "npm scoped package search",
  "reasoning": "Scoped packages (@wix) work while public doesn't",
  "name": "mcp",
  "ecosystem": "npm",
  "searchLimit": 5
}
```

**Expected:**
- [ ] Returns results (5 @wix scoped packages expected)
- [ ] No timeout (previously timed out at 30s)
- [ ] Package names, descriptions present

---

### TC-4: Python — requests

**Goal:** Verify PyPI search for well-known package.

```json
{
  "mainResearchGoal": "Find requests package",
  "researchGoal": "PyPI search for requests",
  "reasoning": "Python search works perfectly — verify",
  "name": "requests",
  "ecosystem": "python"
}
```

**Expected:**
- [ ] Found `psf/requests` with repo URL
- [ ] Rich metadata (version, description)
- [ ] Repository URL links to GitHub

---

### TC-5: Python — flask with Metadata

**Goal:** Verify PyPI metadata fetch works.

```json
{
  "mainResearchGoal": "Find flask with full metadata",
  "researchGoal": "PyPI search with metadata",
  "reasoning": "Python metadata fetch should provide rich info",
  "name": "flask",
  "ecosystem": "python",
  "pythonFetchMetadata": true
}
```

**Expected:**
- [ ] Found with version, description, lastPublished
- [ ] Repository URL present
- [ ] `pythonFetchMetadata` provides extra fields

---

### TC-6: npm — Search Limit

**Goal:** Verify `searchLimit` controls number of results.

```json
{
  "mainResearchGoal": "Test search limit on npm",
  "researchGoal": "Verify searchLimit parameter",
  "reasoning": "searchLimit should cap results",
  "name": "react",
  "ecosystem": "npm",
  "searchLimit": 3
}
```

**Expected:**
- [ ] At most 3 results (if any — may be empty due to npm bug)
- [ ] Or empty result (known bug for public packages)

---

### TC-7: Python — Unknown Package

**Goal:** Verify graceful handling of non-existent package.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Search for non-existent package",
  "reasoning": "Tool should handle missing packages gracefully",
  "name": "this-package-does-not-exist-xyz-99999",
  "ecosystem": "python"
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty or "not found" result
- [ ] Clear indication package doesn't exist

---

### TC-8: npm — Specific Scoped Package

**Goal:** Verify npm finds a known scoped package directly.

```json
{
  "mainResearchGoal": "Find specific scoped npm package",
  "researchGoal": "Direct scoped package lookup",
  "reasoning": "Scoped packages work — verify direct lookup",
  "name": "@modelcontextprotocol/sdk",
  "ecosystem": "npm",
  "searchLimit": 1
}
```

**Expected:**
- [ ] Returns the specific SDK package
- [ ] Version, description, repo URL present

---

### TC-9: Search Limit Maximum (Boundary)

**Goal:** Verify `searchLimit: 10` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test searchLimit boundary",
  "researchGoal": "Maximum search limit",
  "reasoning": "Max limit should return many packages",
  "name": "react",
  "ecosystem": "npm",
  "searchLimit": 10
}
```

**Expected:**
- [ ] Up to 10 packages returned (or empty due to npm bug)
- [ ] No timeout or error at maximum value
- [ ] All entries valid

---

### TC-10: Search Limit Minimum (Boundary)

**Goal:** Verify `searchLimit: 1` (minimum/default) returns exactly one result.

```json
{
  "mainResearchGoal": "Test searchLimit boundary",
  "researchGoal": "Minimum search limit",
  "reasoning": "Default limit is 1, verify exact behavior",
  "name": "flask",
  "ecosystem": "python",
  "searchLimit": 1
}
```

**Expected:**
- [ ] Exactly 1 package returned
- [ ] The most relevant match for "flask"
- [ ] Rich metadata present

---

### TC-11: Empty Name (Validation)

**Goal:** Verify empty `name` is rejected.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Empty name validation",
  "reasoning": "Name is required and must be at least 1 char",
  "name": "",
  "ecosystem": "npm"
}
```

**Expected:**
- [ ] Validation error about name being empty
- [ ] Clear error message
- [ ] No search executed

---

### TC-12: Name with Special Characters

**Goal:** Verify package names with special characters are handled.

```json
{
  "mainResearchGoal": "Test special characters",
  "researchGoal": "Package name with special chars",
  "reasoning": "Some packages have hyphens, underscores, dots",
  "name": "ts-node",
  "ecosystem": "npm",
  "searchLimit": 3
}
```

**Expected:**
- [ ] Search completes without error
- [ ] Relevant results for "ts-node" returned (or empty due to npm bug)
- [ ] Special characters handled correctly

---

### TC-13: Python — Search Limit Behavior

**Goal:** Verify Python `searchLimit` behavior (PyPI always returns 1).

```json
{
  "mainResearchGoal": "Test Python searchLimit",
  "researchGoal": "Python search limit behavior",
  "reasoning": "PyPI limitation: always returns 1 result regardless of searchLimit",
  "name": "django",
  "ecosystem": "python",
  "searchLimit": 5
}
```

**Expected:**
- [ ] Returns 1 result (PyPI limitation)
- [ ] `searchLimit: 5` does not cause error
- [ ] Result is the correct "django" package

---

### TC-14: npm — npmFetchMetadata with Scoped Package

**Goal:** Verify `npmFetchMetadata: true` works with scoped packages.

```json
{
  "mainResearchGoal": "Test metadata fetch on scoped package",
  "researchGoal": "Scoped npm metadata",
  "reasoning": "Scoped packages should support metadata fetch",
  "name": "@modelcontextprotocol/sdk",
  "ecosystem": "npm",
  "npmFetchMetadata": true,
  "searchLimit": 1
}
```

**Expected:**
- [ ] Package found with full metadata
- [ ] Version, description, lastPublished present
- [ ] Repository URL present

---

### TC-15: Bulk Queries (Mixed Ecosystems)

**Goal:** Verify bulk queries across npm and Python ecosystems.

```json
{
  "queries": [
    {"mainResearchGoal": "Bulk test", "researchGoal": "npm package", "reasoning": "Test", "name": "mcp", "ecosystem": "npm", "searchLimit": 3},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Python package", "reasoning": "Test", "name": "requests", "ecosystem": "python"},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Non-existent", "reasoning": "Test", "name": "nonexistent-pkg-xyz-99999", "ecosystem": "python"}
  ]
}
```

**Expected:**
- [ ] First query returns npm results
- [ ] Second query returns Python result
- [ ] Third query returns empty/not-found
- [ ] Each result isolated per query
- [ ] Mixed ecosystem queries work

---

## Known Issues

| Issue | Status | Details |
|-------|--------|---------|
| npm public search broken | **OPEN (P0)** | `express`, `zod`, `react` return empty results |
| npm timeout | **FIXED** | `mcp` search no longer times out |
| Python search | **Working** | All Python/PyPI searches work perfectly |

**Root Cause Hypothesis:** The tool may be querying a private npm registry instead of `registry.npmjs.org` for public packages.

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | npm express (known bug) | |
| 2 | npm zod + metadata (known bug) | |
| 3 | npm scoped mcp | |
| 4 | Python requests | |
| 5 | Python flask + metadata | |
| 6 | npm search limit | |
| 7 | Python unknown package | |
| 8 | npm scoped package | |
| 9 | Search Limit Maximum (Boundary) | |
| 10 | Search Limit Minimum (Boundary) | |
| 11 | Empty Name (Validation) | |
| 12 | Name with Special Characters | |
| 13 | Python — Search Limit Behavior | |
| 14 | npm — npmFetchMetadata with Scoped Package | |
| 15 | Bulk Queries (Mixed Ecosystems) | |
