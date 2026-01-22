# Octocode Tools Test Plan - Public Repositories

> Comprehensive test plan for all 10 Octocode MCP tools on public repositories.
> Each test includes schema validation, normal usage, edge cases, and failure scenarios.

---

## Table of Contents

1. [GitHub Tools](#1-github-tools)
   - [1.1 githubSearchCode](#11-githubsearchcode)
   - [1.2 githubSearchRepositories](#12-githubsearchrepositories)
   - [1.3 githubSearchPullRequests](#13-githubsearchpullrequests)
   - [1.4 githubGetFileContent](#14-githubgetfilecontent)
   - [1.5 githubViewRepoStructure](#15-githubviewrepostructure)
2. [Package Tools](#2-package-tools)
   - [2.1 packageSearch](#21-packagesearch)
3. [Local Tools](#3-local-tools)
   - [3.1 localSearchCode](#31-localsearchcode)
   - [3.2 localViewStructure](#32-localviewstructure)
   - [3.3 localFindFiles](#33-localfindfiles)
   - [3.4 localGetFileContent](#34-localgetfilecontent)
4. [LSP Tools](#4-lsp-tools)
   - [4.1 lspGotoDefinition](#41-lspgotodefinition)
   - [4.2 lspFindReferences](#42-lspfindreferences)
   - [4.3 lspCallHierarchy](#43-lspcallhierarchy)

---

## Test Repository Targets

| Repository | Owner | Purpose |
|------------|-------|---------|
| react | facebook | Large, well-maintained JS/TS codebase |
| next.js | vercel | TypeScript codebase with monorepo structure |
| express | expressjs | Small-medium Node.js library |
| lodash | lodash | Utility library with many functions |
| requests | psf | Python library (for packageSearch) |
| rust | rust-lang | Large Rust codebase (for LSP testing) |

---

## 1. GitHub Tools

### 1.1 githubSearchCode

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `keywordsToSearch` | string[] | ✅ Yes | min: 1, max: 5 items | - |
| `owner` | string | No | - | - |
| `repo` | string | No | - | - |
| `extension` | string | No | File extension filter | - |
| `filename` | string | No | Filename filter | - |
| `path` | string | No | Path prefix filter | - |
| `match` | enum | No | `file` \| `path` | - |
| `limit` | number | No | 1-100 | 10 |
| `page` | number | No | 1-10 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSC-N01 | Search single keyword | `keywordsToSearch=["useState"]` | Returns code files containing "useState" |
| GSC-N02 | Search with owner/repo | `owner="facebook", repo="react", keywordsToSearch=["createElement"]` | Returns results only from facebook/react |
| GSC-N03 | Search with extension filter | `keywordsToSearch=["export"], extension="ts"` | Returns only .ts files |
| GSC-N04 | Search with filename filter | `keywordsToSearch=["config"], filename="package.json"` | Returns package.json files with "config" |
| GSC-N05 | Search with path filter | `owner="vercel", repo="next.js", keywordsToSearch=["render"], path="packages"` | Returns results from packages/ directory only |
| GSC-N06 | Match by path | `keywordsToSearch=["utils"], match="path"` | Returns files with "utils" in path |
| GSC-N07 | Match by file content | `keywordsToSearch=["async function"], match="file"` | Returns files containing "async function" |
| GSC-N08 | Multiple keywords | `keywordsToSearch=["useState", "useEffect", "React"]` | Returns files containing all keywords |
| GSC-N09 | Pagination page 1 | `keywordsToSearch=["function"], limit=5, page=1` | Returns first 5 results |
| GSC-N10 | Pagination page 2 | `keywordsToSearch=["function"], limit=5, page=2` | Returns next 5 results |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSC-E01 | Maximum keywords (5) | `keywordsToSearch=["a","b","c","d","e"]` | Accepts and searches with all 5 keywords |
| GSC-E02 | Single character keyword | `keywordsToSearch=["x"]` | Returns matches for single character |
| GSC-E03 | Special characters | `keywordsToSearch=["$scope"]` | Handles $ character correctly |
| GSC-E04 | Max limit (100) | `keywordsToSearch=["test"], limit=100` | Returns up to 100 results |
| GSC-E05 | Max page (10) | `keywordsToSearch=["test"], page=10` | Returns page 10 results |
| GSC-E06 | Unicode keywords | `keywordsToSearch=["日本語"]` | Handles unicode search |
| GSC-E07 | Regex-like pattern | `keywordsToSearch=[".*"]` | Treats as literal string |
| GSC-E08 | Empty extension | `keywordsToSearch=["test"], extension=""` | Returns error or ignores empty |
| GSC-E09 | Deep path | `keywordsToSearch=["test"], path="src/components/ui/buttons"` | Searches in nested path |
| GSC-E10 | Combined filters | `keywordsToSearch=["export"], extension="ts", path="src"` | Applies both filters |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GSC-F01 | Empty keywords array | `keywordsToSearch=[]` | Validation error: min 1 keyword required |
| GSC-F02 | Too many keywords (6+) | `keywordsToSearch=["a","b","c","d","e","f"]` | Validation error: max 5 keywords |
| GSC-F03 | Missing required field | `owner="facebook"` (no keywordsToSearch) | Validation error: keywordsToSearch required |
| GSC-F04 | Invalid limit (0) | `keywordsToSearch=["test"], limit=0` | Validation error: min 1 |
| GSC-F05 | Invalid limit (101) | `keywordsToSearch=["test"], limit=101` | Validation error: max 100 |
| GSC-F06 | Invalid page (0) | `keywordsToSearch=["test"], page=0` | Validation error: min 1 |
| GSC-F07 | Invalid page (11) | `keywordsToSearch=["test"], page=11` | Validation error: max 10 |
| GSC-F08 | Invalid match value | `keywordsToSearch=["test"], match="invalid"` | Validation error: enum mismatch |
| GSC-F09 | Non-existent repo | `owner="facebook", repo="nonexistent123xyz", keywordsToSearch=["test"]` | Empty results or 404 |
| GSC-F10 | Rate limit exceeded | Multiple rapid requests | Rate limit error with reset time |

---

### 1.2 githubSearchRepositories

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `keywordsToSearch` | string[] | Conditional | At least one of keywords/topics | - |
| `topicsToSearch` | string[] | Conditional | At least one of keywords/topics | - |
| `owner` | string | No | - | - |
| `stars` | string | No | e.g., ">1000", "100..500" | - |
| `size` | string | No | Size in KB | - |
| `created` | string | No | Date range | - |
| `updated` | string | No | Date range | - |
| `match` | enum[] | No | `name` \| `description` \| `readme` | - |
| `sort` | enum | No | `forks` \| `stars` \| `updated` \| `best-match` | - |
| `limit` | number | No | 1-100 | 10 |
| `page` | number | No | 1-10 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSR-N01 | Search by keywords | `keywordsToSearch=["react hooks"]` | Returns repos about react hooks |
| GSR-N02 | Search by topics | `topicsToSearch=["typescript", "cli"]` | Returns repos with typescript+cli topics |
| GSR-N03 | Search with owner | `owner="facebook", keywordsToSearch=["react"]` | Returns only facebook's react repos |
| GSR-N04 | Filter by stars | `keywordsToSearch=["framework"], stars=">1000"` | Returns repos with 1000+ stars |
| GSR-N05 | Filter by star range | `keywordsToSearch=["framework"], stars="100..500"` | Returns repos with 100-500 stars |
| GSR-N06 | Sort by stars | `keywordsToSearch=["javascript"], sort="stars"` | Returns sorted by star count |
| GSR-N07 | Sort by updated | `keywordsToSearch=["javascript"], sort="updated"` | Returns sorted by update date |
| GSR-N08 | Match in name only | `keywordsToSearch=["express"], match=["name"]` | Returns repos with "express" in name |
| GSR-N09 | Match in readme | `keywordsToSearch=["tutorial"], match=["readme"]` | Returns repos with "tutorial" in readme |
| GSR-N10 | Filter by created date | `keywordsToSearch=["react"], created=">2023-01-01"` | Returns repos created after 2023 |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSR-E01 | Both keywords and topics | `keywordsToSearch=["web"], topicsToSearch=["react"]` | Combines both filters |
| GSR-E02 | Zero stars filter | `keywordsToSearch=["test"], stars="0"` | Returns repos with 0 stars |
| GSR-E03 | Very high stars | `keywordsToSearch=["framework"], stars=">100000"` | Returns very popular repos |
| GSR-E04 | Size filter | `keywordsToSearch=["small"], size="<1000"` | Returns repos under 1MB |
| GSR-E05 | Multiple match targets | `keywordsToSearch=["api"], match=["name","description","readme"]` | Searches all fields |
| GSR-E06 | Exact date | `keywordsToSearch=["test"], created="2023-06-15"` | Filters by exact date |
| GSR-E07 | Updated recently | `keywordsToSearch=["active"], updated=">2024-01-01"` | Returns recently updated repos |
| GSR-E08 | Pagination max | `keywordsToSearch=["test"], limit=100, page=10` | Returns last page of max results |
| GSR-E09 | Special characters in search | `keywordsToSearch=["c++"]` | Handles special characters |
| GSR-E10 | Long keyword | `keywordsToSearch=["verylongkeywordthatnoonewouldsearch"]` | Returns empty or minimal results |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GSR-F01 | No keywords or topics | `owner="facebook"` | Validation error: at least one required |
| GSR-F02 | Empty keywords array | `keywordsToSearch=[]` | Validation error: at least one required |
| GSR-F03 | Invalid sort value | `keywordsToSearch=["test"], sort="invalid"` | Validation error: enum mismatch |
| GSR-F04 | Invalid match value | `keywordsToSearch=["test"], match=["invalid"]` | Validation error: enum mismatch |
| GSR-F05 | Invalid stars format | `keywordsToSearch=["test"], stars="invalid"` | API error or validation error |
| GSR-F06 | Invalid date format | `keywordsToSearch=["test"], created="invalid-date"` | API error or validation error |
| GSR-F07 | Limit out of range | `keywordsToSearch=["test"], limit=200` | Validation error: max 100 |
| GSR-F08 | Page out of range | `keywordsToSearch=["test"], page=15` | Validation error: max 10 |
| GSR-F09 | Non-existent owner | `owner="nonexistent123xyz", keywordsToSearch=["test"]` | Empty results |
| GSR-F10 | Rate limit exceeded | Multiple rapid requests | Rate limit error with reset time |

---

### 1.3 githubSearchPullRequests

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `prNumber` | number | No | Positive integer (ignores other filters) | - |
| `owner` | string | No | - | - |
| `repo` | string | No | - | - |
| `query` | string | No | Free-text search | - |
| `state` | enum | No | `open` \| `closed` | - |
| `author` | string | No | - | - |
| `assignee` | string | No | - | - |
| `commenter` | string | No | User who commented | - |
| `involves` | string | No | User involved in any way | - |
| `mentions` | string | No | User mentioned in PR | - |
| `review-requested` | string | No | User whose review is requested | - |
| `reviewed-by` | string | No | User who reviewed | - |
| `label` | string/string[] | No | - | - |
| `no-label` | boolean | No | PRs without labels | - |
| `no-milestone` | boolean | No | PRs without milestone | - |
| `no-project` | boolean | No | PRs without project | - |
| `no-assignee` | boolean | No | PRs without assignee | - |
| `head` | string | No | Source branch | - |
| `base` | string | No | Target branch | - |
| `created` | string | No | Date filter | - |
| `updated` | string | No | Date filter | - |
| `closed` | string | No | Closed date filter | - |
| `merged-at` | string | No | Merged date filter | - |
| `comments` | number/string | No | Comment count filter (e.g., ">10", "5..20") | - |
| `reactions` | number/string | No | Reaction count filter | - |
| `interactions` | number/string | No | Interaction count filter | - |
| `merged` | boolean | No | - | - |
| `draft` | boolean | No | - | - |
| `match` | enum[] | No | `title` \| `body` \| `comments` | - |
| `sort` | enum | No | `created` \| `updated` \| `best-match` | - |
| `order` | enum | No | `asc` \| `desc` | desc |
| `limit` | number | No | 1-10 | 5 |
| `page` | number | No | 1-10 | 1 |
| `type` | enum | No | `metadata` \| `fullContent` \| `partialContent` | metadata |
| `withComments` | boolean | No | - | false |
| `withCommits` | boolean | No | - | false |
| `partialContentMetadata` | object[] | No | Files to fetch diff for | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSP-N01 | Get PR by number | `owner="facebook", repo="react", prNumber=28000` | Returns specific PR metadata |
| GSP-N02 | Search merged PRs | `owner="facebook", repo="react", state="closed", merged=true` | Returns merged PRs |
| GSP-N03 | Search open PRs | `owner="vercel", repo="next.js", state="open"` | Returns open PRs |
| GSP-N04 | Search by author | `owner="facebook", repo="react", author="gaearon"` | Returns PRs by author |
| GSP-N05 | Search with query | `owner="vercel", repo="next.js", query="fix"` | Returns PRs matching query |
| GSP-N06 | Filter by label | `owner="facebook", repo="react", label="bug"` | Returns PRs with "bug" label |
| GSP-N07 | Filter by base branch | `owner="vercel", repo="next.js", base="main"` | Returns PRs targeting main |
| GSP-N08 | Sort by updated | `owner="facebook", repo="react", sort="updated", order="desc"` | Returns recently updated PRs |
| GSP-N09 | PR with comments | `owner="facebook", repo="react", prNumber=28000, withComments=true` | Returns PR with comments |
| GSP-N10 | PR with commits | `owner="facebook", repo="react", prNumber=28000, withCommits=true` | Returns PR with commit list |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSP-E01 | Multiple labels | `owner="facebook", repo="react", label=["bug", "help wanted"]` | Returns PRs with any label |
| GSP-E02 | Draft PRs only | `owner="vercel", repo="next.js", draft=true` | Returns only draft PRs |
| GSP-E03 | Created date range | `owner="facebook", repo="react", created=">2024-01-01"` | Returns PRs from 2024+ |
| GSP-E04 | Partial content | `prNumber=28000, type="partialContent", partialContentMetadata=[{"file":"src/index.ts"}]` | Returns specific file diff |
| GSP-E05 | Full content | `prNumber=28000, type="fullContent"` | Returns complete PR diff |
| GSP-E06 | No assignee filter | `owner="facebook", repo="react", no-assignee=true` | Returns PRs without assignee |
| GSP-E07 | Review requested | `owner="facebook", repo="react", review-requested="octocat"` | Returns PRs awaiting review |
| GSP-E08 | Comments count filter | `owner="facebook", repo="react", comments=">10"` | Returns PRs with 10+ comments |
| GSP-E09 | Reactions count filter | `owner="facebook", repo="react", reactions=">5"` | Returns PRs with 5+ reactions |
| GSP-E10 | Merged date filter | `owner="facebook", repo="react", merged-at=">2024-01-01"` | Returns PRs merged after date |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GSP-F01 | Invalid prNumber (0) | `prNumber=0` | Validation error: must be positive |
| GSP-F02 | Invalid prNumber (negative) | `prNumber=-1` | Validation error: must be positive |
| GSP-F03 | Invalid state | `state="invalid"` | Validation error: enum mismatch |
| GSP-F04 | Invalid type | `type="invalid"` | Validation error: enum mismatch |
| GSP-F05 | Invalid sort | `sort="invalid"` | Validation error: enum mismatch |
| GSP-F06 | Invalid order | `order="invalid"` | Validation error: enum mismatch |
| GSP-F07 | Limit out of range | `limit=15` | Validation error: max 10 |
| GSP-F08 | Non-existent PR | `owner="facebook", repo="react", prNumber=999999999` | 404 or empty result |
| GSP-F09 | Non-existent repo | `owner="facebook", repo="nonexistent", prNumber=1` | 404 error |
| GSP-F10 | Invalid comments format | `comments="invalid"` | Validation error |

---

### 1.4 githubGetFileContent

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | ✅ Yes | 1-200 chars | - |
| `repo` | string | ✅ Yes | 1-150 chars | - |
| `path` | string | ✅ Yes | File path | - |
| `branch` | string | No | 1-255 chars | (default branch) |
| `fullContent` | boolean | No | - | false |
| `startLine` | number | No | min: 1 | - |
| `endLine` | number | No | min: 1 | - |
| `matchString` | string | No | - | - |
| `matchStringContextLines` | number | No | 1-50 | 5 |
| `charOffset` | number | No | min: 0 | - |
| `charLength` | number | No | 50-50000 | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GFC-N01 | Read full file | `owner="facebook", repo="react", path="README.md", fullContent=true` | Returns complete file content |
| GFC-N02 | Read with branch | `owner="facebook", repo="react", path="package.json", branch="main", fullContent=true` | Returns file from main branch |
| GFC-N03 | Read line range | `owner="facebook", repo="react", path="packages/react/index.js", startLine=1, endLine=50` | Returns lines 1-50 |
| GFC-N04 | Match string | `owner="vercel", repo="next.js", path="packages/next/src/server/render.tsx", matchString="export function"` | Returns matching section with context |
| GFC-N05 | Match with context | `owner="facebook", repo="react", path="packages/react/index.js", matchString="createElement", matchStringContextLines=20` | Returns match with 20 lines context |
| GFC-N06 | Read package.json | `owner="expressjs", repo="express", path="package.json", fullContent=true` | Returns package.json content |
| GFC-N07 | Read nested file | `owner="vercel", repo="next.js", path="packages/next/src/shared/lib/router/router.ts", startLine=1, endLine=100` | Returns nested file content |
| GFC-N08 | Character pagination | `owner="facebook", repo="react", path="packages/react/index.js", charOffset=0, charLength=1000` | Returns first 1000 characters |
| GFC-N09 | Character offset | `owner="facebook", repo="react", path="packages/react/index.js", charOffset=500, charLength=500` | Returns characters 500-1000 |
| GFC-N10 | TypeScript file | `owner="vercel", repo="next.js", path="packages/next/src/server/app-render/app-render.tsx", matchString="async function"` | Returns TypeScript content |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GFC-E01 | Single line | `owner="facebook", repo="react", path="packages/react/index.js", startLine=1, endLine=1` | Returns single line |
| GFC-E02 | Min context lines | `owner="facebook", repo="react", path="packages/react/index.js", matchString="React", matchStringContextLines=1` | Returns match with 1 line context |
| GFC-E03 | Max context lines | `owner="facebook", repo="react", path="packages/react/index.js", matchString="React", matchStringContextLines=50` | Returns match with 50 lines context |
| GFC-E04 | Feature branch | `owner="vercel", repo="next.js", path="package.json", branch="canary", fullContent=true` | Returns file from canary branch |
| GFC-E05 | Root file | `owner="facebook", repo="react", path="package.json", fullContent=true` | Returns root package.json |
| GFC-E06 | Dotfile | `owner="facebook", repo="react", path=".gitignore", fullContent=true` | Returns .gitignore content |
| GFC-E07 | Min char length | `owner="facebook", repo="react", path="README.md", charOffset=0, charLength=50` | Returns minimum chars |
| GFC-E08 | Max char length | `owner="facebook", repo="react", path="README.md", charOffset=0, charLength=50000` | Returns max chars |
| GFC-E09 | Multiple matches | `owner="facebook", repo="react", path="packages/react/index.js", matchString="export"` | Returns first match with context |
| GFC-E10 | Markdown file | `owner="facebook", repo="react", path="CHANGELOG.md", startLine=1, endLine=100` | Returns markdown content |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GFC-F01 | Missing owner | `repo="react", path="README.md"` | Validation error: owner required |
| GFC-F02 | Missing repo | `owner="facebook", path="README.md"` | Validation error: repo required |
| GFC-F03 | Missing path | `owner="facebook", repo="react"` | Validation error: path required |
| GFC-F04 | Invalid startLine (0) | `owner="facebook", repo="react", path="README.md", startLine=0, endLine=10` | Validation error: min 1 |
| GFC-F05 | startLine > endLine | `owner="facebook", repo="react", path="README.md", startLine=100, endLine=50` | Validation error: startLine must be <= endLine |
| GFC-F06 | startLine without endLine | `owner="facebook", repo="react", path="README.md", startLine=1` | Validation error: must use together |
| GFC-F07 | fullContent with range | `owner="facebook", repo="react", path="README.md", fullContent=true, startLine=1, endLine=10` | Validation error: mutually exclusive |
| GFC-F08 | Non-existent file | `owner="facebook", repo="react", path="nonexistent.txt", fullContent=true` | 404 error |
| GFC-F09 | Non-existent branch | `owner="facebook", repo="react", path="README.md", branch="nonexistent", fullContent=true` | 404 error |
| GFC-F10 | File too large | `owner="chromium", repo="chromium", path="<large-file-path>", fullContent=true` | FILE_TOO_LARGE error |

---

### 1.5 githubViewRepoStructure

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `owner` | string | ✅ Yes | 1-200 chars | - |
| `repo` | string | ✅ Yes | 1-150 chars | - |
| `branch` | string | ✅ Yes | 1-255 chars | - |
| `path` | string | No | - | "" |
| `depth` | number | No | 1-2 | 1 |
| `entriesPerPage` | number | No | 1-200 | 50 |
| `entryPageNumber` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GVR-N01 | Root structure | `owner="facebook", repo="react", branch="main", path=""` | Returns root directory listing |
| GVR-N02 | With depth 2 | `owner="facebook", repo="react", branch="main", path="", depth=2` | Returns nested structure |
| GVR-N03 | Specific path | `owner="facebook", repo="react", branch="main", path="packages"` | Returns packages directory |
| GVR-N04 | Nested path | `owner="vercel", repo="next.js", branch="canary", path="packages/next/src"` | Returns src directory |
| GVR-N05 | Feature branch | `owner="vercel", repo="next.js", branch="canary", path=""` | Returns structure from canary |
| GVR-N06 | Pagination | `owner="facebook", repo="react", branch="main", path="", entriesPerPage=10` | Returns 10 entries |
| GVR-N07 | Page 2 | `owner="facebook", repo="react", branch="main", path="", entriesPerPage=10, entryPageNumber=2` | Returns second page |
| GVR-N08 | Monorepo packages | `owner="vercel", repo="next.js", branch="canary", path="packages"` | Returns all packages |
| GVR-N09 | Deep directory | `owner="vercel", repo="next.js", branch="canary", path="packages/next/src/server"` | Returns server directory |
| GVR-N10 | Large repo root | `owner="microsoft", repo="vscode", branch="main", path=""` | Returns root with pagination |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GVR-E01 | Min depth (1) | `owner="facebook", repo="react", branch="main", path="", depth=1` | Returns flat listing |
| GVR-E02 | Max depth (2) | `owner="facebook", repo="react", branch="main", path="packages", depth=2` | Returns 2-level deep |
| GVR-E03 | Min entries | `owner="facebook", repo="react", branch="main", path="", entriesPerPage=1` | Returns single entry |
| GVR-E04 | Max entries | `owner="facebook", repo="react", branch="main", path="", entriesPerPage=200` | Returns up to 200 entries |
| GVR-E05 | Empty directory | `owner="<repo-with-empty-dir>", repo="...", branch="main", path="empty-dir"` | Returns empty structure |
| GVR-E06 | Single file directory | `owner="facebook", repo="react", branch="main", path="fixtures"` | Returns directory content |
| GVR-E07 | Path with dots | `owner="facebook", repo="react", branch="main", path="packages/react/.."` | Handles path correctly |
| GVR-E08 | Unicode path | `owner="<repo-with-unicode>", repo="...", branch="main", path="日本語"` | Handles unicode paths |
| GVR-E09 | Hidden files | `owner="facebook", repo="react", branch="main", path=""` | Shows/hides dotfiles appropriately |
| GVR-E10 | Tag as branch | `owner="facebook", repo="react", branch="v18.2.0", path=""` | Returns structure at tag |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GVR-F01 | Missing owner | `repo="react", branch="main"` | Validation error: owner required |
| GVR-F02 | Missing repo | `owner="facebook", branch="main"` | Validation error: repo required |
| GVR-F03 | Missing branch | `owner="facebook", repo="react"` | Validation error: branch required |
| GVR-F04 | Invalid depth (0) | `owner="facebook", repo="react", branch="main", depth=0` | Validation error: min 1 |
| GVR-F05 | Invalid depth (3) | `owner="facebook", repo="react", branch="main", depth=3` | Validation error: max 2 |
| GVR-F06 | Invalid entriesPerPage | `owner="facebook", repo="react", branch="main", entriesPerPage=250` | Validation error: max 200 |
| GVR-F07 | Non-existent path | `owner="facebook", repo="react", branch="main", path="nonexistent/path"` | 404 or empty |
| GVR-F08 | Non-existent branch | `owner="facebook", repo="react", branch="nonexistent"` | 404 error |
| GVR-F09 | Non-existent repo | `owner="facebook", repo="nonexistent", branch="main"` | 404 error |
| GVR-F10 | File path (not dir) | `owner="facebook", repo="react", branch="main", path="README.md"` | Error or empty |

---

## 2. Package Tools

### 2.1 packageSearch

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `name` | string | ✅ Yes | min: 1 char | - |
| `ecosystem` | enum | ✅ Yes | `npm` \| `python` | - |
| `searchLimit` | number | No | 1-10 | 1 |
| `npmFetchMetadata` | boolean | No | NPM only | false |
| `pythonFetchMetadata` | boolean | No | Python only | false |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| PS-N01 | NPM package lookup | `ecosystem="npm", name="express"` | Returns express package with repo URL |
| PS-N02 | Python package lookup | `ecosystem="python", name="requests"` | Returns requests package with repo URL |
| PS-N03 | NPM with metadata | `ecosystem="npm", name="lodash", npmFetchMetadata=true` | Returns lodash with full metadata |
| PS-N04 | Python with metadata | `ecosystem="python", name="flask", pythonFetchMetadata=true` | Returns flask with full metadata |
| PS-N05 | Search alternatives | `ecosystem="npm", name="lodash", searchLimit=5` | Returns lodash and similar packages |
| PS-N06 | Scoped NPM package | `ecosystem="npm", name="@types/node"` | Returns @types/node package |
| PS-N07 | Popular package | `ecosystem="npm", name="react"` | Returns react package info |
| PS-N08 | NPM CLI tool | `ecosystem="npm", name="typescript"` | Returns typescript package |
| PS-N09 | Python data package | `ecosystem="python", name="pandas"` | Returns pandas package |
| PS-N10 | Python web framework | `ecosystem="python", name="django"` | Returns django package |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| PS-E01 | Single char name | `ecosystem="npm", name="d"` | Returns 'd' package or similar |
| PS-E02 | Max searchLimit | `ecosystem="npm", name="react", searchLimit=10` | Returns up to 10 alternatives |
| PS-E03 | Min searchLimit | `ecosystem="npm", name="express", searchLimit=1` | Returns only express |
| PS-E04 | Package with dashes | `ecosystem="npm", name="date-fns"` | Returns date-fns package |
| PS-E05 | Package with underscores | `ecosystem="python", name="scikit_learn"` | Returns scikit-learn package |
| PS-E06 | Deprecated package | `ecosystem="npm", name="request"` | Returns with DEPRECATED warning |
| PS-E07 | Very long name | `ecosystem="npm", name="some-very-long-package-name-that-exists"` | Returns if exists or empty |
| PS-E08 | Numeric name | `ecosystem="npm", name="123"` | Returns package or empty |
| PS-E09 | Mixed case | `ecosystem="npm", name="Express"` | Handles case insensitivity |
| PS-E10 | Special chars in name | `ecosystem="npm", name="@babel/core"` | Returns babel core package |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| PS-F01 | Missing name | `ecosystem="npm"` | Validation error: name required |
| PS-F02 | Missing ecosystem | `name="express"` | Validation error: ecosystem required |
| PS-F03 | Invalid ecosystem | `ecosystem="invalid", name="express"` | Validation error: must be npm or python |
| PS-F04 | Empty name | `ecosystem="npm", name=""` | Validation error: min 1 char |
| PS-F05 | Invalid searchLimit (0) | `ecosystem="npm", name="express", searchLimit=0` | Validation error: min 1 |
| PS-F06 | Invalid searchLimit (11) | `ecosystem="npm", name="express", searchLimit=11` | Validation error: max 10 |
| PS-F07 | Non-existent package | `ecosystem="npm", name="thispackagedoesnotexist123xyz"` | Empty or not found |
| PS-F08 | NPM metadata on python | `ecosystem="python", name="requests", npmFetchMetadata=true` | Ignored or error |
| PS-F09 | Python metadata on npm | `ecosystem="npm", name="express", pythonFetchMetadata=true` | Ignored or error |
| PS-F10 | Rate limit exceeded | Multiple rapid requests | Rate limit error |

---

## 3. Local Tools

> **Note:** Local tools test on the octocode-mcp repository itself.

### 3.1 localSearchCode

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `pattern` | string | ✅ Yes | min: 1 char | - |
| `path` | string | ✅ Yes | Directory path | - |
| `mode` | enum | No | `discovery` \| `paginated` \| `detailed` | - |
| `fixedString` | boolean | No | - | - |
| `smartCase` | boolean | No | - | true |
| `caseInsensitive` | boolean | No | - | - |
| `caseSensitive` | boolean | No | - | - |
| `wholeWord` | boolean | No | - | - |
| `type` | string | No | File type (ts, js, py, etc.) | - |
| `include` | string[] | No | Glob patterns | - |
| `exclude` | string[] | No | Glob patterns | - |
| `excludeDir` | string[] | No | Directory names | - |
| `filesOnly` | boolean | No | - | - |
| `count` | boolean | No | - | - |
| `contextLines` | number | No | 0-50 | - |
| `filesPerPage` | number | No | 1-20 | 10 |
| `filePageNumber` | number | No | min: 1 | 1 |
| `matchesPerPage` | number | No | 1-100 | 10 |
| `multiline` | boolean | No | Memory intensive | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LSC-N01 | Simple search | `pattern="function", path="/workspace"` | Returns files with "function" |
| LSC-N02 | Discovery mode | `pattern="export", path="/workspace", mode="discovery"` | Returns files only (fast) |
| LSC-N03 | Detailed mode | `pattern="async", path="/workspace", mode="detailed"` | Returns matches with context |
| LSC-N04 | Type filter | `pattern="interface", path="/workspace", type="ts"` | Returns only .ts files |
| LSC-N05 | Files only | `pattern="TODO", path="/workspace", filesOnly=true` | Returns file paths only |
| LSC-N06 | With context | `pattern="class", path="/workspace", contextLines=3` | Returns matches with 3 lines context |
| LSC-N07 | Case insensitive | `pattern="test", path="/workspace", caseInsensitive=true` | Matches TEST, Test, test |
| LSC-N08 | Whole word | `pattern="test", path="/workspace", wholeWord=true` | Matches "test" not "testing" |
| LSC-N09 | Exclude directory | `pattern="import", path="/workspace", excludeDir=["node_modules"]` | Excludes node_modules |
| LSC-N10 | Include glob | `pattern="export", path="/workspace", include=["*.ts"]` | Searches only .ts files |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LSC-E01 | Regex pattern | `pattern="export\\s+default", path="/workspace"` | Matches regex pattern |
| LSC-E02 | Fixed string | `pattern=".*", path="/workspace", fixedString=true` | Matches literal ".*" |
| LSC-E03 | Multiline | `pattern="class.*\\{", path="/workspace", multiline=true` | Matches across lines |
| LSC-E04 | Max context | `pattern="function", path="/workspace", contextLines=50` | Returns 50 lines context |
| LSC-E05 | Max matches per file | `pattern="const", path="/workspace", maxMatchesPerFile=100` | Limits per-file matches |
| LSC-E06 | Pagination | `pattern="export", path="/workspace", filesPerPage=5, filePageNumber=2` | Returns page 2 |
| LSC-E07 | Count only | `pattern="import", path="/workspace", count=true` | Returns match counts |
| LSC-E08 | Hidden files | `pattern="config", path="/workspace", hidden=true` | Includes hidden files |
| LSC-E09 | Follow symlinks | `pattern="test", path="/workspace", followSymlinks=true` | Follows symbolic links |
| LSC-E10 | Sort by modified | `pattern="export", path="/workspace", sort="modified"` | Sorts by modification time |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LSC-F01 | Missing pattern | `path="/workspace"` | Validation error: pattern required |
| LSC-F02 | Missing path | `pattern="test"` | Validation error: path required |
| LSC-F03 | Empty pattern | `pattern="", path="/workspace"` | Validation error: min 1 char |
| LSC-F04 | Invalid mode | `pattern="test", path="/workspace", mode="invalid"` | Validation error: enum mismatch |
| LSC-F05 | Invalid context | `pattern="test", path="/workspace", contextLines=-1` | Validation error: min 0 |
| LSC-F06 | Context too large | `pattern="test", path="/workspace", contextLines=100` | Validation error: max 50 |
| LSC-F07 | Invalid filesPerPage | `pattern="test", path="/workspace", filesPerPage=25` | Validation error: max 20 |
| LSC-F08 | Non-existent path | `pattern="test", path="/nonexistent"` | Path not found error |
| LSC-F09 | Invalid regex | `pattern="[invalid", path="/workspace"` | Regex parse error |
| LSC-F10 | Conflicting options | `pattern="test", path="/workspace", fixedString=true, perlRegex=true` | Mutual exclusivity error |

---

### 3.2 localViewStructure

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | Directory path | - |
| `depth` | number | No | 1-5 | - |
| `sortBy` | enum | No | `name` \| `size` \| `time` \| `extension` | time |
| `filesOnly` | boolean | No | - | - |
| `directoriesOnly` | boolean | No | - | - |
| `hidden` | boolean | No | - | false |
| `pattern` | string | No | Name filter | - |
| `extension` | string | No | - | - |
| `extensions` | string[] | No | - | - |
| `entriesPerPage` | number | No | 1-20 | 20 |
| `entryPageNumber` | number | No | min: 1 | 1 |
| `summary` | boolean | No | - | true |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LVS-N01 | Root listing | `path="/workspace"` | Returns workspace contents |
| LVS-N02 | With depth | `path="/workspace", depth=2` | Returns 2-level structure |
| LVS-N03 | Sort by name | `path="/workspace", sortBy="name"` | Alphabetically sorted |
| LVS-N04 | Sort by size | `path="/workspace", sortBy="size"` | Sorted by file size |
| LVS-N05 | Files only | `path="/workspace", filesOnly=true` | Returns only files |
| LVS-N06 | Directories only | `path="/workspace", directoriesOnly=true` | Returns only directories |
| LVS-N07 | Filter by extension | `path="/workspace", extension="ts"` | Returns only .ts files |
| LVS-N08 | Filter by pattern | `path="/workspace", pattern="test"` | Returns items matching "test" |
| LVS-N09 | Pagination | `path="/workspace", entriesPerPage=10, entryPageNumber=1` | Returns first 10 entries |
| LVS-N10 | With summary | `path="/workspace", summary=true` | Includes directory summary |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LVS-E01 | Max depth (5) | `path="/workspace", depth=5` | Returns 5 levels deep |
| LVS-E02 | Hidden files | `path="/workspace", hidden=true` | Shows .hidden files |
| LVS-E03 | Multiple extensions | `path="/workspace", extensions=["ts", "tsx", "js"]` | Filters multiple extensions |
| LVS-E04 | Empty directory | `path="/workspace/empty"` | Returns empty structure |
| LVS-E05 | Single file | `path="/workspace", filesOnly=true, limit=1` | Returns one file |
| LVS-E06 | Reverse sort | `path="/workspace", sortBy="time", reverse=true` | Oldest first |
| LVS-E07 | Min pagination | `path="/workspace", entriesPerPage=1` | Returns single entry |
| LVS-E08 | No summary | `path="/workspace", summary=false` | Excludes summary |
| LVS-E09 | Sort by extension | `path="/workspace", sortBy="extension"` | Grouped by extension |
| LVS-E10 | Nested path | `path="/workspace/packages/octocode-mcp/src"` | Returns nested content |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LVS-F01 | Missing path | `sortBy="name"` | Validation error: path required |
| LVS-F02 | Invalid depth (0) | `path="/workspace", depth=0` | Validation error: min 1 |
| LVS-F03 | Invalid depth (6) | `path="/workspace", depth=6` | Validation error: max 5 |
| LVS-F04 | Invalid sortBy | `path="/workspace", sortBy="invalid"` | Validation error: enum mismatch |
| LVS-F05 | Invalid entriesPerPage | `path="/workspace", entriesPerPage=30` | Validation error: max 20 |
| LVS-F06 | Non-existent path | `path="/nonexistent"` | Path not found error |
| LVS-F07 | File as path | `path="/workspace/package.json"` | Not a directory error |
| LVS-F08 | Conflicting filters | `path="/workspace", filesOnly=true, directoriesOnly=true` | Conflicting options error |
| LVS-F09 | Invalid page number | `path="/workspace", entryPageNumber=0` | Validation error: min 1 |
| LVS-F10 | Permission denied | `path="/restricted"` | Permission error |

---

### 3.3 localFindFiles

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | Starting directory | - |
| `name` | string | No | Glob pattern | - |
| `iname` | string | No | Case-insensitive glob | - |
| `names` | string[] | No | Multiple patterns | - |
| `regex` | string | No | Regex pattern | - |
| `regexType` | enum | No | `posix-egrep` \| `posix-extended` \| `posix-basic` | - |
| `type` | enum | No | `f` \| `d` \| `l` \| `b` \| `c` \| `p` \| `s` | - |
| `maxDepth` | number | No | 1-10 | - |
| `minDepth` | number | No | 0-10 | - |
| `modifiedWithin` | string | No | e.g., "7d", "2h" | - |
| `modifiedBefore` | string | No | - | - |
| `sizeGreater` | string | No | e.g., "1M", "100K" | - |
| `sizeLess` | string | No | - | - |
| `empty` | boolean | No | - | - |
| `executable` | boolean | No | - | - |
| `filesPerPage` | number | No | 1-20 | 20 |
| `filePageNumber` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFF-N01 | Find by name | `path="/workspace", name="*.ts"` | Returns .ts files |
| LFF-N02 | Find by iname | `path="/workspace", iname="*.Test.ts"` | Case-insensitive match |
| LFF-N03 | Find directories | `path="/workspace", type="d"` | Returns directories only |
| LFF-N04 | Find files | `path="/workspace", type="f"` | Returns files only |
| LFF-N05 | Max depth | `path="/workspace", maxDepth=2` | Searches 2 levels deep |
| LFF-N06 | Modified recently | `path="/workspace", modifiedWithin="7d"` | Files modified in 7 days |
| LFF-N07 | Size filter | `path="/workspace", sizeGreater="1K"` | Files larger than 1KB |
| LFF-N08 | Multiple names | `path="/workspace", names=["*.ts", "*.tsx"]` | Matches multiple patterns |
| LFF-N09 | Regex search | `path="/workspace", regex="test.*\\.ts$"` | Regex pattern match |
| LFF-N10 | Exclude directories | `path="/workspace", excludeDir=["node_modules", "dist"]` | Excludes specified dirs |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFF-E01 | Empty files | `path="/workspace", empty=true, type="f"` | Returns empty files |
| LFF-E02 | Executable files | `path="/workspace", executable=true` | Returns executable files |
| LFF-E03 | Min depth | `path="/workspace", minDepth=2` | Skips top levels |
| LFF-E04 | Max depth 10 | `path="/workspace", maxDepth=10` | Searches deep |
| LFF-E05 | Modified before | `path="/workspace", modifiedBefore="2024-01-01"` | Files before date |
| LFF-E06 | Size range | `path="/workspace", sizeGreater="100", sizeLess="10K"` | Size between 100B-10KB |
| LFF-E07 | Symlinks | `path="/workspace", type="l"` | Returns symbolic links |
| LFF-E08 | POSIX egrep | `path="/workspace", regex="(test|spec)\\.ts$", regexType="posix-egrep"` | Uses egrep regex |
| LFF-E09 | Pagination | `path="/workspace", filesPerPage=5, filePageNumber=2` | Returns page 2 |
| LFF-E10 | Readable files | `path="/workspace", readable=true` | Returns readable files |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LFF-F01 | Missing path | `name="*.ts"` | Validation error: path required |
| LFF-F02 | Invalid type | `path="/workspace", type="invalid"` | Validation error: enum mismatch |
| LFF-F03 | Invalid maxDepth (0) | `path="/workspace", maxDepth=0` | Validation error: min 1 |
| LFF-F04 | Invalid maxDepth (11) | `path="/workspace", maxDepth=11` | Validation error: max 10 |
| LFF-F05 | Invalid regexType | `path="/workspace", regex="test", regexType="invalid"` | Validation error |
| LFF-F06 | Non-existent path | `path="/nonexistent"` | Path not found error |
| LFF-F07 | Invalid time format | `path="/workspace", modifiedWithin="invalid"` | Time parse error |
| LFF-F08 | Invalid size format | `path="/workspace", sizeGreater="invalid"` | Size parse error |
| LFF-F09 | Invalid regex | `path="/workspace", regex="[invalid"` | Regex parse error |
| LFF-F10 | minDepth > maxDepth | `path="/workspace", minDepth=5, maxDepth=2` | Validation error |

---

### 3.4 localGetFileContent

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | min: 1 char | - |
| `fullContent` | boolean | No | - | false |
| `startLine` | number | No | min: 1 | - |
| `endLine` | number | No | min: 1 | - |
| `matchString` | string | No | - | - |
| `matchStringContextLines` | number | No | 1-50 | 5 |
| `matchStringIsRegex` | boolean | No | - | false |
| `matchStringCaseSensitive` | boolean | No | - | false |
| `charOffset` | number | No | min: 0 | - |
| `charLength` | number | No | 1-10000 | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGC-N01 | Full content | `path="/workspace/package.json", fullContent=true` | Returns entire file |
| LGC-N02 | Line range | `path="/workspace/src/index.ts", startLine=1, endLine=50` | Returns lines 1-50 |
| LGC-N03 | Match string | `path="/workspace/src/index.ts", matchString="export"` | Returns matches with context |
| LGC-N04 | Match with context | `path="/workspace/src/index.ts", matchString="function", matchStringContextLines=10` | Returns 10 lines context |
| LGC-N05 | Regex match | `path="/workspace/src/index.ts", matchString="export.*function", matchStringIsRegex=true` | Regex matching |
| LGC-N06 | Case sensitive | `path="/workspace/src/index.ts", matchString="Export", matchStringCaseSensitive=true` | Exact case match |
| LGC-N07 | Character range | `path="/workspace/README.md", charOffset=0, charLength=500` | Returns first 500 chars |
| LGC-N08 | Character offset | `path="/workspace/README.md", charOffset=100, charLength=200` | Returns chars 100-300 |
| LGC-N09 | Single line | `path="/workspace/src/index.ts", startLine=1, endLine=1` | Returns line 1 |
| LGC-N10 | Nested file | `path="/workspace/packages/octocode-mcp/src/tools/index.ts", fullContent=true` | Returns nested file |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGC-E01 | Min context | `path="/workspace/src/index.ts", matchString="test", matchStringContextLines=1` | 1 line context |
| LGC-E02 | Max context | `path="/workspace/src/index.ts", matchString="test", matchStringContextLines=50` | 50 lines context |
| LGC-E03 | Min charLength | `path="/workspace/README.md", charOffset=0, charLength=1` | 1 character |
| LGC-E04 | Max charLength | `path="/workspace/README.md", charOffset=0, charLength=10000` | 10000 chars |
| LGC-E05 | Dotfile | `path="/workspace/.gitignore", fullContent=true` | Returns dotfile |
| LGC-E06 | Empty file | `path="/workspace/empty.txt", fullContent=true` | Returns empty content |
| LGC-E07 | Large file | `path="/workspace/large-file.txt", startLine=1, endLine=100` | Handles large file |
| LGC-E08 | Binary file | `path="/workspace/image.png", fullContent=true` | Handles binary |
| LGC-E09 | Multiple matches | `path="/workspace/src/index.ts", matchString="const"` | Returns all matches |
| LGC-E10 | Unicode content | `path="/workspace/unicode.txt", fullContent=true` | Handles unicode |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LGC-F01 | Missing path | `fullContent=true` | Validation error: path required |
| LGC-F02 | Empty path | `path=""` | Validation error: min 1 char |
| LGC-F03 | Invalid startLine | `path="/workspace/file.ts", startLine=0, endLine=10` | Validation error: min 1 |
| LGC-F04 | startLine > endLine | `path="/workspace/file.ts", startLine=100, endLine=50` | Validation error |
| LGC-F05 | startLine without endLine | `path="/workspace/file.ts", startLine=1` | Validation error: use together |
| LGC-F06 | fullContent with range | `path="/workspace/file.ts", fullContent=true, startLine=1, endLine=10` | Validation error: exclusive |
| LGC-F07 | matchString with range | `path="/workspace/file.ts", matchString="test", startLine=1, endLine=10` | Validation error: exclusive |
| LGC-F08 | Non-existent file | `path="/workspace/nonexistent.txt", fullContent=true` | File not found error |
| LGC-F09 | Invalid charLength | `path="/workspace/file.ts", charOffset=0, charLength=0` | Validation error: min 1 |
| LGC-F10 | Directory path | `path="/workspace/src", fullContent=true` | Not a file error |

---

## 4. LSP Tools

> **Note:** LSP tools require `lineHint` from `localSearchCode`. Test on TypeScript files.

### 4.1 lspGotoDefinition

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `orderHint` | number | No | min: 0 | 0 |
| `contextLines` | number | No | 0-20 | 5 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGD-N01 | Function definition | `uri="src/index.ts", symbolName="processQuery", lineHint=10` | Returns function definition |
| LGD-N02 | Class definition | `uri="src/tools/tool.ts", symbolName="BaseTool", lineHint=5` | Returns class definition |
| LGD-N03 | Interface definition | `uri="src/types.ts", symbolName="QueryOptions", lineHint=20` | Returns interface definition |
| LGD-N04 | Variable definition | `uri="src/config.ts", symbolName="DEFAULT_TIMEOUT", lineHint=3` | Returns variable definition |
| LGD-N05 | With context | `uri="src/index.ts", symbolName="execute", lineHint=15, contextLines=10` | Returns 10 lines context |
| LGD-N06 | Imported symbol | `uri="src/index.ts", symbolName="z", lineHint=1` | Returns Zod definition |
| LGD-N07 | Type alias | `uri="src/types.ts", symbolName="ExecutionResult", lineHint=50` | Returns type definition |
| LGD-N08 | Method definition | `uri="src/client.ts", symbolName="connect", lineHint=25` | Returns method definition |
| LGD-N09 | Multiple occurrences | `uri="src/index.ts", symbolName="query", lineHint=10, orderHint=1` | Returns second occurrence |
| LGD-N10 | Exported function | `uri="src/utils.ts", symbolName="formatResponse", lineHint=100` | Returns exported function |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGD-E01 | Min context (0) | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=0` | No context lines |
| LGD-E02 | Max context (20) | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=20` | 20 lines context |
| LGD-E03 | Max symbol name | `uri="src/index.ts", symbolName="a".repeat(255), lineHint=5` | Handles max length |
| LGD-E04 | High orderHint | `uri="src/index.ts", symbolName="query", lineHint=5, orderHint=10` | Returns Nth occurrence |
| LGD-E05 | Line 1 | `uri="src/index.ts", symbolName="import", lineHint=1` | Handles first line |
| LGD-E06 | Cross-file | `uri="src/tools/tool.ts", symbolName="BaseSchema", lineHint=3` | Finds external definition |
| LGD-E07 | Private method | `uri="src/class.ts", symbolName="privateMethod", lineHint=50` | Returns private definition |
| LGD-E08 | Nested symbol | `uri="src/nested.ts", symbolName="innerFunction", lineHint=30` | Returns nested definition |
| LGD-E09 | Generic type | `uri="src/types.ts", symbolName="Result<T>", lineHint=10` | Handles generics |
| LGD-E10 | Re-exported symbol | `uri="src/index.ts", symbolName="Tool", lineHint=5` | Follows re-exports |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LGD-F01 | Missing uri | `symbolName="test", lineHint=5` | Validation error: uri required |
| LGD-F02 | Missing symbolName | `uri="src/index.ts", lineHint=5` | Validation error: symbolName required |
| LGD-F03 | Missing lineHint | `uri="src/index.ts", symbolName="test"` | Validation error: lineHint required |
| LGD-F04 | Empty symbolName | `uri="src/index.ts", symbolName="", lineHint=5` | Validation error: min 1 char |
| LGD-F05 | Symbol too long | `uri="src/index.ts", symbolName="a".repeat(256), lineHint=5` | Validation error: max 255 |
| LGD-F06 | Invalid lineHint (0) | `uri="src/index.ts", symbolName="test", lineHint=0` | Validation error: min 1 |
| LGD-F07 | Invalid contextLines | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=25` | Validation error: max 20 |
| LGD-F08 | Non-existent file | `uri="nonexistent.ts", symbolName="test", lineHint=5` | File not found |
| LGD-F09 | Symbol not found | `uri="src/index.ts", symbolName="nonexistentSymbol", lineHint=5` | Symbol not found |
| LGD-F10 | Wrong lineHint | `uri="src/index.ts", symbolName="test", lineHint=9999` | Empty or error |

---

### 4.2 lspFindReferences

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `orderHint` | number | No | min: 0 | 0 |
| `includeDeclaration` | boolean | No | - | true |
| `contextLines` | number | No | 0-10 | 2 |
| `referencesPerPage` | number | No | 1-50 | 20 |
| `page` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFR-N01 | Find function refs | `uri="src/utils.ts", symbolName="formatResponse", lineHint=10` | Returns all usages |
| LFR-N02 | Find type refs | `uri="src/types.ts", symbolName="QueryOptions", lineHint=5` | Returns type usages |
| LFR-N03 | Find interface refs | `uri="src/types.ts", symbolName="ExecutionResult", lineHint=20` | Returns interface usages |
| LFR-N04 | Find variable refs | `uri="src/config.ts", symbolName="DEFAULT_TIMEOUT", lineHint=3` | Returns variable usages |
| LFR-N05 | Exclude declaration | `uri="src/utils.ts", symbolName="formatResponse", lineHint=10, includeDeclaration=false` | Excludes definition |
| LFR-N06 | With context | `uri="src/utils.ts", symbolName="test", lineHint=10, contextLines=5` | Returns 5 lines context |
| LFR-N07 | Pagination | `uri="src/utils.ts", symbolName="query", lineHint=10, referencesPerPage=10, page=1` | Returns paginated |
| LFR-N08 | Page 2 | `uri="src/utils.ts", symbolName="query", lineHint=10, referencesPerPage=10, page=2` | Returns page 2 |
| LFR-N09 | Class references | `uri="src/class.ts", symbolName="MyClass", lineHint=5` | Returns class usages |
| LFR-N10 | Constant references | `uri="src/constants.ts", symbolName="MAX_RETRIES", lineHint=2` | Returns constant usages |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFR-E01 | Min context (0) | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=0` | No context |
| LFR-E02 | Max context (10) | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=10` | 10 lines context |
| LFR-E03 | Min refsPerPage (1) | `uri="src/index.ts", symbolName="test", lineHint=5, referencesPerPage=1` | Returns 1 ref |
| LFR-E04 | Max refsPerPage (50) | `uri="src/index.ts", symbolName="test", lineHint=5, referencesPerPage=50` | Returns up to 50 |
| LFR-E05 | Many references | `uri="src/common.ts", symbolName="logger", lineHint=5` | Handles many refs |
| LFR-E06 | Single reference | `uri="src/rare.ts", symbolName="uniqueFunction", lineHint=10` | Returns single ref |
| LFR-E07 | Cross-file refs | `uri="src/index.ts", symbolName="Tool", lineHint=5` | Returns refs across files |
| LFR-E08 | High page number | `uri="src/index.ts", symbolName="test", lineHint=5, page=100` | Returns empty or last page |
| LFR-E09 | Multiple orderHint | `uri="src/index.ts", symbolName="query", lineHint=10, orderHint=2` | Uses 3rd occurrence |
| LFR-E10 | Generic type refs | `uri="src/types.ts", symbolName="Result", lineHint=10` | Returns generic usages |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LFR-F01 | Missing uri | `symbolName="test", lineHint=5` | Validation error: uri required |
| LFR-F02 | Missing symbolName | `uri="src/index.ts", lineHint=5` | Validation error: symbolName required |
| LFR-F03 | Missing lineHint | `uri="src/index.ts", symbolName="test"` | Validation error: lineHint required |
| LFR-F04 | Invalid lineHint | `uri="src/index.ts", symbolName="test", lineHint=0` | Validation error: min 1 |
| LFR-F05 | Invalid contextLines | `uri="src/index.ts", symbolName="test", lineHint=5, contextLines=15` | Validation error: max 10 |
| LFR-F06 | Invalid refsPerPage | `uri="src/index.ts", symbolName="test", lineHint=5, referencesPerPage=60` | Validation error: max 50 |
| LFR-F07 | Symbol too long | `uri="src/index.ts", symbolName="a".repeat(256), lineHint=5` | Validation error: max 255 |
| LFR-F08 | Non-existent file | `uri="nonexistent.ts", symbolName="test", lineHint=5` | File not found |
| LFR-F09 | Symbol not found | `uri="src/index.ts", symbolName="nonexistent", lineHint=5` | Empty results |
| LFR-F10 | Wrong lineHint | `uri="src/index.ts", symbolName="test", lineHint=9999` | Empty or error |

---

### 4.3 lspCallHierarchy

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `uri` | string | ✅ Yes | min: 1 char | - |
| `symbolName` | string | ✅ Yes | 1-255 chars | - |
| `lineHint` | number | ✅ Yes | min: 1 (1-indexed) | - |
| `direction` | enum | ✅ Yes | `incoming` \| `outgoing` | - |
| `orderHint` | number | No | min: 0 | 0 |
| `depth` | number | No | 1-3 | 1 |
| `contextLines` | number | No | 0-10 | 2 |
| `callsPerPage` | number | No | 1-30 | 15 |
| `page` | number | No | min: 1 | 1 |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LCH-N01 | Incoming calls | `uri="src/utils.ts", symbolName="processQuery", lineHint=10, direction="incoming"` | Returns callers |
| LCH-N02 | Outgoing calls | `uri="src/handler.ts", symbolName="handleRequest", lineHint=20, direction="outgoing"` | Returns callees |
| LCH-N03 | With depth 2 | `uri="src/utils.ts", symbolName="validate", lineHint=15, direction="incoming", depth=2` | Returns 2-level callers |
| LCH-N04 | With context | `uri="src/utils.ts", symbolName="test", lineHint=10, direction="incoming", contextLines=5` | Returns 5 lines context |
| LCH-N05 | Pagination | `uri="src/utils.ts", symbolName="log", lineHint=5, direction="incoming", callsPerPage=5, page=1` | Returns paginated |
| LCH-N06 | Method calls | `uri="src/class.ts", symbolName="execute", lineHint=30, direction="incoming"` | Returns method callers |
| LCH-N07 | Constructor calls | `uri="src/class.ts", symbolName="constructor", lineHint=10, direction="incoming"` | Returns instantiations |
| LCH-N08 | Async function | `uri="src/async.ts", symbolName="fetchData", lineHint=5, direction="outgoing"` | Returns async callees |
| LCH-N09 | Exported function | `uri="src/api.ts", symbolName="createClient", lineHint=50, direction="incoming"` | Returns external callers |
| LCH-N10 | Private method | `uri="src/class.ts", symbolName="privateHelper", lineHint=40, direction="incoming"` | Returns internal callers |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LCH-E01 | Min depth (1) | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", depth=1` | Direct callers only |
| LCH-E02 | Max depth (3) | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", depth=3` | 3-level deep |
| LCH-E03 | Min callsPerPage | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", callsPerPage=1` | Returns 1 call |
| LCH-E04 | Max callsPerPage | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", callsPerPage=30` | Returns up to 30 |
| LCH-E05 | No callers | `uri="src/main.ts", symbolName="entryPoint", lineHint=1, direction="incoming"` | Returns empty |
| LCH-E06 | No callees | `uri="src/leaf.ts", symbolName="leafFunction", lineHint=5, direction="outgoing"` | Returns empty |
| LCH-E07 | Recursive function | `uri="src/recursive.ts", symbolName="recurse", lineHint=5, direction="outgoing"` | Handles recursion |
| LCH-E08 | Cycle detection | `uri="src/cycle.ts", symbolName="a", lineHint=5, direction="outgoing", depth=3` | Handles cycles |
| LCH-E09 | Many callers | `uri="src/utils.ts", symbolName="log", lineHint=2, direction="incoming"` | Handles many |
| LCH-E10 | Callback function | `uri="src/callback.ts", symbolName="callback", lineHint=10, direction="incoming"` | Returns callback callers |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LCH-F01 | Missing uri | `symbolName="test", lineHint=5, direction="incoming"` | Validation error: uri required |
| LCH-F02 | Missing symbolName | `uri="src/index.ts", lineHint=5, direction="incoming"` | Validation error: symbolName required |
| LCH-F03 | Missing lineHint | `uri="src/index.ts", symbolName="test", direction="incoming"` | Validation error: lineHint required |
| LCH-F04 | Missing direction | `uri="src/index.ts", symbolName="test", lineHint=5` | Validation error: direction required |
| LCH-F05 | Invalid direction | `uri="src/index.ts", symbolName="test", lineHint=5, direction="invalid"` | Validation error: enum |
| LCH-F06 | Invalid depth (0) | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", depth=0` | Validation error: min 1 |
| LCH-F07 | Invalid depth (4) | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", depth=4` | Validation error: max 3 |
| LCH-F08 | Invalid callsPerPage | `uri="src/index.ts", symbolName="test", lineHint=5, direction="incoming", callsPerPage=35` | Validation error: max 30 |
| LCH-F09 | Non-callable symbol | `uri="src/types.ts", symbolName="MyInterface", lineHint=5, direction="incoming"` | Not callable error |
| LCH-F10 | Non-existent file | `uri="nonexistent.ts", symbolName="test", lineHint=5, direction="incoming"` | File not found |

---

## Bulk Query Tests

All tools support bulk queries (1-5 queries per call for local/LSP tools, 1-3 for GitHub/package tools).

### Bulk Query Normal Tests

| Test ID | Tool | Description | Query | Expected Result |
|---------|------|-------------|-------|-----------------|
| BQ-N01 | githubSearchCode | 3 parallel searches | `queries=[{keywords:["react"]}, {keywords:["vue"]}, {keywords:["angular"]}]` | Returns 3 result sets |
| BQ-N02 | localSearchCode | 5 parallel searches | `queries=[{pattern:"export"}, {pattern:"import"}, {pattern:"const"}, {pattern:"let"}, {pattern:"function"}]` | Returns 5 result sets |
| BQ-N03 | lspGotoDefinition | 5 definitions | `queries=[{symbol:"a"}, {symbol:"b"}, {symbol:"c"}, {symbol:"d"}, {symbol:"e"}]` | Returns 5 definitions |
| BQ-N04 | packageSearch | 3 packages | `queries=[{name:"express"}, {name:"koa"}, {name:"fastify"}]` | Returns 3 package infos |
| BQ-N05 | lspCallHierarchy | 3 call traces | `queries=[{symbol:"a"}, {symbol:"b"}, {symbol:"c"}]` | Returns 3 call graphs |

### Bulk Query Edge/Failure Tests

| Test ID | Tool | Description | Query | Expected Result |
|---------|------|-------------|-------|-----------------|
| BQ-E01 | githubSearchCode | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| BQ-E02 | localSearchCode | 6 queries (over limit) | 6 queries | Validation error: max 5 |
| BQ-E03 | lspCallHierarchy | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| BQ-E04 | Mixed valid/invalid | 3 queries, 1 invalid | Some valid, some errors | Partial success with errors |
| BQ-E05 | Empty queries array | `queries=[]` | Validation error: min 1 |

---

## Rate Limiting Tests

| Test ID | Description | Action | Expected Result |
|---------|-------------|--------|-----------------|
| RL-01 | GitHub rate limit info | Normal request | Returns `rateLimitRemaining` and `rateLimitReset` in headers |
| RL-02 | Approach rate limit | Multiple rapid requests | Returns rate limit warning |
| RL-03 | Exceed rate limit | Exhaust rate limit | Returns 403 with reset time |
| RL-04 | Rate limit recovery | Wait for reset | Requests succeed after reset |

---

## Integration Test Flows

### Flow 1: Package Discovery → Repo Exploration → Code Search

```
1. packageSearch(name="express") → Get repo URL
2. githubViewRepoStructure(owner="expressjs", repo="express") → See structure  
3. githubSearchCode(owner="expressjs", repo="express", keywords=["middleware"]) → Find code
4. githubGetFileContent(path="lib/router/index.js", matchString="function") → Read code
```

### Flow 2: Local Search → LSP Definition → LSP References

```
1. localSearchCode(pattern="processQuery", path="/workspace") → Get lineHint
2. lspGotoDefinition(symbolName="processQuery", lineHint=10) → Get definition
3. lspFindReferences(symbolName="processQuery", lineHint=10) → Get all usages
```

### Flow 3: Call Hierarchy Trace

```
1. localSearchCode(pattern="handleRequest", path="/workspace") → Get lineHint
2. lspCallHierarchy(symbolName="handleRequest", direction="incoming") → Who calls?
3. lspCallHierarchy(symbolName="handleRequest", direction="outgoing") → What does it call?
4. lspCallHierarchy(symbolName="<callee>", direction="outgoing", depth=2) → Deeper trace
```

---

## Test Execution Checklist

- [ ] **GitHub Tools**: All 5 tools tested with normal, edge, and failure cases
- [ ] **Package Tools**: packageSearch tested with NPM and Python packages
- [ ] **Local Tools**: All 4 tools tested on local repository
- [ ] **LSP Tools**: All 3 tools tested with TypeScript files
- [ ] **Bulk Queries**: All tools tested with multiple queries
- [ ] **Rate Limiting**: GitHub rate limit behavior verified
- [ ] **Integration Flows**: End-to-end workflows tested

---

*Test Plan Version: 1.0*
*Last Updated: January 2026*
*Total Test Cases: ~300+*


---

## Additional Tests for githubSearchPullRequests - Untested Parameters

### 1.3.1 Additional Normal Usage Tests (Untested Params)

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSP-N11 | Search by commenter | `owner="facebook", repo="react", commenter="gaearon"` | Returns PRs where gaearon commented |
| GSP-N12 | Search by involves | `owner="facebook", repo="react", involves="gaearon"` | Returns PRs involving gaearon (author, assignee, commenter, etc.) |
| GSP-N13 | Search by mentions | `owner="facebook", repo="react", mentions="gaearon"` | Returns PRs mentioning @gaearon |
| GSP-N14 | Search by reviewed-by | `owner="facebook", repo="react", reviewed-by="gaearon"` | Returns PRs reviewed by gaearon |
| GSP-N15 | Filter by head branch | `owner="vercel", repo="next.js", head="feature-branch"` | Returns PRs from feature-branch |
| GSP-N16 | Filter by closed date | `owner="facebook", repo="react", closed=">2024-01-01"` | Returns PRs closed after 2024-01-01 |
| GSP-N17 | Filter by interactions | `owner="facebook", repo="react", interactions=">50"` | Returns PRs with 50+ interactions |
| GSP-N18 | Match in title only | `owner="facebook", repo="react", query="fix", match=["title"]` | Returns PRs with "fix" in title only |
| GSP-N19 | Match in body and comments | `owner="facebook", repo="react", query="performance", match=["body", "comments"]` | Returns PRs with "performance" in body or comments |

### 1.3.2 Additional Edge Case Tests (Untested Params)

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| GSP-E11 | No label filter | `owner="facebook", repo="react", no-label=true` | Returns PRs without any labels |
| GSP-E12 | No milestone filter | `owner="facebook", repo="react", no-milestone=true` | Returns PRs without milestone |
| GSP-E13 | No project filter | `owner="facebook", repo="react", no-project=true` | Returns PRs not in any project |
| GSP-E14 | Head branch with slash | `owner="vercel", repo="next.js", head="feature/new-api"` | Handles branch with slash |
| GSP-E15 | Interactions range | `owner="facebook", repo="react", interactions="10..50"` | Returns PRs with 10-50 interactions |
| GSP-E16 | Closed date range | `owner="facebook", repo="react", closed="2024-01-01..2024-06-01"` | Returns PRs closed in date range |
| GSP-E17 | Combine match with query | `owner="facebook", repo="react", query="bug", match=["title", "body"]` | Searches both title and body |
| GSP-E18 | Involves with state | `owner="facebook", repo="react", involves="gaearon", state="closed"` | Returns closed PRs involving user |
| GSP-E19 | Updated date filter | `owner="facebook", repo="react", updated=">2024-06-01"` | Returns PRs updated after date |
| GSP-E20 | All negative filters | `owner="facebook", repo="react", no-label=true, no-milestone=true, no-assignee=true` | Combines all no-* filters |

### 1.3.3 Additional Failure Tests (Untested Params)

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| GSP-F11 | Invalid match value | `query="test", match=["invalid"]` | Validation error: enum mismatch (must be title/body/comments) |
| GSP-F12 | Invalid interactions format | `interactions="invalid"` | Validation error: must be number or range |
| GSP-F13 | Invalid closed date format | `closed="not-a-date"` | Validation error: invalid date format |
| GSP-F14 | Non-existent commenter | `owner="facebook", repo="react", commenter="nonexistentuser123xyz"` | Empty results |
| GSP-F15 | Non-existent reviewed-by | `owner="facebook", repo="react", reviewed-by="nonexistentuser123xyz"` | Empty results |
