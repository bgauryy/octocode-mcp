# Tool Reference - Implementation Agent

Complete parameter reference for implementation-focused tool usage.

**Required Fields (ALL queries)**: `mainResearchGoal`, `researchGoal`, `reasoning`

---

## Local Tools (PRIMARY - Always Prefer)

### localViewStructure

Map codebase architecture before diving in.

```typescript
{
  path: string;                    // Directory path (required)
  depth?: number;                  // 1-5 (default 1)
  entriesPerPage?: number;         // ≤20
  entryPageNumber?: number;        // Pagination
  details?: boolean;               // Show file sizes
  hidden?: boolean;                // Include dotfiles
  extensions?: string[];           // Filter by extension
  pattern?: string;                // Filter by name pattern
  filesOnly?: boolean;
  directoriesOnly?: boolean;
  sortBy?: "name" | "size" | "time" | "extension";
}
```

**Implementation Tips:**
- Start `depth: 1` at root to understand project structure
- Use `depth: 2` on `src/` to see feature organization
- Check for monorepo patterns: `packages/`, `apps/`, `libs/`
- Note test directory structure for later

---

### localSearchCode

Find implementations, usages, and patterns.

```typescript
{
  pattern: string;                 // Search pattern (required)
  path: string;                    // Search root (required)
  filesOnly?: boolean;             // Discovery mode - list files only
  type?: string;                   // "ts", "py", "js" etc
  include?: string[];              // Glob patterns to include
  exclude?: string[];              // Glob patterns to exclude
  excludeDir?: string[];           // Directories to skip
  noIgnore?: boolean;              // Search inside node_modules
  matchesPerPage?: number;         // 1-100
  filesPerPage?: number;           // ≤20
  filePageNumber?: number;         // Pagination
  contextLines?: number;           // Lines around match
  caseSensitive?: boolean;
  wholeWord?: boolean;
  multiline?: boolean;
}
```

**Implementation Tips:**
- `filesOnly: true` first for discovery (fast, token-efficient)
- Search for similar features: `export.*function.*CreateUser`
- Find tests: `describe.*"UserService"`
- Find types: `interface.*User|type.*User`
- Use `contextLines: 3` to see surrounding code

**Pattern Search Examples:**
```typescript
// Find feature implementations
{ pattern: "export class.*Service", path: "src", type: "ts", filesOnly: true }

// Find tests for a feature
{ pattern: "describe.*UserService", path: "tests", type: "ts" }

// Find error handling patterns
{ pattern: "catch.*Error|throw new", path: "src", type: "ts" }

// Find API endpoints
{ pattern: "@(Get|Post|Put|Delete)\\(", path: "src", type: "ts" }

// Find React components
{ pattern: "export.*function.*Component|export const.*:.*FC", path: "src", type: "tsx" }
```

---

### localGetFileContent

Read implementation details with precision.

```typescript
{
  path: string;                    // File path (required)
  // Choose ONE strategy:
  matchString?: string;            // Pattern to find
  matchStringContextLines?: number; // 1-50 lines of context
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;
  charOffset?: number;             // BYTE offset for pagination
  charLength?: number;             // BYTES to read (2000-4000 recommended)
  startLine?: number;              // Line range
  endLine?: number;
  fullContent?: boolean;           // Small files only (<100 lines)
}
```

**Implementation Tips:**
- Use `matchString` + `matchStringContextLines: 20` for functions
- Use `startLine`/`endLine` when you know the location
- `fullContent: true` only for small config files
- For large files, use multiple `matchString` calls

**Reading Examples:**
```typescript
// Read a specific function
{ path: "src/service.ts", matchString: "async function processData", matchStringContextLines: 30 }

// Read a class definition
{ path: "src/models/User.ts", matchString: "export class User", matchStringContextLines: 50 }

// Read test structure
{ path: "tests/service.test.ts", matchString: "describe.*Service", matchStringContextLines: 40 }

// Read config file entirely
{ path: "tsconfig.json", fullContent: true }
```

---

### localFindFiles

Find files by metadata for targeted investigation.

```typescript
{
  path: string;                    // Search root (required)
  name?: string;                   // "*.ts" pattern
  iname?: string;                  // Case-insensitive name
  names?: string[];                // Multiple patterns
  type?: "f" | "d" | "l";          // file/directory/link
  modifiedWithin?: string;         // "7d", "2h", "30m"
  modifiedBefore?: string;
  sizeGreater?: string;            // "10M", "1K"
  sizeLess?: string;
  excludeDir?: string[];
  maxDepth?: number;               // 1-10
  filesPerPage?: number;           // ≤20
  filePageNumber?: number;
}
```

**Implementation Tips:**
- Find recently changed files: `modifiedWithin: "1d"`
- Find config files: `names: ["*.config.*", "*.json"]`
- Find large files that might need breaking up: `sizeGreater: "200K"`

---

## LSP Tools (Semantic Code Intelligence)

### lspGotoDefinition

Navigate to symbol definitions - essential for tracing imports.

```typescript
{
  uri: string;                     // File path (required)
  symbolName: string;              // EXACT symbol name (required)
  lineHint: number;                // 1-indexed line number (required)
  orderHint?: number;              // 0-indexed if multiple on same line
  contextLines?: number;           // Lines around definition (0-20)
}
```

**Implementation Tips:**
- Use when you see `import { X } from './module'` → trace X's definition
- `lineHint` must be within ±2 lines of actual location
- `symbolName` must be EXACT text, not partial

**Example:**
```typescript
// Trace an import
{ uri: "src/service.ts", symbolName: "UserRepository", lineHint: 3, contextLines: 10 }

// Find type definition
{ uri: "src/handlers/user.ts", symbolName: "UserDTO", lineHint: 5 }
```

---

### lspFindReferences

Find all usages of a symbol - critical for impact analysis.

```typescript
{
  uri: string;                     // File path (required)
  symbolName: string;              // EXACT symbol name (required)
  lineHint: number;                // 1-indexed line (required)
  includeDeclaration?: boolean;    // Include definition (default true)
  orderHint?: number;
  contextLines?: number;           // 0-10
  referencesPerPage?: number;      // 1-50
  page?: number;
}
```

**Implementation Tips:**
- **ALWAYS run before modifying public APIs**
- Use `includeDeclaration: false` to see only usages
- Check all pages if many references

**Example:**
```typescript
// Find all usages of a function before changing it
{ uri: "src/utils.ts", symbolName: "formatDate", lineHint: 15, includeDeclaration: false }

// Find all callers of an API
{ uri: "src/api/users.ts", symbolName: "getUser", lineHint: 42, contextLines: 3 }
```

---

### lspCallHierarchy

Trace function call relationships - understand data flow.

```typescript
{
  uri: string;                     // File path (required)
  symbolName: string;              // Function name (required)
  lineHint: number;                // 1-indexed (required)
  direction: "incoming" | "outgoing"; // (required)
  depth?: number;                  // 1-3 (default 1)
  orderHint?: number;
  contextLines?: number;           // 0-10
  callsPerPage?: number;           // 1-30
  page?: number;
}
```

**Implementation Tips:**
- `direction: "incoming"` → "Who calls this function?"
- `direction: "outgoing"` → "What does this function call?"
- Use `depth: 2` to see transitive calls
- Limit depth to avoid timeout on hot paths

**Example:**
```typescript
// Who calls this function?
{ uri: "src/auth/validate.ts", symbolName: "validateToken", lineHint: 20, direction: "incoming" }

// What does this function depend on?
{ uri: "src/handlers/order.ts", symbolName: "processOrder", lineHint: 50, direction: "outgoing", depth: 2 }
```

---

## GitHub Tools (When Patterns Not Found Locally)

### packageSearch

Find package repo locations for upstream research.

```typescript
{
  name: string;                    // Package name (required)
  ecosystem: "npm" | "python";     // Registry (required)
  searchLimit?: number;            // 1-10
  npmFetchMetadata?: boolean;
  pythonFetchMetadata?: boolean;
}
```

**Use When:**
- Need to understand how a dependency works internally
- Looking for canonical implementation patterns
- Debugging library behavior

---

### githubSearchCode

Find patterns in external repositories.

```typescript
{
  keywordsToSearch: string[];      // Search terms (required)
  match: "file" | "path";          // Content vs paths (required)
  owner?: string;                  // Org filter
  repo?: string;                   // Repo filter
  path?: string;                   // Directory filter
  extension?: string;              // File type
  filename?: string;
  limit?: number;                  // 1-100
}
```

**Use When:**
- Can't find pattern in local codebase
- Need reference implementation from upstream
- Researching library usage patterns

---

### githubGetFileContent

Read file content from GitHub repositories.

```typescript
{
  owner: string;                   // (required)
  repo: string;                    // (required)
  path: string;                    // (required)
  branch?: string;
  matchString?: string;
  matchStringContextLines?: number;
  fullContent?: boolean;           // Small files only
}
```

**Use When:**
- Need to read upstream source code
- Comparing local node_modules with canonical
- Finding reference implementations

---

## Implementation-Specific Patterns

### Before Modifying Any Code

```typescript
// 1. Find all references
{ uri: "src/target.ts", symbolName: "functionToModify", lineHint: N, includeDeclaration: false }

// 2. Understand incoming calls
{ uri: "src/target.ts", symbolName: "functionToModify", lineHint: N, direction: "incoming" }

// 3. Understand outgoing dependencies
{ uri: "src/target.ts", symbolName: "functionToModify", lineHint: N, direction: "outgoing" }
```

### Finding Similar Implementations

```typescript
// 1. Search for similar features
{ pattern: "export.*function.*Similar", path: "src", filesOnly: true }

// 2. Read the implementation
{ path: "src/found/file.ts", matchString: "export function similar", matchStringContextLines: 40 }

// 3. Find its tests
{ pattern: "describe.*Similar|test.*similar", path: "tests", filesOnly: true }
```

### Understanding Test Patterns

```typescript
// 1. Find test file
{ pattern: "describe.*TargetFeature", path: "tests", type: "ts", filesOnly: true }

// 2. Read test structure
{ path: "tests/target.test.ts", matchString: "describe", matchStringContextLines: 50 }

// 3. Find mock patterns
{ pattern: "mock|jest\\.fn|vi\\.fn|spy", path: "tests/target.test.ts" }
```

---

## Query Batching

- Local tools: Max 5 queries per call
- GitHub tools: Max 3 queries per call
- LSP tools: Max 5 queries per call

**Parallel Research Example:**
```typescript
{
  "queries": [
    { "pattern": "AuthService", "path": "src", "filesOnly": true },
    { "pattern": "UserService", "path": "src", "filesOnly": true },
    { "pattern": "describe.*Auth|describe.*User", "path": "tests", "filesOnly": true }
  ]
}
```

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| Empty results | Try semantic variants, broaden path |
| Too many results | Add filters (type, path, extension) |
| File too large | Use `matchString` or `charLength` |
| Symbol not found (LSP) | Verify exact name, check lineHint |
| Definition in node_modules | Use `packageSearch` → GitHub tools |

