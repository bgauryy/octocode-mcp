# Workflow Patterns

Common research flows for different investigation types.

---

## Local-First Patterns

### 1. Explore-First (Unknown Codebase)

**Use when**: Entry points unclear, mixed tech, new repo.

```
localViewStructure(depth=1) → drill dirs(depth=2) → localSearchCode → localGetFileContent
```

**Steps:**
1. **Map Root**: View top-level folders (`depth: 1`)
2. **Drill Down**: Pick one relevant folder (e.g., `src`)
3. **Search**: Look for architectural keywords (`App`, `Server`, `Main`)
4. **Read**: Get content of entry file

```json
// 1. Map root
{ "path": "", "depth": 1 }

// 2. Drill into src
{ "path": "src", "depth": 2 }

// 3. Find entry points
{ "pattern": "createServer|createApp", "path": "src", "filesOnly": true }

// 4. Read implementation
{ "path": "src/index.ts", "matchString": "createApp" }
```

**Pitfall**: Diving deep without map → keep breadth-first.

---

### 2. Search-First (Know WHAT, not WHERE)

**Use when**: Feature name, error keyword, class/function known.

```
localSearchCode(filesOnly=true) → localGetFileContent(matchString)
```

**Steps:**
1. **Discovery**: Find files containing the term (fast)
2. **Target**: Pick the most likely file
3. **Read**: Read specific function with context

```json
// 1. Discovery
{ "pattern": "AuthService", "path": "src", "type": "ts", "filesOnly": true }

// 2. Read implementation
{ "path": "src/auth/AuthService.ts", "matchString": "class AuthService", "matchStringContextLines": 20 }
```

**Pitfall**: Reading full files; prefer `matchString` + small context windows.

---

### 3. Trace-from-Match (Follow the Trail)

**Use when**: Found definition, need impact graph (imports/usages).

```
localSearchCode(symbol) → localGetFileContent → localSearchCode(usages) → iterate
```

**Steps:**
1. **Find Definition**: Search for the symbol
2. **Read Implementation**: Get context
3. **Trace Usages**: Search for imports/calls
4. **Iterate**: Follow 1-3 focused branches (cap depth)

```json
// 1. Find definition
{ "pattern": "export.*useAuth", "path": "src", "filesOnly": true }

// 2. Read implementation
{ "path": "src/hooks/useAuth.ts", "matchString": "export function useAuth" }

// 3. Find usages
{ "pattern": "import.*useAuth|useAuth\\(", "path": "src", "filesOnly": true }
```

**Pitfall**: Unlimited fan-out; cap depth and batch size.

---

### 4. Metadata-Driven (Recent Changes)

**Use when**: Debugging recent breaks, finding config files, large files.

```
localFindFiles(modifiedWithin/size) → localGetFileContent
```

**Steps:**
1. **Filter**: Find files by metadata (time, size, type)
2. **Read**: Examine content of candidates

```json
// Find recently modified TypeScript files
{ "path": "src", "name": "*.ts", "modifiedWithin": "7d" }

// Find large files that might need attention
{ "path": "", "sizeGreater": "100K", "type": "f" }
```

---

### 5. node_modules Inspection

**Use when**: Debugging dependency behavior, understanding library internals.

```
localSearchCode(noIgnore=true) → localGetFileContent → compare with GitHub source
```

**Steps:**
1. **Search Inside**: Use `noIgnore: true` to search node_modules
2. **Read Local**: Get content from installed version
3. **Cross-Reference**: Compare with canonical GitHub source

```json
// 1. Search inside dependency
{ "pattern": "createContext", "path": "node_modules/react", "noIgnore": true }

// 2. Read local implementation
{ "path": "node_modules/react/cjs/react.development.js", "matchString": "createContext" }

// 3. Compare with canonical (use GitHub tools)
```

---

## GitHub Patterns

### 6. Package Investigation

**Goal**: Understand how a package works internally.

```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
```

**Steps:**
1. **Locate**: Find the correct repo URL
2. **Map**: View directory structure (don't map everything)
3. **Entry**: Find the main entry point (`package.json` main or index file)
4. **Read**: Get actual content of the entry file

```json
// 1. Find repo
{ "name": "express", "ecosystem": "npm" }

// 2. Map structure
{ "owner": "expressjs", "repo": "express", "branch": "master", "depth": 1 }

// 3. Find entry
{ "keywordsToSearch": ["index.js"], "match": "path", "owner": "expressjs", "repo": "express" }

// 4. Read implementation
{ "owner": "expressjs", "repo": "express", "path": "lib/express.js", "matchString": "createApplication" }
```

---

### 7. Implementation Tracing (Remote)

**Goal**: Understand how a feature is implemented in an external library.

**Pattern**: Trace from *User Surface* → *Internal Logic* → *Data Layer*.

```
githubSearchCode(surface) → githubGetFileContent → trace imports → repeat
```

**Steps:**
1. **Surface**: Find the public API/Component (e.g., `useState`)
2. **Definition**: Read the function definition
3. **Dependency**: Identify one key internal dependency
4. **Trace**: Search for that dependency's definition
5. **Repeat**: Continue until you hit the bottom

```json
// 1. Find feature surface
{ "keywordsToSearch": ["useState"], "match": "file", "path": "packages/react", "owner": "facebook", "repo": "react" }

// 2. Read definition (The Gate: Read before assuming)
{ "owner": "facebook", "repo": "react", "path": "packages/react/src/ReactHooks.js", "matchString": "export function useState" }

// 3. Trace dependency
{ "keywordsToSearch": ["resolveDispatcher"], "match": "file", "owner": "facebook", "repo": "react" }
```

---

### 8. Bug Investigation

**Goal**: Find root cause of a bug.

```
githubSearchCode(error) → githubGetFileContent → githubSearchPullRequests
```

**Steps:**
1. **Locate Error**: Find where the error string/code is defined
2. **Read Context**: Read the condition causing the error
3. **Blame/History**: Who changed this last and why?

```json
// 1. Find error source
{ "keywordsToSearch": ["ENOENT"], "match": "file", "owner": "nodejs", "repo": "node" }

// 2. Read context
{ "owner": "nodejs", "repo": "node", "path": "lib/fs.js", "matchString": "ENOENT" }

// 3. Check history
{ "query": "file reader ENOENT", "owner": "nodejs", "repo": "node", "merged": true, "type": "metadata" }
```

---

## Cross-Domain Patterns

### 9. Local → GitHub (Upstream Research)

**Use when**: Local code uses a dependency, need canonical source.

```
localSearchCode → packageSearch → githubViewRepoStructure → githubGetFileContent
```

```json
// 1. Find import in local code
{ "pattern": "import.*from 'axios'", "path": "src", "filesOnly": true }

// 2. Find package repo
{ "name": "axios", "ecosystem": "npm" }

// 3. Explore upstream
{ "owner": "axios", "repo": "axios", "branch": "v1.x", "depth": 1 }

// 4. Read canonical implementation
{ "owner": "axios", "repo": "axios", "path": "lib/core/Axios.js", "matchString": "class Axios" }
```

### 10. GitHub → Local (Impact Analysis)

**Use when**: Found upstream change, check local impact.

```
githubSearchPullRequests → extract changed patterns → localSearchCode
```

```json
// 1. Find breaking change PR
{ "query": "breaking change v2", "owner": "some-lib", "repo": "lib", "merged": true }

// 2. Get changed API (from PR)
// → Extracted: "oldMethod renamed to newMethod"

// 3. Check local usage
{ "pattern": "oldMethod", "path": "src", "filesOnly": true }
```

---

## The Verification Gate

**BEFORE claiming a finding, pass this gate:**

1. **IDENTIFY**: What exact lines of code prove this?
2. **FETCH**: Did you read the *actual file content*? (Search snippets don't count)
3. **VERIFY**: Does the logic actually do what you think?
4. **CHECK DATES**: Is this code from 5 years ago?
5. **ONLY THEN**: Output the finding.

---

## Batch Queries

Parallelize independent searches (max 3 GitHub, max 5 local):

```json
{
  "queries": [
    { "pattern": "AuthService", "path": "src", "filesOnly": true },
    { "pattern": "authMiddleware", "path": "src", "filesOnly": true },
    { "pattern": "AuthUser", "path": "src", "filesOnly": true }
  ]
}
```

---

## Anti-Patterns

| Bad | Good |
|-----|------|
| **Citing Search Results** | **Citing File Content** (Read the file!) |
| **"I assume..."** | **"The code shows..."** |
| **"Should work like..."** | **"Logic implements..."** |
| **Broad Search (`auth`)** | **Targeted Search (`class AuthService`)** |
| **Ignoring Dates** | **Checking `lastModified`** |
| **Shell commands for search** | **Local tools with pagination** |
| **Full file dumps** | **matchString + context** |

---

## Checklist

- [ ] **Goal defined?** (Atomic question)
- [ ] **Local-first?** (Checked workspace before GitHub)
- [ ] **Code evidence found?** (Line numbers/paths)
- [ ] **The Gate passed?** (Read full content)
- [ ] **Cross-referenced?** (Imports/Usage)
- [ ] **Updated dates checked?**
- [ ] **Gaps documented?**
