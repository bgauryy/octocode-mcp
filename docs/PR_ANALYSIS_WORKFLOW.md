# PR Analysis Workflow

> Token-efficient strategy for analyzing Pull Requests using `githubSearchPullRequests`.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    PR ANALYSIS WORKFLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   STEP 1     │───▶│   STEP 2     │───▶│   STEP 3     │      │
│  │  metadata    │    │   Analyze    │    │partialContent│      │
│  │              │    │  & Triage    │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│        │                    │                   │               │
│        ▼                    ▼                   ▼               │
│   File list +          Categorize          Drill into          │
│   commits list         by impact           specific files      │
│   (no patches)                             (filtered patches)  │
│                                                                 │
│  Tokens: LOW           Tokens: NONE        Tokens: LOW         │
└─────────────────────────────────────────────────────────────────┘
```

## Type Parameter

| Type | Returns | Use When |
|------|---------|----------|
| `metadata` | Files + commits with stats, no patches | First pass, understanding scope |
| `partialContent` | Filtered files/lines only | Examining specific changes |
| `fullContent` | All files with full patches | Small PRs only (<10 files) |

## Response Structure

PR responses include both `file_changes` and `commit_details`:

```typescript
{
  pull_requests: [{
    // ... PR metadata ...
    file_changes: [{           // Aggregated file changes
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;          // Controlled by type
    }],
    commit_details: [{         // Per-commit breakdown
      sha: string;             // Use with githubGetFileContent branch param
      message: string;
      author: string;
      date: string;
      files: [{                // Files changed in THIS commit
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;        // Controlled by type
      }]
    }]
  }]
}
```

## Step-by-Step

### 1. Get Overview
```json
{
  "prNumber": 12345,
  "type": "metadata"
}
```
Returns:
- File paths, status, additions/deletions counts
- Commits list (sorted by date, most recent first) with per-commit file changes

### 2. Categorize Files & Commits

Prioritize by:
- **High impact**: Core logic, APIs, schemas
- **Medium impact**: Utilities, helpers
- **Low impact**: Tests, docs, configs

Identify which commits made the most changes.

### 3. Drill Into High-Impact Files
```json
{
  "prNumber": 12345,
  "type": "partialContent",
  "partialContentMetadata": [
    {"file": "src/core/important.ts"},
    {"file": "src/api/handler.ts", "additions": [50, 51, 52]}
  ]
}
```

## partialContentMetadata Schema

```typescript
{
  file: string;           // Required: file path
  additions?: number[];   // Optional: specific added line numbers
  deletions?: number[];   // Optional: specific deleted line numbers
}
```

- Omit `additions`/`deletions` → returns full patch for that file
- Include line numbers → returns only hunks containing those lines
- Applies to both `file_changes` AND `commit_details.files`

## Commits Breakdown

Commits are always returned, sorted by date (most recent first).

| type | commit_details.files behavior |
|------|-------------------------------|
| `metadata` | Files with stats only (no patch) |
| `fullContent` | Files with full patch content |
| `partialContent` | Filtered files based on `partialContentMetadata` |

### Using Commit SHA

Each commit has a `sha` field. Use it with `githubGetFileContent`:

```json
{
  "owner": "facebook",
  "repo": "react",
  "path": "src/file.ts",
  "branch": "abc123def456...",  // commit SHA
  "matchString": "functionName"
}
```

## Decision Tree

```
Is PR < 10 files?
├─ YES → Use type: "fullContent"
└─ NO → Use type: "metadata" first
         │
         ▼
    Review commits: which made most changes?
         │
         ▼
    Identify high-impact files (2-5 max)
         │
         ▼
    Use type: "partialContent" with those files
         │
         ▼
    Need specific lines only?
    ├─ YES → Add additions/deletions arrays
    └─ NO → Omit for full file patches
```

## Example: Large PR (50+ files)

```json
// Step 1: Overview with commits
{"prNumber": 35048, "type": "metadata"}

// Response includes commit_details showing which commits changed what

// Step 2: After analysis, drill into core files
{
  "prNumber": 35048,
  "type": "partialContent",
  "partialContentMetadata": [
    {"file": "src/reconciler/ReactFiberBeginWork.js"},
    {"file": "src/reconciler/ReactFiberThrow.js"}
  ]
}
```

**Result**: 2 files examined instead of 50+ → ~95% token savings.

## Anti-Patterns

- `fullContent` on large PRs (token explosion)
- Fetching all files when only 2-3 matter
- Skipping metadata step (blind drilling)
- Ignoring commit breakdown for understanding change history

## Quick Reference

| PR Size | Strategy |
|---------|----------|
| 1-10 files | `fullContent` directly |
| 10-30 files | `metadata` → `partialContent` (3-5 files) |
| 30+ files | `metadata` → analyze commits → `partialContent` (2-3 files) |
