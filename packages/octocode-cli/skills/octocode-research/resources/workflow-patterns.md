# Workflow Patterns

Common research flows for different investigation types.

---

## 1. Package Investigation

**Goal:** Understand how a package works internally.

```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

```json
// 1. Find repo
{ "name": "express", "ecosystem": "npm" }

// 2. Map structure
{ "owner": "expressjs", "repo": "express", "branch": "master", "depth": 1 }

// 3. Find entry
{ "keywordsToSearch": ["index.js"], "match": "path" }

// 4. Read implementation
{ "path": "lib/express.js", "matchString": "createApplication" }
```

---

## 2. Implementation Tracing

**Goal:** Understand how a feature is implemented.

```
githubSearchCode → githubGetFileContent → trace imports → repeat
```

```json
// 1. Find feature
{ "keywordsToSearch": ["useState"], "match": "file", "path": "packages/react" }

// 2. Read definition
{ "path": "packages/react/src/ReactHooks.js", "matchString": "export function useState" }

// 3. Trace dependencies
{ "keywordsToSearch": ["resolveDispatcher"], "match": "file" }
```

---

## 3. Bug Investigation

**Goal:** Find root cause of a bug.

```
githubSearchCode(error) → githubGetFileContent → githubSearchPullRequests
```

```json
// 1. Find error source
{ "keywordsToSearch": ["ENOENT"], "match": "file" }

// 2. Read context
{ "path": "src/utils/fileReader.ts", "matchString": "ENOENT" }

// 3. Check history
{ "query": "file reader", "merged": true, "type": "metadata" }
```

---

## 4. Local: Explore-First

**Use when:** Entry points unclear, new codebase.

```
local_view_structure → drill down → local_ripgrep → local_fetch_content
```

```json
// 1. Map root
{ "path": "/project", "depth": 1 }

// 2. Drill into src
{ "path": "/project/src", "depth": 2 }

// 3. Search pattern
{ "pattern": "main|bootstrap", "path": "/project/src", "filesOnly": true }

// 4. Read
{ "path": "/project/src/index.ts", "matchString": "export" }
```

---

## 5. Local: Search-First

**Use when:** Know WHAT, not WHERE.

```
local_ripgrep(filesOnly) → local_fetch_content
```

```json
// 1. Discovery
{ "pattern": "useAuth", "path": "/project/src", "filesOnly": true, "type": "ts" }

// 2. Read
{ "path": "/project/src/hooks/useAuth.ts", "matchString": "export function useAuth" }
```

---

## 6. Local: Recent Changes

**Use when:** Chasing regressions.

```
local_find_files(modifiedWithin) → local_ripgrep → local_fetch_content
```

```json
// 1. Find recent
{ "path": "/project/src", "modifiedWithin": "7d", "type": "f" }

// 2. Search issues
{ "pattern": "TODO|FIXME", "path": "/project/src" }
```

---

## Batch Queries

Max 3 queries per call. Parallelize independent searches:

```json
{
  "queries": [
    { "keywordsToSearch": ["AuthService"], "match": "file" },
    { "keywordsToSearch": ["authMiddleware"], "match": "file" },
    { "keywordsToSearch": ["AuthUser"], "match": "file" }
  ]
}
```

---

## Anti-Patterns

| ❌ Bad | ✅ Good |
|--------|---------|
| Assume path exists | Search first |
| `fullContent: true` | `matchString` with context |
| Repeat same query | Try semantic variant |
| 10 queries for simple lookup | 2-3 targeted queries |

---

## Checklist

- [ ] Goal defined?
- [ ] Code evidence found?
- [ ] Cross-referenced?
- [ ] Updated dates checked?
- [ ] Gaps documented?

