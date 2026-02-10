# Local Tools Reference

Complete parameter reference for Octocode Local tools.

**Required Fields (ALL queries)**: `mainResearchGoal`, `researchGoal`, `reasoning`

---

## localViewStructure

Explore local directory structure with filtering and sorting.

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
  summary?: boolean;               // Include summary stats
  showFileLastModified?: boolean;  // Show modification times
}
```

**Tips:**
- Start `depth: 1` at root, drill with `depth: 2` on specific dirs
- Use `details: true` to see file sizes
- Check `packages/` or `apps/` for monorepos
- Use `sortBy: "time"` to find recently modified

**Example Queries:**
```json
// Map root structure
{ "path": "", "depth": 1, "summary": true }

// Drill into src with file details
{ "path": "src", "depth": 2, "details": true }

// Find TypeScript files only
{ "path": "src", "extensions": ["ts", "tsx"], "filesOnly": true }

// Show recently modified
{ "path": "", "sortBy": "time", "showFileLastModified": true }
```

---

## localSearchCode

Fast pattern search with discovery mode and pagination.

```typescript
{
  pattern: string;                 // Search pattern (required)
  path: string;                    // Search root (required)
  filesOnly?: boolean;             // Discovery mode - just list files
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
  caseInsensitive?: boolean;
  smartCase?: boolean;             // Default: true (case-sensitive if pattern has uppercase)
  wholeWord?: boolean;
  multiline?: boolean;
  fixedString?: boolean;           // Treat pattern as literal string
  mode?: "discovery" | "paginated" | "detailed";
  matchContentLength?: number;     // Max chars per match (default 200)
}
```

**Tips:**
- **Start with `filesOnly: true`** for discovery (fast, token-efficient)
- Use `noIgnore: true` to search inside `node_modules`
- Use `type` for common file extensions
- Returns `location.charOffset/charLength` as BYTE offsets (ripgrep)
- Use `fixedString: true` for special characters in pattern

**Discovery vs Content Search:**
```json
// Discovery mode - find files containing pattern (fast)
{ "pattern": "AuthService", "path": "src", "filesOnly": true }

// Content search - get match context
{ "pattern": "AuthService", "path": "src", "contextLines": 3 }
```

**node_modules Inspection:**
```json
// Search inside React
{ "pattern": "createContext", "path": "node_modules/react", "noIgnore": true }

// Search specific dependency
{ "pattern": "Router", "path": "node_modules/react-router", "noIgnore": true, "filesOnly": true }
```

**Filtering Examples:**
```json
// TypeScript files only
{ "pattern": "export", "path": "src", "type": "ts" }

// Exclude test files
{ "pattern": "fetchData", "path": "src", "exclude": ["*.test.ts", "*.spec.ts"] }

// Exclude directories
{ "pattern": "config", "path": "", "excludeDir": ["node_modules", "dist", "coverage"] }
```

---

## localGetFileContent

Read local file content with targeted extraction.

```typescript
{
  path: string;                    // File path (required)
  
  // Choose ONE strategy:
  matchString?: string;            // Pattern to find
  matchStringContextLines?: number; // 1-50 lines of context
  matchStringIsRegex?: boolean;
  matchStringCaseSensitive?: boolean;
  
  charOffset?: number;             // BYTE offset for pagination
  charLength?: number;             // BYTES to read (1000-4000 recommended)
  
  startLine?: number;              // Line range
  endLine?: number;
  
  fullContent?: boolean;           // Small files only (<10KB)
}
```

**Tips:**
- **Prefer `matchString` over `fullContent`** for token efficiency
- `charOffset`/`charLength` are BYTES, not characters
- Use `charLength: 2000-4000` for pagination windows
- Large files require `charLength` or `matchString`

**Strategy Selection:**
| Scenario | Strategy | Example |
|----------|----------|---------|
| Know function name | `matchString` | `{ matchString: "export function useAuth", matchStringContextLines: 20 }` |
| Know exact lines | `startLine/endLine` | `{ startLine: 1, endLine: 50 }` |
| Small config files | `fullContent` | `{ fullContent: true }` |
| Large file pagination | `charLength/charOffset` | `{ charLength: 3000, charOffset: 0 }` |

**Example Queries:**
```json
// Find function with context
{ "path": "src/auth/useAuth.ts", "matchString": "export function useAuth", "matchStringContextLines": 25 }

// Read first 50 lines
{ "path": "src/index.ts", "startLine": 1, "endLine": 50 }

// Read small config
{ "path": "package.json", "fullContent": true }

// Paginate large file (first window)
{ "path": "dist/bundle.js", "charLength": 4000, "charOffset": 0 }

// Paginate large file (next window)
{ "path": "dist/bundle.js", "charLength": 4000, "charOffset": 4000 }
```

---

## localFindFiles

Find files by metadata (name, time, size, permissions).

```typescript
{
  path: string;                    // Search root (required)
  name?: string;                   // "*.ts" pattern
  iname?: string;                  // Case-insensitive name
  names?: string[];                // Multiple patterns
  type?: "f" | "d" | "l";          // file/directory/link
  modifiedWithin?: string;         // "7d", "2h", "30m"
  modifiedBefore?: string;
  accessedWithin?: string;
  sizeGreater?: string;            // "10M", "1K"
  sizeLess?: string;
  excludeDir?: string[];
  maxDepth?: number;               // 1-10
  minDepth?: number;               // 0-10
  filesPerPage?: number;           // ≤20
  filePageNumber?: number;
  details?: boolean;               // Show file metadata
  showFileLastModified?: boolean;  // Default: true
  pathPattern?: string;            // Path pattern match
  regex?: string;                  // Regex file name match
  empty?: boolean;                 // Find empty files
  executable?: boolean;            // Find executable files
}
```

**Tips:**
- Results sorted by modified time (most recent first)
- Use `modifiedWithin: "7d"` to find recent changes
- Combine with `localGetFileContent` or `localSearchCode` for content
- Time suffixes: `d` (days), `h` (hours), `m` (minutes)
- Size suffixes: `K` (kilobytes), `M` (megabytes), `G` (gigabytes)

**Example Queries:**
```json
// Recent TypeScript changes
{ "path": "src", "name": "*.ts", "modifiedWithin": "7d" }

// Large files needing attention
{ "path": "", "sizeGreater": "100K", "type": "f" }

// Config files
{ "path": "", "names": ["*.json", "*.yaml", "*.yml"], "maxDepth": 2 }

// Empty files (potential issues)
{ "path": "src", "empty": true, "type": "f" }

// Recently accessed
{ "path": "src", "accessedWithin": "1d" }
```

---

## Query Batching

Parallelize independent searches (max 5 queries per call):

```json
{
  "queries": [
    { "pattern": "AuthService", "path": "src", "filesOnly": true },
    { "pattern": "authMiddleware", "path": "src", "filesOnly": true },
    { "pattern": "AuthUser", "path": "src", "filesOnly": true },
    { "pattern": "useAuth", "path": "src", "filesOnly": true },
    { "pattern": "authContext", "path": "src", "filesOnly": true }
  ]
}
```

**Benefits:**
- Single network round-trip
- Parallel execution
- Combined results with hints

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| Empty results | Try semantic variants (auth → login, security, credentials) |
| Too many results | Add filters (path, type, include, excludeDir) |
| File too large | Use `matchString` or `charLength` pagination |
| Path not found | Verify with `localViewStructure` first |
| Path is directory | Use `localViewStructure` instead |
| .gitignore blocking | Use `noIgnore: true` (for node_modules) |
| Special chars in pattern | Use `fixedString: true` |

---

## Common Patterns

### 1. Discovery → Read Pattern
```json
// Step 1: Find files
{ "pattern": "useAuth", "path": "src", "filesOnly": true }

// Step 2: Read implementation (from step 1 results)
{ "path": "src/hooks/useAuth.ts", "matchString": "export function useAuth", "matchStringContextLines": 20 }
```

### 2. Trace Imports Pattern
```json
// Step 1: Find import
{ "pattern": "import.*from 'axios'", "path": "src", "filesOnly": true }

// Step 2: Check node_modules
{ "pattern": "export default axios", "path": "node_modules/axios/lib", "noIgnore": true }
```

### 3. Recent Changes Pattern
```json
// Step 1: Find recent files
{ "path": "src", "name": "*.ts", "modifiedWithin": "3d" }

// Step 2: Search within those files
{ "pattern": "TODO|FIXME", "path": "src/auth", "contextLines": 2 }
```

### 4. Large File Pagination
```json
// Window 1
{ "path": "dist/bundle.js", "charLength": 4000, "charOffset": 0 }

// Window 2
{ "path": "dist/bundle.js", "charLength": 4000, "charOffset": 4000 }

// Window 3
{ "path": "dist/bundle.js", "charLength": 4000, "charOffset": 8000 }
```

---

## Anti-Patterns

| Bad | Good |
|-----|------|
| `fullContent: true` on large files | `matchString` or `charLength` |
| Shell `grep` command | `localSearchCode` |
| Shell `find` command | `localFindFiles` |
| Shell `cat` command | `localGetFileContent` |
| Reading entire codebase | Targeted discovery then content |
| Ignoring hints | Follow hints for next steps |
| Hard-coded paths | Verify with `localViewStructure` |

