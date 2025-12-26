# Workflow Patterns

Common research flows for different investigation types.

---

## 1. Package Investigation

**Goal:** Understand how a package works internally.

```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

**Atomic Steps:**
1.  **Locate**: Find the correct repo URL.
2.  **Map**: specific directory structure (don't map everything).
3.  **Entry**: Find the main entry point (package.json `main` or index file).
4.  **Read**: Get the actual content of the entry file.

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

**Pattern:** Trace from *User Surface* → *Internal Logic* → *Data Layer*.

```
githubSearchCode(surface) → githubGetFileContent → trace imports → repeat
```

**Atomic Steps:**
1.  **Surface**: Find the public API/Component (e.g. `useState`).
2.  **Definition**: Read the function definition.
3.  **Dependency**: Identify *one* key internal dependency (e.g. `resolveDispatcher`).
4.  **Trace**: Search for that dependency's definition.
5.  **Repeat**: Continue until you hit the bottom (primitive or external lib).

```json
// 1. Find feature surface
{ "keywordsToSearch": ["useState"], "match": "file", "path": "packages/react" }

// 2. Read definition (The Gate: Read before assuming)
{ "path": "packages/react/src/ReactHooks.js", "matchString": "export function useState" }

// 3. Trace dependency
{ "keywordsToSearch": ["resolveDispatcher"], "match": "file" }
```

---

## 3. Bug Investigation

**Goal:** Find root cause of a bug.

```
githubSearchCode(error) → githubGetFileContent → githubSearchPullRequests
```

**Atomic Steps:**
1.  **Locate Error**: Find where the error string/code is defined.
2.  **Read Context**: Read the condition *causing* the error.
3.  **Blame/History**: Who changed this last and why?

```json
// 1. Find error source
{ "keywordsToSearch": ["ENOENT"], "match": "file" }

// 2. Read context
{ "path": "src/utils/fileReader.ts", "matchString": "ENOENT" }

// 3. Check history (Why was this added?)
{ "query": "file reader", "merged": true, "type": "metadata" }
```

---

## 4. Local: Explore-First

**Use when:** Entry points unclear, new codebase.

```
local_view_structure → drill down → local_ripgrep → local_fetch_content
```

1.  **Map Root**: See top-level folders.
2.  **Drill Down**: Pick *one* relevant folder (e.g. `src`).
3.  **Search**: Look for architectural keywords (`App`, `Server`, `Main`).
4.  **Read**: detailed implementation.

---

## 5. Local: Search-First

**Use when:** Know WHAT, not WHERE.

```
local_ripgrep(filesOnly) → local_fetch_content
```

1.  **Discovery**: Find *files* containing the term (fast).
2.  **Target**: Pick the most likely file.
3.  **Read**: Read specific function.

---

## The Verification Gate

**BEFORE claiming a finding, pass this gate:**

1.  **IDENTIFY**: What exact lines of code prove this?
2.  **FETCH**: Did you read the *actual file content*? (Search snippets don't count)
3.  **VERIFY**: Does the logic actually do what you think?
4.  **CHECK DATES**: Is this code from 5 years ago?
5.  **ONLY THEN**: Output the finding.

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
| **Citing Search Results** | **Citing File Content** (Read the file!) |
| **"I assume..."** | **"The code shows..."** |
| **"Should work like..."** | **"Logic implements..."** |
| **Broad Search (`auth`)** | **Targeted Search (`class AuthService`)** |
| **Ignoring Dates** | **Checking `lastModified`** |

---

## Checklist

- [ ] **Goal defined?** (Atomic question)
- [ ] **Code evidence found?** (Line numbers)
- [ ] **The Gate passed?** (Read full content)
- [ ] **Cross-referenced?** (Imports/Usage)
- [ ] **Updated dates checked?**
- [ ] **Gaps documented?**
