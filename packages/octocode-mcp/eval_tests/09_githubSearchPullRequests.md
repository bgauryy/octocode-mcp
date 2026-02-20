# Eval Test: `githubSearchPullRequests`

> **Rating: 8/10** | Category: GitHub | Last tested: Feb 17, 2026

---

## Tool Overview

Searches and retrieves GitHub pull request data. Supports metadata-only, partial content (targeted file diffs), and full content modes. Includes comments, commits, and file change data. Known issue: output can be extremely large (78KB+).

---

## Test Cases

### TC-1: Metadata Mode

**Goal:** Verify `type: "metadata"` returns rich PR metadata.

```json
{
  "mainResearchGoal": "Find recent PRs in octocode-mcp",
  "researchGoal": "PR metadata listing",
  "reasoning": "Metadata mode is the cheapest way to browse PRs",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "type": "metadata",
  "state": "closed",
  "merged": true,
  "limit": 3
}
```

**Expected:**
- [ ] PR metadata includes title, author, state, merged status
- [ ] File changes listed with additions/deletions
- [ ] No full diff content (only summary)

---

### TC-2: State + Merged Filter

**Goal:** Verify `state: "closed"` + `merged: true` combination.

```json
{
  "mainResearchGoal": "Find merged PRs",
  "researchGoal": "Filter by merged status",
  "reasoning": "Merged PRs represent completed work",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "limit": 5
}
```

**Expected:**
- [ ] All PRs are closed AND merged
- [ ] No open or unmerged PRs in results

---

### TC-3: With Comments

**Goal:** Verify `withComments: true` includes PR review comments.

```json
{
  "mainResearchGoal": "Read PR discussion",
  "researchGoal": "Include review comments",
  "reasoning": "Comments explain WHY changes were made",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "withComments": true,
  "limit": 2
}
```

**Expected:**
- [ ] Comments included in response
- [ ] Comment authors and timestamps present
- [ ] Output may be large (known issue)

---

### TC-4: With Commits

**Goal:** Verify `withCommits: true` includes commit history.

```json
{
  "mainResearchGoal": "See PR commit history",
  "researchGoal": "Include commits",
  "reasoning": "Commits show the evolution of a PR",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "withCommits": true,
  "limit": 2
}
```

**Expected:**
- [ ] Commit history included
- [ ] Commit SHA, message, author, date present
- [ ] Output may be large (known issue)

---

### TC-5: Specific PR by Number (Metadata)

**Goal:** Verify `prNumber` retrieves specific PR.

```json
{
  "mainResearchGoal": "Read specific PR details",
  "researchGoal": "Fetch PR by number",
  "reasoning": "prNumber for targeted PR lookup",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "prNumber": 1,
  "type": "metadata"
}
```

**Expected:**
- [ ] Single PR returned matching the number
- [ ] All other filters ignored (prNumber overrides)

---

### TC-6: Partial Content with File Diffs

**Goal:** Verify `type: "partialContent"` with `partialContentMetadata` for targeted diffs.

```json
{
  "mainResearchGoal": "Read specific file changes in a PR",
  "researchGoal": "Targeted file diff extraction",
  "reasoning": "partialContent is token-efficient for specific file changes",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "prNumber": 1,
  "type": "partialContent",
  "partialContentMetadata": [{"file": "package.json"}]
}
```

**Expected:**
- [ ] Only `package.json` diff returned
- [ ] Additions and deletions visible
- [ ] Much smaller output than fullContent

---

### TC-7: Open PRs

**Goal:** Verify `state: "open"` lists open PRs.

```json
{
  "mainResearchGoal": "Find open PRs",
  "researchGoal": "List open pull requests",
  "reasoning": "Open PRs show work in progress",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "open",
  "type": "metadata",
  "limit": 5
}
```

**Expected:**
- [ ] All PRs have state "open"
- [ ] No closed PRs in results

---

### TC-8: Large Output Warning (Comments + Commits)

**Goal:** Document expected large output with both comments and commits.

```json
{
  "mainResearchGoal": "Test large output scenario",
  "researchGoal": "Measure output size with full options",
  "reasoning": "Known issue: combined options produce 78KB+",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "withComments": true,
  "withCommits": true,
  "limit": 3
}
```

**Expected:**
- [ ] Response succeeds (no timeout)
- [ ] Output may be very large (78KB+) — **Design:** no output size limits

---

### TC-9: Full Content Mode (Large PR)

**Goal:** Document output size for fullContent on large PRs.

```json
{
  "mainResearchGoal": "Test full content output size",
  "researchGoal": "Measure fullContent output",
  "reasoning": "Known issue: fullContent can produce 139KB+ output",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "prNumber": 320,
  "type": "fullContent",
  "withComments": true,
  "withCommits": true
}
```

**Expected:**
- [ ] Response succeeds (may be slow)
- [ ] Output very large (139KB+ for 45-file PR) — **Design:** no output size limits

---

### TC-10: Author Filter

**Goal:** Verify `author` filters PRs by author username.

```json
{
  "mainResearchGoal": "Find PRs by specific author",
  "researchGoal": "Filter by author",
  "reasoning": "Author filter narrows to a specific contributor",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "author": "bgauryy",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] All PRs authored by `bgauryy`
- [ ] No PRs from other authors

---

### TC-11: Label Filter

**Goal:** Verify `label` filters PRs by label.

```json
{
  "mainResearchGoal": "Find PRs with specific label",
  "researchGoal": "Filter by label",
  "reasoning": "Labels categorize PRs by type/priority",
  "owner": "facebook",
  "repo": "react",
  "label": "bug",
  "state": "closed",
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] All PRs have the "bug" label
- [ ] Label info visible in PR metadata

---

### TC-12: Date Range (created)

**Goal:** Verify `created` date filter scopes PRs by creation time.

```json
{
  "mainResearchGoal": "Find recent PRs",
  "researchGoal": "Filter by creation date",
  "reasoning": "Date filter helps focus on recent activity",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "created": ">2025-01-01",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] All PRs created after Jan 1, 2025
- [ ] Creation dates confirm filter

---

### TC-13: Sort by Updated

**Goal:** Verify `sort: "updated"` orders PRs by update time.

```json
{
  "mainResearchGoal": "Find recently updated PRs",
  "researchGoal": "Sort by update time",
  "reasoning": "Updated sort shows most recently active PRs",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "sort": "updated",
  "state": "closed",
  "type": "metadata",
  "limit": 5
}
```

**Expected:**
- [ ] Most recently updated PRs appear first
- [ ] Timestamps in descending order

---

### TC-14: Draft PRs

**Goal:** Verify `draft: true` filters to draft pull requests only.

```json
{
  "mainResearchGoal": "Find draft PRs",
  "researchGoal": "Filter for drafts",
  "reasoning": "Draft PRs represent work-in-progress",
  "owner": "facebook",
  "repo": "react",
  "draft": true,
  "state": "open",
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] All returned PRs are drafts
- [ ] Draft indicator in metadata

---

### TC-15: Head/Base Branch Filter

**Goal:** Verify `head` and `base` branch filters.

```json
{
  "mainResearchGoal": "Find PRs targeting main branch",
  "researchGoal": "Filter by base branch",
  "reasoning": "Base branch filter scopes to specific target branches",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "base": "main",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] All PRs target the `main` branch
- [ ] Base branch info visible in metadata

---

### TC-16: Free-text Query

**Goal:** Verify `query` parameter for free-text PR search.

```json
{
  "mainResearchGoal": "Find PRs mentioning security",
  "researchGoal": "Free-text search in PR content",
  "reasoning": "Query searches PR title, body, and comments",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "query": "security",
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] PRs containing "security" in title or body
- [ ] Relevant results returned

---

### TC-17: Page Navigation

**Goal:** Verify `page` parameter for result pagination.

```json
{
  "mainResearchGoal": "Navigate PR results",
  "researchGoal": "Test pagination",
  "reasoning": "Page parameter enables browsing through results",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "type": "metadata",
  "limit": 3,
  "page": 2
}
```

**Expected:**
- [ ] Different PRs than page 1
- [ ] No overlap with first page results
- [ ] Pagination metadata shows current page

---

### TC-18: Match Fields (Title/Body)

**Goal:** Verify `match` scopes search to specific PR fields.

```json
{
  "mainResearchGoal": "Find PRs with fix in title",
  "researchGoal": "Scope search to title",
  "reasoning": "Match field restriction improves precision",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "query": "fix",
  "match": ["title"],
  "state": "closed",
  "type": "metadata",
  "limit": 5
}
```

**Expected:**
- [ ] Only PRs with "fix" in the title
- [ ] More precise than unscoped search

---

### TC-19: Order (Ascending)

**Goal:** Verify `order: "asc"` reverses result ordering.

```json
{
  "mainResearchGoal": "Find oldest PRs first",
  "researchGoal": "Test ascending order",
  "reasoning": "Ascending order shows oldest first",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "state": "closed",
  "merged": true,
  "sort": "created",
  "order": "asc",
  "type": "metadata",
  "limit": 3
}
```

**Expected:**
- [ ] Oldest PRs appear first
- [ ] Creation dates in ascending order

---

### TC-20: Non-Existent PR Number (Error)

**Goal:** Verify graceful handling of invalid PR number.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Non-existent PR",
  "reasoning": "Tool should handle missing PRs gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "prNumber": 999999,
  "type": "metadata"
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication PR not found
- [ ] No stack trace or internal details leaked

---

### TC-21: Empty Results

**Goal:** Verify clean handling when no PRs match filters.

```json
{
  "mainResearchGoal": "Test empty results",
  "researchGoal": "Query with no matches",
  "reasoning": "Tool should handle zero results gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "query": "COMPLETELY_NONEXISTENT_SEARCH_TERM_XYZ_99999",
  "type": "metadata",
  "limit": 5
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results with clear indication
- [ ] Pagination shows `totalMatches: 0`

---

### TC-22: CharOffset/CharLength Output Pagination

**Goal:** Verify `charOffset` + `charLength` truncate large PR outputs.

```json
{
  "mainResearchGoal": "Test output pagination",
  "researchGoal": "Limit output size with charOffset/charLength",
  "reasoning": "charLength prevents oversized responses",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "prNumber": 1,
  "type": "fullContent",
  "charOffset": 0,
  "charLength": 5000
}
```

**Expected:**
- [ ] Output truncated to ~5000 characters
- [ ] Pagination hint for next charOffset
- [ ] Much smaller output than uncapped

---

## Additional Tests — Untested Parameters

> These cover parameters not exercised in TC-1 through TC-22: commenter, involves, mentions, reviewed-by, head, closed, interactions, match fields, and no-* filters.

### Normal Usage

| # | Description | Query | Expected Result |
|---|-------------|-------|-----------------|
| 23 | Search by commenter | `owner="facebook", repo="react", commenter="gaearon"` | Returns PRs where gaearon commented |
| 24 | Search by involves | `owner="facebook", repo="react", involves="gaearon"` | Returns PRs involving gaearon (author, assignee, commenter, etc.) |
| 25 | Search by mentions | `owner="facebook", repo="react", mentions="gaearon"` | Returns PRs mentioning @gaearon |
| 26 | Search by reviewed-by | `owner="facebook", repo="react", reviewed-by="gaearon"` | Returns PRs reviewed by gaearon |
| 27 | Filter by head branch | `owner="vercel", repo="next.js", head="feature-branch"` | Returns PRs from feature-branch |
| 28 | Filter by closed date | `owner="facebook", repo="react", closed=">2024-01-01"` | Returns PRs closed after 2024-01-01 |
| 29 | Filter by interactions | `owner="facebook", repo="react", interactions=">50"` | Returns PRs with 50+ interactions |
| 30 | Match in title only | `owner="facebook", repo="react", query="fix", match=["title"]` | Returns PRs with "fix" in title only |
| 31 | Match in body and comments | `owner="facebook", repo="react", query="performance", match=["body", "comments"]` | Returns PRs with "performance" in body or comments |

### Edge Cases

| # | Description | Query | Expected Result |
|---|-------------|-------|-----------------|
| 32 | No label filter | `owner="facebook", repo="react", no-label=true` | Returns PRs without any labels |
| 33 | No milestone filter | `owner="facebook", repo="react", no-milestone=true` | Returns PRs without milestone |
| 34 | No project filter | `owner="facebook", repo="react", no-project=true` | Returns PRs not in any project |
| 35 | Head branch with slash | `owner="vercel", repo="next.js", head="feature/new-api"` | Handles branch with slash |
| 36 | Interactions range | `owner="facebook", repo="react", interactions="10..50"` | Returns PRs with 10-50 interactions |
| 37 | Closed date range | `owner="facebook", repo="react", closed="2024-01-01..2024-06-01"` | Returns PRs closed in date range |
| 38 | Combine match with query | `owner="facebook", repo="react", query="bug", match=["title", "body"]` | Searches both title and body |
| 39 | Involves with state | `owner="facebook", repo="react", involves="gaearon", state="closed"` | Returns closed PRs involving user |
| 40 | Updated date filter | `owner="facebook", repo="react", updated=">2024-06-01"` | Returns PRs updated after date |
| 41 | All negative filters | `owner="facebook", repo="react", no-label=true, no-milestone=true, no-assignee=true` | Combines all no-* filters |

### Failure Cases

| # | Description | Query | Expected Error |
|---|-------------|-------|----------------|
| 42 | Invalid match value | `query="test", match=["invalid"]` | Validation error: enum mismatch (must be title/body/comments) |
| 43 | Invalid interactions format | `interactions="invalid"` | Validation error: must be number or range |
| 44 | Invalid closed date format | `closed="not-a-date"` | Validation error: invalid date format |
| 45 | Non-existent commenter | `owner="facebook", repo="react", commenter="nonexistentuser123xyz"` | Empty results |
| 46 | Non-existent reviewed-by | `owner="facebook", repo="react", reviewed-by="nonexistentuser123xyz"` | Empty results |

### Missing Parameter Coverage

| # | Description | Query | Expected Result |
|---|-------------|-------|-----------------|
| 47 | Merged-at date filter | `owner="bgauryy", repo="octocode-mcp", merged-at=">2025-01-01", type="metadata", limit=3` | Returns PRs merged after date |
| 48 | Comments count filter | `owner="facebook", repo="react", comments=">10", state="closed", type="metadata", limit=3` | Returns PRs with 10+ comments |
| 49 | Reactions count filter | `owner="facebook", repo="react", reactions=">5", state="closed", type="metadata", limit=3` | Returns PRs with 5+ reactions |
| 50 | Review-requested filter | `owner="facebook", repo="react", review-requested="gaearon", type="metadata", limit=3` | Returns PRs where review was requested from user |
| 51 | Assignee filter | `owner="facebook", repo="react", assignee="gaearon", state="closed", type="metadata", limit=3` | Returns PRs assigned to gaearon |
| 52 | Label as array (multiple) | `owner="facebook", repo="react", label=["bug", "React 18"], state="closed", type="metadata", limit=3` | Returns PRs with both labels |
| 53 | PartialContent with additions filter | `owner="bgauryy", repo="octocode-mcp", prNumber=1, type="partialContent", partialContentMetadata=[{"file": "package.json", "additions": [1, 5]}]` | Returns only specific addition lines from diff |
| 54 | PartialContent with deletions filter | `owner="bgauryy", repo="octocode-mcp", prNumber=1, type="partialContent", partialContentMetadata=[{"file": "package.json", "deletions": [1, 3]}]` | Returns only specific deletion lines from diff |
| 55 | PartialContent for non-existent file | `owner="bgauryy", repo="octocode-mcp", prNumber=1, type="partialContent", partialContentMetadata=[{"file": "nonexistent.ts"}]` | Empty diff or error for missing file |

### Boundary Value Tests

| # | Description | Query | Expected Result |
|---|-------------|-------|-----------------|
| 56 | Limit minimum (1) | `owner="bgauryy", repo="octocode-mcp", state="closed", merged=true, type="metadata", limit=1` | Exactly 1 PR returned |
| 57 | Limit maximum (10) | `owner="bgauryy", repo="octocode-mcp", state="closed", merged=true, type="metadata", limit=10` | Up to 10 PRs returned |
| 58 | Page maximum (10) | `owner="bgauryy", repo="octocode-mcp", state="closed", type="metadata", limit=3, page=10` | Empty results or far page content |
| 59 | prNumber overrides all filters | `owner="bgauryy", repo="octocode-mcp", prNumber=1, state="open", author="nonexistent", type="metadata"` | Returns PR #1 regardless of other filters |
| 60 | CharLength minimum (1) | `owner="bgauryy", repo="octocode-mcp", prNumber=1, type="fullContent", charLength=1` | Very small output chunk (1 char) |
| 61 | CharLength maximum (50000) | `owner="bgauryy", repo="octocode-mcp", prNumber=1, type="fullContent", charLength=50000` | Large output chunk, up to 50K chars |
| 62 | Comments range format | `owner="facebook", repo="react", comments="5..20", state="closed", type="metadata", limit=3` | Returns PRs with 5-20 comments |
| 63 | Reactions range format | `owner="facebook", repo="react", reactions="1..10", state="closed", type="metadata", limit=3` | Returns PRs with 1-10 reactions |

### Bulk Query Tests

| # | Description | Query | Expected Result |
|---|-------------|-------|-----------------|
| 64 | Bulk queries (3 max) | `queries=[{PR metadata}, {PR by number}, {open PRs}]` | All 3 results returned independently |
| 65 | Bulk with mixed valid/invalid | `queries=[{valid PR}, {prNumber=999999}, {invalid repo}]` | First succeeds, others error, isolated |

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Metadata mode | |
| 2 | State + merged filter | |
| 3 | With comments | |
| 4 | With commits | |
| 5 | Specific PR by number | |
| 6 | Partial content + file diffs | |
| 7 | Open PRs | |
| 8 | Large output (comments+commits) | |
| 9 | Full content mode (large PR) | |
| 10 | Author filter | |
| 11 | Label filter | |
| 12 | Date range (created) | |
| 13 | Sort by updated | |
| 14 | Draft PRs | |
| 15 | Head/base branch filter | |
| 16 | Free-text query | |
| 17 | Page navigation | |
| 18 | Match fields (title/body) | |
| 19 | Order (ascending) | |
| 20 | Non-existent PR (error) | |
| 21 | Empty results | |
| 22 | CharOffset/CharLength pagination | |
| 23 | Search by commenter | |
| 24 | Search by involves | |
| 25 | Search by mentions | |
| 26 | Search by reviewed-by | |
| 27 | Filter by head branch | |
| 28 | Filter by closed date | |
| 29 | Filter by interactions | |
| 30 | Match in title only | |
| 31 | Match in body and comments | |
| 32 | No label filter | |
| 33 | No milestone filter | |
| 34 | No project filter | |
| 35 | Head branch with slash | |
| 36 | Interactions range | |
| 37 | Closed date range | |
| 38 | Combine match with query | |
| 39 | Involves with state | |
| 40 | Updated date filter | |
| 41 | All negative filters | |
| 42 | Invalid match value (error) | |
| 43 | Invalid interactions format (error) | |
| 44 | Invalid closed date format (error) | |
| 45 | Non-existent commenter | |
| 46 | Non-existent reviewed-by | |
| 47 | Merged-at date filter | |
| 48 | Comments count filter | |
| 49 | Reactions count filter | |
| 50 | Review-requested filter | |
| 51 | Assignee filter | |
| 52 | Label as array (multiple) | |
| 53 | PartialContent with additions filter | |
| 54 | PartialContent with deletions filter | |
| 55 | PartialContent for non-existent file | |
| 56 | Limit minimum (1) | |
| 57 | Limit maximum (10) | |
| 58 | Page maximum (10) | |
| 59 | prNumber overrides all filters | |
| 60 | CharLength minimum (1) | |
| 61 | CharLength maximum (50000) | |
| 62 | Comments range format | |
| 63 | Reactions range format | |
| 64 | Bulk queries (3 max) | |
| 65 | Bulk with mixed valid/invalid | |
