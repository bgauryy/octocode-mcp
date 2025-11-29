# PR Analysis Tool - Improvements & Optimization Guide

> Comprehensive analysis of current capabilities, identified gaps, and enhancement roadmap for token-effective PR research.

---

## 📁 Architecture Overview

### File Structure & Responsibilities

```
packages/octocode-mcp/src/
├── tools/
│   └── github_search_pull_requests.ts   ← Tool registration & MCP interface
├── scheme/
│   └── github_search_pull_requests.ts   ← Zod schema validation (input)
├── github/
│   ├── githubAPI.ts                     ← Types & interfaces
│   ├── pullRequestSearch.ts             ← Core logic & GitHub API calls
│   └── client.ts                        ← Octokit client initialization
├── utils/
│   └── diffParser.ts                    ← Patch parsing & line filtering (🐛 BUG HERE)
└── types.ts                             ← Shared TypeScript types
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MCP TOOL CALL                                   │
│                                                                              │
│  User Query                                                                  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  tools/github_search_pull_requests.ts                                 │   │
│  │  • registerSearchGitHubPullRequestsTool()                             │   │
│  │  • Validates input against schema                                     │   │
│  │  • Calls searchMultipleGitHubPullRequests()                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  scheme/github_search_pull_requests.ts                                │   │
│  │  • GitHubPullRequestSearchQuerySchema (Zod)                           │   │
│  │  • Validates: type, partialContentMetadata, filters, etc.             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  github/pullRequestSearch.ts                                          │   │
│  │  • searchGitHubPullRequestsAPI() - Entry point                        │   │
│  │  • fetchGitHubPullRequestByNumberAPI() - Single PR fetch              │   │
│  │  • fetchPRFileChangesAPI() - Get file list                            │   │
│  │  • fetchPRCommitsWithFiles() - Get commits with per-commit files      │   │
│  │  • transformPullRequestItem() - Format response                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  utils/diffParser.ts                          🐛 BUG IS HERE!         │   │
│  │  • parsePatch() - Parse unified diff format                           │   │
│  │  • filterPatch() - Filter to specific lines (BROKEN)                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      ▼                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Response to MCP Client                                               │   │
│  │  { pull_requests: [...], total_count, incomplete_results }            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 File-by-File Breakdown

### 1. `tools/github_search_pull_requests.ts`

**Purpose:** MCP tool registration and request handling

**Key Functions:**

| Function | Line | Purpose |
|----------|------|---------|
| `registerSearchGitHubPullRequestsTool()` | 52-109 | Registers tool with MCP server |
| `searchMultipleGitHubPullRequests()` | 114-164 | Bulk query execution |
| `hasQueryLengthError()` | 27-29 | Validates query length |
| `hasValidSearchParams()` | 31-40 | Validates required params |

**Code Flow:**
```typescript
// Line 129: Calls the core API
const apiResult = await searchGitHubPullRequestsAPI(
  query,
  authInfo,
  sessionId
);
```

---

### 2. `scheme/github_search_pull_requests.ts`

**Purpose:** Zod schema for input validation

**Key Schemas:**

```typescript
// Lines 159-177: The type parameter and partialContentMetadata
type: z
  .enum(['metadata', 'fullContent', 'partialContent'])
  .default('metadata')
  
partialContentMetadata: z.array(
  z.object({
    file: z.string(),
    additions: z.array(z.number()).optional(),
    deletions: z.array(z.number()).optional(),
  })
)
```

**All Available Parameters:**

| Category | Parameters |
|----------|------------|
| **Scope** | `owner`, `repo`, `prNumber` |
| **Content Type** | `type` (`metadata`/`fullContent`/`partialContent`) |
| **Filtering** | `partialContentMetadata`, `withComments` |
| **Search** | `query`, `match` (`title`/`body`/`comments`) |
| **State Filters** | `state`, `draft`, `merged` |
| **People Filters** | `author`, `assignee`, `commenter`, `involves`, `mentions` |
| **Review Filters** | `review-requested`, `reviewed-by` |
| **Date Filters** | `created`, `updated`, `closed`, `merged-at` |
| **Label Filters** | `label`, `no-label`, `no-milestone`, `no-project`, `no-assignee` |
| **Branch Filters** | `head`, `base` |
| **Engagement** | `comments`, `reactions`, `interactions` |
| **Sorting** | `sort`, `order`, `limit` |

---

### 3. `github/pullRequestSearch.ts` (944 lines)

**Purpose:** Core PR search logic and GitHub API integration

**Key Functions:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `searchGitHubPullRequestsAPI()` | 25-47 | Entry point with caching |
| `searchGitHubPullRequestsAPIInternal()` | 49-203 | Main search logic |
| `fetchGitHubPullRequestByNumberAPI()` | 775-805 | Direct PR fetch |
| `fetchPRFileChangesAPI()` | 518-541 | Get PR files (⚠️ No pagination!) |
| `fetchPRCommitsAPI()` | 563-581 | Get PR commits |
| `fetchCommitFilesAPI()` | 583-601 | Get commit file details |
| `fetchPRCommitsWithFiles()` | 603-694 | Combine commits + files |
| `transformPullRequestItem()` | 405-516 | Format response |

**Critical Code Sections:**

```typescript
// Lines 446-476: Type-based content handling
if (type === 'metadata') {
  fileChanges.files = fileChanges.files.map(file => ({
    ...file,
    patch: undefined,  // ← Remove patches
  }));
} else if (type === 'partialContent') {
  const metadataMap = new Map(
    params.partialContentMetadata?.map(m => [m.file, m]) || []
  );

  fileChanges.files = fileChanges.files
    .filter(file => metadataMap.has(file.filename))  // ← Filter files
    .map(file => {
      const meta = metadataMap.get(file.filename);
      return {
        ...file,
        patch: file.patch
          ? filterPatch(file.patch, meta?.additions, meta?.deletions)  // ← 🐛 BUG!
          : undefined,
      };
    });
}
```

---

### 4. `utils/diffParser.ts` (99 lines) - 🐛 BUG LOCATION

**Purpose:** Parse and filter unified diff patches

**Key Functions:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `parsePatch()` | 8-53 | Parse unified diff to structured lines |
| `filterPatch()` | 55-98 | Filter patch to specific line numbers |

**The Bug (Lines 66-83):**

```typescript
export function filterPatch(
  patch: string,
  additions: number[] = [],  // ← Default to empty array
  deletions: number[] = []   // ← Default to empty array
): string {
  if (!patch) return '';

  const parsed = parsePatch(patch);
  const addSet = new Set(additions);  // ← Empty set!
  const delSet = new Set(deletions);  // ← Empty set!

  // If both empty, returns empty string!
  const filteredLines = parsed.filter(line => {
    if (line.type === 'addition' && line.newLineNumber !== null) {
      return addSet.has(line.newLineNumber);  // ← Always false!
    }
    if (line.type === 'deletion' && line.originalLineNumber !== null) {
      return delSet.has(line.originalLineNumber);  // ← Always false!
    }
    return false;
  });

  if (filteredLines.length === 0) return '';  // ← Returns empty!
  // ...
}
```

---

### 5. `github/githubAPI.ts`

**Purpose:** Type definitions for GitHub API interactions

**Key Types:**

```typescript
// Lines 14-21: Commit file info
export interface CommitFileInfo {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

// Lines 24-30: Commit info
export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  files: CommitFileInfo[];
}

// Lines 100-141: PR item type
export type GitHubPullRequestItem = {
  // ... PR fields
  file_changes?: {
    total_count: number;
    files: DiffEntry[];
  };
  commits?: CommitInfo[];
}

// Lines 143-186: Search params
export interface GitHubPullRequestsSearchParams {
  type?: 'metadata' | 'fullContent' | 'partialContent';
  partialContentMetadata?: {
    file: string;
    additions?: number[];
    deletions?: number[];
  }[];
  // ... other params
}
```

---

### 6. `types.ts` (Lines 226-374 for PR types)

**Purpose:** Shared types for tool results

**Key Types:**

```typescript
// Lines 339-360: PR response file structure
file_changes?: Array<{
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;  // Controlled by type
}>;

commit_details?: Array<{
  sha: string;          // Use with githubGetFileContent!
  message: string;
  author: string;
  date: string;
  files: Array<{...}>;  // Per-commit files
}>;
```

---

## 🔄 Complete Request/Response Flow

### Flow for `type: "partialContent"`

```
1. MCP Client sends request:
   {
     "prNumber": 12345,
     "type": "partialContent",
     "partialContentMetadata": [{"file": "src/core.ts"}]
   }

2. tools/github_search_pull_requests.ts
   └─ registerSearchGitHubPullRequestsTool()
      └─ Validates against GitHubPullRequestSearchBulkQuerySchema
      └─ Calls searchMultipleGitHubPullRequests()

3. github/pullRequestSearch.ts
   └─ searchGitHubPullRequestsAPI()
      └─ fetchGitHubPullRequestByNumberAPI()
         └─ octokit.rest.pulls.get() → PR metadata
         └─ transformPullRequestItemFromREST()
            │
            ├─ fetchPRFileChangesAPI()
            │  └─ octokit.rest.pulls.listFiles() → All files
            │  └─ Filters to partialContentMetadata files
            │  └─ For each file:
            │     └─ filterPatch(patch, meta?.additions, meta?.deletions)
            │        └─ 🐛 BUG: If no additions/deletions → returns ""
            │
            └─ fetchPRCommitsWithFiles()
               └─ octokit.rest.pulls.listCommits() → All commits
               └─ For each commit:
                  └─ octokit.rest.repos.getCommit() → Commit files
                  └─ Filter to partialContentMetadata files
                  └─ filterPatch() → Same bug!

4. Response formatted and returned to MCP client
```

---

## Executive Summary

| Category | Status | Impact |
|----------|--------|--------|
| 🐛 **Critical Bug** | `partialContent` returns empty patch when no line numbers specified | HIGH |
| ⚠️ **Missing Feature** | Commit-specific selection | MEDIUM |
| ⚠️ **Missing Feature** | Pagination for 100+ file PRs | MEDIUM |
| 💡 **Enhancement** | Glob pattern filtering | LOW |
| 💡 **Enhancement** | Context lines control | LOW |

---

## 🐛 CRITICAL BUG: partialContent Line Filtering

### Current Behavior (BROKEN)

```typescript
// In diffParser.ts lines 66-83
// When additions/deletions arrays are empty, returns ""
if (filteredLines.length === 0) return '';
```

### Test Case

```json
// Query
{
  "prNumber": 35234,
  "type": "partialContent",
  "partialContentMetadata": [
    {"file": "src/file.ts"}  // No additions/deletions specified
  ]
}

// Result: patch: "" ← WRONG! Should return full patch
```

### Expected Behavior

| Input | Expected Output |
|-------|-----------------|
| `{file: "x.ts"}` | Full patch for file |
| `{file: "x.ts", additions: []}` | Empty (explicitly no additions) |
| `{file: "x.ts", additions: [1,2,3]}` | Only lines 1,2,3 |
| `{file: "x.ts", additions: [1,2], deletions: [5,6]}` | Lines 1,2 additions + 5,6 deletions |

### Fix Required

```typescript
// diffParser.ts - filterPatch function
export function filterPatch(
  patch: string,
  additions?: number[],  // undefined = return all additions
  deletions?: number[]   // undefined = return all deletions
): string {
  if (!patch) return '';

  // If BOTH arrays are undefined → return full patch (no filtering)
  if (additions === undefined && deletions === undefined) {
    return patch;
  }

  const parsed = parsePatch(patch);
  const addSet = additions ? new Set(additions) : null;
  const delSet = deletions ? new Set(deletions) : null;

  const filteredLines = parsed.filter(line => {
    if (line.type === 'addition' && line.newLineNumber !== null) {
      // If addSet is null, include all additions
      return addSet === null || addSet.has(line.newLineNumber);
    }
    if (line.type === 'deletion' && line.originalLineNumber !== null) {
      // If delSet is null, include all deletions
      return delSet === null || delSet.has(line.originalLineNumber);
    }
    return false;
  });

  // ... rest of function
}
```

---

## 📊 Type-by-Type Analysis

### `metadata` Type

#### Current Response Structure

```typescript
{
  file_changes: [{
    filename: string;      // ✅ Required
    status: string;        // ✅ Required (added/modified/deleted/renamed)
    additions: number;     // ✅ Required
    deletions: number;     // ✅ Required
    changes: number;       // ⚠️ Redundant (= additions + deletions)
    patch: undefined;      // ✅ Correct - no patch in metadata
  }],
  commit_details: [{
    sha: string;           // ✅ Required
    message: string;       // ✅ Required
    author: string;        // ✅ Required
    date: string;          // ✅ Required
    files: [...]           // ⚠️ Could be redundant with file_changes
  }]
}
```

#### Redundancy Analysis

| Field | Redundant? | Recommendation |
|-------|------------|----------------|
| `changes` | ⚠️ YES | Remove (= additions + deletions) |
| `commit_details.files` in metadata | ⚠️ PARTIAL | Keep only filenames, remove stats (available in file_changes) |
| `id: 0` | ⚠️ YES | Remove (always 0, not useful) |
| `review_comments: 0` | ⚠️ YES | Remove if not fetched |

#### Optimal metadata Response

```typescript
{
  file_changes: [{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    // REMOVED: changes (redundant)
    // REMOVED: patch (correct for metadata)
  }],
  commit_details: [{
    sha: string;
    message: string;
    author: string;
    date: string;
    files: string[];  // SIMPLIFIED: Just filenames, not full objects
  }]
}
```

**Token Savings: ~20-30% reduction in metadata response size**

---

### `fullContent` Type

#### Current Response Structure

```typescript
{
  file_changes: [{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;       // ⚠️ Redundant
    patch: string;         // ✅ Full diff
  }],
  commit_details: [{
    sha: string;
    message: string;
    author: string;
    date: string;
    files: [{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch: string;       // ⚠️ HIGHLY REDUNDANT with file_changes
    }]
  }]
}
```

#### Critical Redundancy Issue

**Problem:** In `fullContent`, the SAME patch appears in both:
1. `file_changes[].patch`
2. `commit_details[].files[].patch`

For a 100-line diff across 3 commits, this means **3x token cost!**

#### Recommendation: Patch Deduplication

```typescript
// Option 1: Reference-based (most efficient)
{
  file_changes: [{
    filename: "src/file.ts",
    patch: "...full diff..."
  }],
  commit_details: [{
    sha: "abc123",
    files: [{
      filename: "src/file.ts",
      patch_ref: "file_changes[0]"  // Reference instead of duplicate
    }]
  }]
}

// Option 2: Omit patch from commit_details in fullContent
{
  commit_details: [{
    sha: "abc123",
    files: [{
      filename: "src/file.ts",
      // patch: OMITTED - use file_changes for full diff
      // Include only per-commit stats
      additions: 5,
      deletions: 3
    }]
  }]
}
```

**Token Savings: 50-70% reduction for multi-commit PRs**

---

### `partialContent` Type

#### Current Issues

1. **🐛 BUG:** Empty patch when no line arrays specified
2. **❌ Missing:** Full patch for file when filtering undefined
3. **⚠️ Unclear:** What happens with renamed files?

#### Ideal Behavior Matrix

| partialContentMetadata | file_changes | commit_details |
|------------------------|--------------|----------------|
| `[{file: "x.ts"}]` | Full patch for x.ts | Only commits touching x.ts, full patches |
| `[{file: "x.ts", additions: [1,2]}]` | Only lines 1,2 | Only commits with changes to lines 1,2 |
| `[{file: "*.ts"}]` | All .ts files with full patches | Commits touching .ts files |

#### Missing Feature: Glob Patterns

```typescript
// Current (exact match only)
partialContentMetadata: [
  {file: "src/utils/auth.ts"},
  {file: "src/utils/session.ts"},
  {file: "src/utils/crypto.ts"}
]

// Proposed (glob support)
partialContentMetadata: [
  {file: "src/utils/*.ts"}  // All utils
]
```

---

## ⚠️ Missing Features

### 1. Commit-Specific Selection

**Current:** Auto-filter by files
**Needed:** Direct commit selection

```typescript
// Proposed new parameter
{
  "prNumber": 12345,
  "type": "partialContent",
  "commitFilter": ["abc123", "def456"],  // NEW: Select specific commits
  "partialContentMetadata": [
    {"file": "src/core.ts"}
  ]
}
```

**Use Case:** "Show me only what commit X changed in file Y"

### 2. Pagination for Large PRs

**Current:** GitHub API returns max 100 files per page
**Problem:** PRs with 100+ files silently truncate

```typescript
// Current implementation (pullRequestSearch.ts line 526)
const result = await octokit.rest.pulls.listFiles({
  owner,
  repo,
  pull_number: prNumber,
  // Missing: per_page and page parameters
});
```

**Fix Required:**

```typescript
async function fetchPRFileChangesAPI(
  owner: string,
  repo: string,
  prNumber: number,
  authInfo?: AuthInfo
): Promise<{ total_count: number; files: DiffEntry[] } | null> {
  const octokit = await getOctokit(authInfo);
  const allFiles: DiffEntry[] = [];
  let page = 1;
  
  while (true) {
    const result = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
      page: page
    });
    
    allFiles.push(...result.data);
    
    if (result.data.length < 100) break;
    page++;
  }
  
  return {
    total_count: allFiles.length,
    files: allFiles,
  };
}
```

### 3. Context Lines Control

**Current:** Fixed context in patches (typically 3 lines)
**Proposed:**

```typescript
{
  "prNumber": 12345,
  "type": "partialContent",
  "patchOptions": {
    "contextLines": 5,     // More context around changes
    "format": "unified"    // or "side-by-side"
  }
}
```

---

## 🚀 Optimal Research Workflows

### Workflow A: Quick Triage (< 10 files)

```
┌─────────────────────────────────────────┐
│ type: "fullContent"                      │
│ ↓                                        │
│ Returns everything in one call           │
│ ↓                                        │
│ Token cost: LOW-MEDIUM                   │
└─────────────────────────────────────────┘
```

### Workflow B: Large PR Analysis (10-100 files)

```
┌─────────────────────────────────────────┐
│ STEP 1: type: "metadata"                 │
│ ↓ Returns: file list + commit breakdown  │
│ ↓ Token cost: LOW                        │
├─────────────────────────────────────────┤
│ STEP 2: Agent Analysis                   │
│ ↓ Categorize: core/ api/ utils/ tests/   │
│ ↓ Identify: high-impact files (2-5)      │
│ ↓ Token cost: ZERO (reasoning only)      │
├─────────────────────────────────────────┤
│ STEP 3: type: "partialContent"           │
│ ↓ partialContentMetadata: [top files]    │
│ ↓ Returns: filtered patches              │
│ ↓ Token cost: LOW                        │
├─────────────────────────────────────────┤
│ STEP 4 (optional): githubGetFileContent  │
│ ↓ branch: commit_sha                     │
│ ↓ See file at specific point in time     │
│ ↓ Token cost: MINIMAL                    │
└─────────────────────────────────────────┘
```

### Workflow C: Massive PR Analysis (100+ files)

```
┌─────────────────────────────────────────┐
│ STEP 1: type: "metadata"                 │
│ ⚠️ WARNING: May be paginated (100+ files)│
│ ↓ Consider: changed_files count first    │
├─────────────────────────────────────────┤
│ STEP 2: Categorize by Path               │
│ ↓ Group files: src/core/, src/api/, etc. │
│ ↓ Count changes per directory            │
│ ↓ Identify hotspots                      │
├─────────────────────────────────────────┤
│ STEP 3: Drill Into Hotspots              │
│ ↓ partialContent: 2-3 files max          │
│ ↓ Multiple queries if needed             │
├─────────────────────────────────────────┤
│ STEP 4: Cross-reference with Commits     │
│ ↓ Which commits made most changes?       │
│ ↓ githubGetFileContent with commit SHA   │
└─────────────────────────────────────────┘
```

---

## 📉 Token Efficiency Comparison

### Current vs Optimized

| Scenario | Current Tokens | Optimized Tokens | Savings |
|----------|---------------|------------------|---------|
| 10-file PR, fullContent | ~5,000 | ~5,000 | 0% |
| 50-file PR, metadata→partial | ~8,000 | ~3,500 | 56% |
| 100-file PR, full workflow | ~25,000 | ~5,000 | 80% |
| 1000-file PR, full workflow | ~200,000 | ~8,000 | 96% |

### Key Optimizations

1. **Remove redundant fields** (`changes`, `id: 0`, duplicate patches)
2. **Fix partialContent bug** (return full patch when no line filters)
3. **Add pagination** (prevent truncation on large PRs)
4. **Simplify commit_details** (filenames only in metadata mode)

---

## 🔧 Implementation Priority

### Phase 1: Critical Fixes (HIGH PRIORITY)

| Task | Effort | Impact |
|------|--------|--------|
| Fix partialContent empty patch bug | 1 hour | HIGH |
| Add pagination for 100+ files | 2 hours | HIGH |
| Remove redundant `changes` field | 30 min | LOW |

### Phase 2: Optimizations (MEDIUM PRIORITY)

| Task | Effort | Impact |
|------|--------|--------|
| Deduplicate patches in fullContent | 2 hours | MEDIUM |
| Simplify commit_details in metadata | 1 hour | MEDIUM |
| Add `commitFilter` parameter | 3 hours | MEDIUM |

### Phase 3: Enhancements (LOW PRIORITY)

| Task | Effort | Impact |
|------|--------|--------|
| Glob pattern support | 4 hours | LOW |
| Context lines control | 2 hours | LOW |
| Side-by-side diff format | 4 hours | LOW |

---

## 📋 Schema Enhancement Proposal

```typescript
// Enhanced partialContentMetadata schema
partialContentMetadata: z.array(
  z.object({
    file: z.string(),                    // Exact path OR glob pattern
    additions: z.array(z.number()).optional(),
    deletions: z.array(z.number()).optional(),
    // NEW: Explicit "include all" flag
    includeFullPatch: z.boolean().optional().default(true),
  })
).optional(),

// NEW: Commit selection
commitFilter: z.array(z.string()).optional()
  .describe("Filter to specific commit SHAs"),

// NEW: Patch formatting options
patchOptions: z.object({
  contextLines: z.number().min(0).max(10).optional().default(3),
  format: z.enum(['unified', 'compact']).optional().default('unified'),
  includeHunkHeaders: z.boolean().optional().default(true),
}).optional(),
```

---

## ✅ Quick Reference

### What Works Now

- ✅ `type: metadata` - File list without patches
- ✅ `type: fullContent` - All patches (with redundancy)
- ✅ `type: partialContent` - File filtering works
- ✅ `commit_details` - Per-commit breakdown
- ✅ `commit_details[].sha` → `githubGetFileContent` with branch param
- ✅ `withComments` - Comment retrieval

### What's Broken

- 🐛 `partialContent` without line arrays returns empty patch

### What's Missing

- ❌ Commit-specific selection (`commitFilter`)
- ❌ Pagination for 100+ files
- ❌ Glob patterns in file filtering
- ❌ Patch context control

---

## 🎯 Theoretical Million-File Capability

### Can It Handle 1M Files?

**Algorithm: YES** (O(k) where k = selected files)
**Implementation: NO** (pagination missing)

### With Proposed Fixes

| Files | API Calls | Time | Feasible? |
|-------|-----------|------|-----------|
| 100 | 1 | <1s | ✅ |
| 1,000 | 10 | ~3s | ✅ |
| 10,000 | 100 | ~30s | ✅ |
| 100,000 | 1,000 | ~5min | ⚠️ |
| 1,000,000 | 10,000 | ~50min | 🤔 GitHub limits |

**Bottleneck:** GitHub API rate limits, not algorithm complexity.

---

## 📐 Complete Schema Reference

### Input Schema (Zod Validation)

```typescript
// scheme/github_search_pull_requests.ts

GitHubPullRequestSearchQuerySchema = BaseQuerySchema.extend({
  // === SCOPE ===
  owner: z.string().optional(),
  repo: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  
  // === CONTENT TYPE (THE KEY PARAMETER!) ===
  type: z.enum(['metadata', 'fullContent', 'partialContent'])
    .default('metadata'),
  
  // === PARTIAL CONTENT FILTER ===
  partialContentMetadata: z.array(
    z.object({
      file: z.string(),           // Required: exact file path
      additions: z.array(z.number()).optional(),  // Line numbers to include
      deletions: z.array(z.number()).optional(),  // Line numbers to include
    })
  ).optional(),
  
  // === COMMENTS ===
  withComments: z.boolean().default(false),
  
  // === SEARCH ===
  query: z.string().optional(),
  match: z.array(z.enum(['title', 'body', 'comments'])).optional(),
  
  // === STATE FILTERS ===
  state: z.enum(['open', 'closed']).optional(),
  draft: z.boolean().optional(),
  merged: z.boolean().optional(),
  
  // === PEOPLE FILTERS ===
  author: z.string().optional(),
  assignee: z.string().optional(),
  commenter: z.string().optional(),
  involves: z.string().optional(),
  mentions: z.string().optional(),
  'review-requested': z.string().optional(),
  'reviewed-by': z.string().optional(),
  
  // === DATE FILTERS (format: ">=2024-01-01" or "2024-01-01..2024-06-01") ===
  created: z.string().optional(),
  updated: z.string().optional(),
  closed: z.string().optional(),
  'merged-at': z.string().optional(),
  
  // === LABEL FILTERS ===
  label: z.union([z.string(), z.array(z.string())]).optional(),
  'no-label': z.boolean().optional(),
  'no-milestone': z.boolean().optional(),
  'no-project': z.boolean().optional(),
  'no-assignee': z.boolean().optional(),
  
  // === BRANCH FILTERS ===
  head: z.string().optional(),
  base: z.string().optional(),
  
  // === ENGAGEMENT FILTERS (format: ">=10" or "5..20") ===
  comments: z.union([z.number().int().min(0), z.string()]).optional(),
  reactions: z.union([z.number().int().min(0), z.string()]).optional(),
  interactions: z.union([z.number().int().min(0), z.string()]).optional(),
  
  // === SORTING ===
  sort: z.enum(['created', 'updated', 'best-match']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().min(1).max(10).default(5),
});
```

### Output Types (TypeScript)

```typescript
// types.ts - Lines 275-374

interface PullRequestInfo {
  // === IDENTIFIERS ===
  id: number;
  number: number;
  title: string;
  url: string;
  html_url: string;
  
  // === STATE ===
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  
  // === DATES ===
  created_at: string;
  updated_at: string;
  closed_at?: string;
  merged_at?: string;
  
  // === PEOPLE ===
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
  assignees?: Array<{...}>;
  
  // === BRANCHES ===
  head: {
    ref: string;      // Branch name
    sha: string;      // HEAD commit SHA
    repo?: string;    // "owner/repo"
  };
  base: {
    ref: string;      // Target branch (e.g., "main")
    sha: string;      // Base commit SHA
    repo: string;
  };
  
  // === CONTENT ===
  body?: string;
  labels?: Array<{id, name, color, description?}>;
  
  // === STATS ===
  comments?: number;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  
  // === FILE CHANGES (controlled by type parameter) ===
  file_changes?: Array<{
    filename: string;     // "src/utils/auth.ts"
    status: string;       // "added" | "modified" | "deleted" | "renamed"
    additions: number;    // Lines added
    deletions: number;    // Lines deleted
    changes: number;      // Total changes (redundant)
    patch?: string;       // Unified diff (when type != metadata)
  }>;
  
  // === COMMIT DETAILS (always returned, sorted by date desc) ===
  commit_details?: Array<{
    sha: string;          // Commit SHA (use with githubGetFileContent!)
    message: string;      // Commit message
    author: string;       // Author name
    date: string;         // Commit date
    files: Array<{        // Files changed in THIS commit
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;     // Per-commit diff (controlled by type)
    }>;
  }>;
  
  // === COMMENTS (when withComments: true) ===
  comment_details?: Array<{
    id: number;
    user: string;
    body: string;
    created_at: string;
    updated_at: string;
  }>;
}
```

---

## 🎯 PR Tool Abilities

### What the Tool CAN Do

| Capability | How | Example |
|------------|-----|---------|
| **Fetch single PR** | `prNumber` + `owner` + `repo` | `{prNumber: 123, owner: "facebook", repo: "react"}` |
| **Search PRs** | `query` + filters | `{query: "auth", state: "open", author: "user"}` |
| **Get file list** | `type: "metadata"` | Returns filenames + stats, no patches |
| **Get all diffs** | `type: "fullContent"` | Returns all patches (token-heavy!) |
| **Get specific files** | `type: "partialContent"` | Filter to specific files |
| **Filter by lines** | `additions`/`deletions` arrays | 🐛 CURRENTLY BROKEN |
| **Get commits** | Always included | Per-commit breakdown with `sha` |
| **Get comments** | `withComments: true` | Issue comments (not review comments) |
| **View at commit** | Use `sha` with `githubGetFileContent` | See file state at any commit |

### What the Tool CANNOT Do (Yet)

| Missing Capability | Workaround |
|--------------------|------------|
| Select specific commits | Filter commits client-side after metadata |
| Glob patterns (`*.ts`) | List files manually in `partialContentMetadata` |
| Review comments | Use GitHub UI or separate API call |
| PR diff (not per-file) | Reconstruct from file patches |
| Pagination (100+ files) | Currently truncates silently |

---

## 🔧 Fix Implementation Guide

### The Bug: `filterPatch()` Returns Empty String

**Location:** `packages/octocode-mcp/src/utils/diffParser.ts`

**Current Code (Lines 55-98):**

```typescript
export function filterPatch(
  patch: string,
  additions: number[] = [],  // ← Problem: defaults to []
  deletions: number[] = []   // ← Problem: defaults to []
): string {
  if (!patch) return '';

  const parsed = parsePatch(patch);
  const addSet = new Set(additions);  // Empty Set
  const delSet = new Set(deletions);  // Empty Set

  const filteredLines = parsed.filter(line => {
    if (line.type === 'addition' && line.newLineNumber !== null) {
      return addSet.has(line.newLineNumber);  // Always false!
    }
    if (line.type === 'deletion' && line.originalLineNumber !== null) {
      return delSet.has(line.originalLineNumber);  // Always false!
    }
    return false;
  });

  if (filteredLines.length === 0) return '';  // ← Returns empty!

  return filteredLines
    .map(line => {
      const lineNum =
        line.type === 'addition'
          ? `+${line.newLineNumber}`
          : `-${line.originalLineNumber}`;
      return `${lineNum}: ${line.content.substring(1)}`;
    })
    .join('\n');
}
```

**Fixed Code:**

```typescript
export function filterPatch(
  patch: string,
  additions?: number[],  // ← Changed: undefined means "include all"
  deletions?: number[]   // ← Changed: undefined means "include all"
): string {
  if (!patch) return '';

  // NEW: If both undefined, return full patch (no filtering)
  if (additions === undefined && deletions === undefined) {
    return patch;
  }

  const parsed = parsePatch(patch);
  
  // NEW: null means "include all of this type", empty array means "include none"
  const addSet = additions !== undefined ? new Set(additions) : null;
  const delSet = deletions !== undefined ? new Set(deletions) : null;

  const filteredLines = parsed.filter(line => {
    if (line.type === 'addition' && line.newLineNumber !== null) {
      // If addSet is null, include all additions
      return addSet === null || addSet.has(line.newLineNumber);
    }
    if (line.type === 'deletion' && line.originalLineNumber !== null) {
      // If delSet is null, include all deletions
      return delSet === null || delSet.has(line.originalLineNumber);
    }
    // Include context lines if we're including some content
    if (line.type === 'context') {
      return addSet === null || delSet === null || 
             addSet.size > 0 || delSet.size > 0;
    }
    return false;
  });

  if (filteredLines.length === 0) return '';

  return filteredLines
    .map(line => {
      const lineNum =
        line.type === 'addition'
          ? `+${line.newLineNumber}`
          : line.type === 'deletion'
          ? `-${line.originalLineNumber}`
          : ` ${line.newLineNumber}`;  // Context line
      return `${lineNum}: ${line.content.substring(1)}`;
    })
    .join('\n');
}
```

**Behavior After Fix:**

| Input | Before (Bug) | After (Fixed) |
|-------|--------------|---------------|
| `filterPatch(patch)` | `""` | Full patch |
| `filterPatch(patch, undefined, undefined)` | `""` | Full patch |
| `filterPatch(patch, [], [])` | `""` | `""` (correct - explicitly empty) |
| `filterPatch(patch, [1,2,3])` | Lines 1,2,3 | Lines 1,2,3 (unchanged) |
| `filterPatch(patch, [1], [5])` | Lines 1+5 | Lines 1+5 (unchanged) |

---

## 📋 Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/utils/diffParser.ts` | Fix `filterPatch()` logic | 🔴 HIGH |
| `src/github/pullRequestSearch.ts` | Add pagination to `fetchPRFileChangesAPI()` | 🟠 MEDIUM |
| `src/scheme/github_search_pull_requests.ts` | Add `commitFilter` param | 🟡 LOW |
| `tests/utils/diffParser.test.ts` | Add tests for new behavior | 🔴 HIGH |

---

## 🧪 Test Cases for Fix

```typescript
// tests/utils/diffParser.test.ts

describe('filterPatch', () => {
  const samplePatch = `@@ -1,3 +1,4 @@
 line 1
-deleted line
+added line 1
+added line 2
 line 3`;

  it('returns full patch when no filter arrays provided', () => {
    const result = filterPatch(samplePatch);
    expect(result).toBe(samplePatch);  // Currently fails!
  });

  it('returns full patch when both filters are undefined', () => {
    const result = filterPatch(samplePatch, undefined, undefined);
    expect(result).toBe(samplePatch);  // Currently fails!
  });

  it('returns empty when both filters are empty arrays', () => {
    const result = filterPatch(samplePatch, [], []);
    expect(result).toBe('');  // Correct behavior
  });

  it('filters to specific addition lines', () => {
    const result = filterPatch(samplePatch, [2], undefined);
    expect(result).toContain('+2');
    expect(result).not.toContain('+3');
  });

  it('filters to specific deletion lines', () => {
    const result = filterPatch(samplePatch, undefined, [2]);
    expect(result).toContain('-2');
  });
});
```

---

*Document Version: 1.1*
*Last Updated: November 2025*
*Status: Analysis Complete, Fix Documented, Ready for Implementation*

