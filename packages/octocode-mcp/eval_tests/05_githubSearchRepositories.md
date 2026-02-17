# Eval Test: `githubSearchRepositories`

> **Rating: 9/10** | Category: GitHub | Last tested: Feb 17, 2026

---

## Tool Overview

Searches GitHub repositories by keywords, topics, stars, creation date, and owner. Returns rich metadata including stars, forks, topics, visibility, and timestamps.

---

## Test Cases

### TC-1: Topic Search

**Goal:** Verify `topicsToSearch` finds repos by GitHub topics.

```json
{
  "mainResearchGoal": "Find MCP-related repositories",
  "researchGoal": "Search by MCP topics",
  "reasoning": "Topics are the primary discovery mechanism for open-source projects",
  "topicsToSearch": ["mcp", "model-context-protocol"]
}
```

**Expected:**
- [ ] Returns repos tagged with `mcp` or `model-context-protocol`
- [ ] Well-known repos like `fastmcp` appear
- [ ] Repo metadata includes stars, forks, topics

---

### TC-2: Stars Filter

**Goal:** Verify `stars` filter with range operator.

```json
{
  "mainResearchGoal": "Find popular MCP repositories",
  "researchGoal": "Filter by star count",
  "reasoning": "Stars indicate project popularity and maturity",
  "topicsToSearch": ["mcp"],
  "stars": ">100"
}
```

**Expected:**
- [ ] All returned repos have 100+ stars
- [ ] Star counts visible in metadata

---

### TC-3: Sort by Stars

**Goal:** Verify `sort: "stars"` orders by star count.

```json
{
  "mainResearchGoal": "Find most popular TypeScript CLI tools",
  "researchGoal": "Sort results by popularity",
  "reasoning": "Star sorting reveals most popular projects first",
  "keywordsToSearch": ["typescript cli"],
  "sort": "stars",
  "limit": 5
}
```

**Expected:**
- [ ] Highest-starred repos appear first
- [ ] Descending star count order

---

### TC-4: Keyword Search

**Goal:** Verify `keywordsToSearch` finds repos by text match.

```json
{
  "mainResearchGoal": "Find MCP server implementations",
  "researchGoal": "Search by keywords",
  "reasoning": "Keywords search repo names, descriptions, and READMEs",
  "keywordsToSearch": ["mcp server"]
}
```

**Expected:**
- [ ] Repos with "mcp server" in name/description/README
- [ ] Relevant results returned

---

### TC-5: Match Fields

**Goal:** Verify `match` scopes search to specific fields.

```json
{
  "mainResearchGoal": "Find repos with MCP in their name",
  "researchGoal": "Search name and description only",
  "reasoning": "Restricting match fields improves precision",
  "keywordsToSearch": ["mcp"],
  "match": ["name", "description"],
  "limit": 5
}
```

**Expected:**
- [ ] Only repos with "mcp" in name or description
- [ ] More precise than unscoped search

---

### TC-6: Created Date Filter

**Goal:** Verify `created` date filter works.

```json
{
  "mainResearchGoal": "Find recently created MCP projects",
  "researchGoal": "Filter by creation date",
  "reasoning": "Date filtering helps find newest projects",
  "keywordsToSearch": ["mcp"],
  "created": ">2025-01-01",
  "limit": 5
}
```

**Expected:**
- [ ] All repos created after Jan 1, 2025
- [ ] `createdAt` dates in metadata confirm filter

---

### TC-7: Owner Scoping

**Goal:** Verify `owner` scopes to a specific user/org.

```json
{
  "mainResearchGoal": "Find bgauryy's repositories",
  "researchGoal": "Scope to owner",
  "reasoning": "Owner filter narrows to specific user",
  "owner": "bgauryy"
}
```

**Expected:**
- [ ] Only repos owned by `bgauryy`
- [ ] `owner` field matches in all results

---

### TC-8: Sort by Updated

**Goal:** Verify `sort: "updated"` orders by update time.

```json
{
  "mainResearchGoal": "Find recently updated repos",
  "researchGoal": "Sort by update time",
  "reasoning": "Updated sort shows actively maintained projects",
  "owner": "bgauryy",
  "sort": "updated",
  "limit": 5
}
```

**Expected:**
- [ ] Most recently updated repos first
- [ ] `updatedAt` or `pushedAt` timestamps descending

---

### TC-9: Limit Results

**Goal:** Verify `limit` caps returned results.

```json
{
  "mainResearchGoal": "Find TypeScript projects",
  "researchGoal": "Verify limit parameter",
  "reasoning": "Limit controls result count for efficiency",
  "keywordsToSearch": ["typescript"],
  "limit": 3
}
```

**Expected:**
- [ ] Exactly 3 repos returned
- [ ] Total count in pagination may be higher

---

### TC-10: Pagination Total Matches

**Goal:** Verify `pagination.totalMatches` returns proper counts.

```json
{
  "mainResearchGoal": "Verify pagination metadata",
  "researchGoal": "Check totalMatches accuracy",
  "reasoning": "totalMatches was previously broken (always 0)",
  "topicsToSearch": ["mcp"],
  "limit": 3
}
```

**Expected:**
- [ ] `pagination.totalMatches` > 0
- [ ] Count reflects actual number of matching repos
- [ ] Not 0 (previously known bug, now fixed)

---

### TC-11: Size Filter

**Goal:** Verify `size` filters repos by repository size.

```json
{
  "mainResearchGoal": "Find small MCP repos",
  "researchGoal": "Filter by repo size",
  "reasoning": "Size filter narrows to repos of specific sizes",
  "keywordsToSearch": ["mcp"],
  "size": "<10000",
  "limit": 5
}
```

**Expected:**
- [ ] All repos under the size threshold
- [ ] Size metadata visible

---

### TC-12: Updated Date Filter

**Goal:** Verify `updated` date filter scopes to recently active repos.

```json
{
  "mainResearchGoal": "Find recently maintained MCP repos",
  "researchGoal": "Filter by update date",
  "reasoning": "Updated filter shows actively maintained projects",
  "topicsToSearch": ["mcp"],
  "updated": ">2025-01-01",
  "limit": 5
}
```

**Expected:**
- [ ] All repos updated after Jan 1, 2025
- [ ] `updatedAt` dates confirm filter

---

### TC-13: Page Navigation

**Goal:** Verify `page` parameter for result pagination.

```json
{
  "mainResearchGoal": "Navigate repo search results",
  "researchGoal": "Test pagination page 2",
  "reasoning": "Page parameter enables browsing through results",
  "keywordsToSearch": ["typescript"],
  "limit": 5,
  "page": 2
}
```

**Expected:**
- [ ] Different repos than page 1
- [ ] No overlap with first page results
- [ ] Pagination metadata shows current page

---

### TC-14: No Results Query

**Goal:** Verify clean handling when no repos match.

```json
{
  "mainResearchGoal": "Test empty results",
  "researchGoal": "Query with no matches",
  "reasoning": "Tool should handle zero results gracefully",
  "keywordsToSearch": ["COMPLETELY_NONEXISTENT_REPO_XYZ_99999"],
  "limit": 5
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results or `totalMatches: 0`
- [ ] Clear indication no repos found

---

### TC-15: Keywords + Topics Combined

**Goal:** Verify both `keywordsToSearch` and `topicsToSearch` work together.

```json
{
  "mainResearchGoal": "Find TypeScript MCP projects",
  "researchGoal": "Combined keyword + topic search",
  "reasoning": "Combining both should narrow results effectively",
  "keywordsToSearch": ["server"],
  "topicsToSearch": ["mcp"],
  "limit": 5
}
```

**Expected:**
- [ ] Results match both keyword and topic criteria
- [ ] More precise than either filter alone

---

### TC-16: Sort by Forks

**Goal:** Verify `sort: "forks"` orders results by fork count.

```json
{
  "mainResearchGoal": "Find most forked repositories",
  "researchGoal": "Sort by forks",
  "reasoning": "Fork count indicates adoption and community engagement",
  "keywordsToSearch": ["machine learning"],
  "sort": "forks",
  "limit": 5
}
```

**Expected:**
- [ ] Highest-forked repos appear first
- [ ] Fork count visible in metadata
- [ ] Descending fork order

---

### TC-17: Sort by Best Match (Default)

**Goal:** Verify `sort: "best-match"` uses relevance scoring.

```json
{
  "mainResearchGoal": "Find most relevant repos",
  "researchGoal": "Default relevance sort",
  "reasoning": "best-match uses GitHub's relevance algorithm",
  "keywordsToSearch": ["mcp server"],
  "sort": "best-match",
  "limit": 5
}
```

**Expected:**
- [ ] Results sorted by relevance (not stars, forks, or date)
- [ ] Most relevant repos first
- [ ] Same behavior as omitting `sort` parameter

---

### TC-18: Limit Maximum (Boundary)

**Goal:** Verify `limit: 100` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test limit boundary",
  "researchGoal": "Maximum result limit",
  "reasoning": "Max limit should return many results without error",
  "keywordsToSearch": ["javascript"],
  "limit": 100
}
```

**Expected:**
- [ ] Up to 100 repos returned
- [ ] No timeout or error
- [ ] All entries valid

---

### TC-19: Page Maximum (Boundary)

**Goal:** Verify `page: 10` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test page boundary",
  "researchGoal": "Maximum page number",
  "reasoning": "Max page should return results or empty",
  "keywordsToSearch": ["javascript"],
  "limit": 5,
  "page": 10
}
```

**Expected:**
- [ ] Returns results from page 10 or empty if fewer pages exist
- [ ] No error thrown
- [ ] Pagination metadata accurate

---

### TC-20: Stars Range Format

**Goal:** Verify `stars` with range format (e.g., `"100..500"`).

```json
{
  "mainResearchGoal": "Find mid-popularity repos",
  "researchGoal": "Stars range filter",
  "reasoning": "Range format narrows to mid-tier popularity",
  "keywordsToSearch": ["mcp"],
  "stars": "100..1000",
  "limit": 5
}
```

**Expected:**
- [ ] All repos have between 100 and 1000 stars
- [ ] Star counts in metadata confirm range
- [ ] More precise than single-bound filter

---

### TC-21: Match README Only

**Goal:** Verify `match: ["readme"]` searches only README content.

```json
{
  "mainResearchGoal": "Find repos by README content",
  "researchGoal": "Search README only",
  "reasoning": "README-only search finds repos by documentation",
  "keywordsToSearch": ["model context protocol"],
  "match": ["readme"],
  "limit": 5
}
```

**Expected:**
- [ ] Repos found based on README content
- [ ] May differ from name/description search results
- [ ] README content contains the keywords

---

### TC-22: Keywords with Special Characters

**Goal:** Verify keywords containing special characters are handled.

```json
{
  "mainResearchGoal": "Test special characters in search",
  "researchGoal": "Search with special chars",
  "reasoning": "Special characters should be handled gracefully",
  "keywordsToSearch": ["C++", "@scope/package"],
  "limit": 5
}
```

**Expected:**
- [ ] Search completes without error
- [ ] Results relevant to the keywords
- [ ] Special characters properly escaped or handled

---

### TC-23: No Keywords and No Topics (Validation)

**Goal:** Verify behavior when neither `keywordsToSearch` nor `topicsToSearch` is provided.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Missing required params",
  "reasoning": "At least one of keywords or topics is required",
  "owner": "bgauryy",
  "limit": 5
}
```

**Expected:**
- [ ] Validation error about missing keywords/topics
- [ ] Clear error message
- [ ] No empty search executed

---

### TC-24: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid search", "reasoning": "Test", "keywordsToSearch": ["mcp"], "limit": 3},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Invalid search", "reasoning": "Test", "owner": "nonexistent-org-xyz-99999"},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid search 2", "reasoning": "Test", "topicsToSearch": ["typescript"], "limit": 3}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed with results
- [ ] Second query returns error or empty results
- [ ] Each result isolated per query
- [ ] No cascade failure

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Topic search | |
| 2 | Stars filter | |
| 3 | Sort by stars | |
| 4 | Keyword search | |
| 5 | Match fields | |
| 6 | Created date | |
| 7 | Owner scoping | |
| 8 | Sort by updated | |
| 9 | Limit results | |
| 10 | Pagination totalMatches | |
| 11 | Size filter | |
| 12 | Updated date filter | |
| 13 | Page navigation | |
| 14 | No results query | |
| 15 | Keywords + topics combined | |
| 16 | Sort by forks | |
| 17 | Sort by best match (default) | |
| 18 | Limit maximum (boundary) | |
| 19 | Page maximum (boundary) | |
| 20 | Stars range format | |
| 21 | Match README only | |
| 22 | Keywords with special characters | |
| 23 | No keywords and no topics (validation) | |
| 24 | Bulk queries (error isolation) | |
