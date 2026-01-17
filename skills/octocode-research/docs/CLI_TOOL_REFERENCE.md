# CLI Tool Reference - All Tools with Full Schema Support

> **All 13 tools support full schema parameters via GET endpoints**  
> The CLI syntax `./cli toolName param1=value1 param2=value2` maps to `GET /{toolName}?param1=value1&param2=value2`

## Table of Contents

1. [CLI Usage](#cli-usage)
2. [Local Tools](#local-tools-4)
3. [LSP Tools](#lsp-tools-3)
4. [GitHub Tools](#github-tools-5)
5. [Package Tools](#package-tools-1)

---

## CLI Usage

### Basic Syntax

```bash
./cli <toolName> param1=value1 param2=value2 [--json] [--quiet]
```

### How It Works

The command `./cli search pattern="auth" type="ts"` means:

| Part | Meaning |
|------|---------|
| `./cli` | The CLI wrapper script |
| `search` | Alias for `localSearchCode` (see [Aliases](#aliases)) |
| `pattern="auth"` | Search for "auth" pattern |
| `type="ts"` | Filter to TypeScript files only |

**HTTP equivalent:** `GET http://localhost:1987/localSearchCode?pattern=auth&type=ts`

### Direct Tool Calls

All 13 tools can be called by their exact name:

```bash
./cli localSearchCode pattern="auth" path="/path/to/project"
./cli githubSearchCode owner="facebook" repo="react" keywordsToSearch="useState"
./cli lspGotoDefinition uri="/path/file.ts" symbolName="MyClass" lineHint=42
```

---

## Local Tools (4)

### 1. `localSearchCode`

Search code with ripgrep. Powerful pattern matching across files.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | string | Search pattern (regex or literal) |
| `path` | string | Directory to search in |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | - | File type filter (e.g., "ts", "py", "js") |
| `fixedString` | boolean | false | Treat pattern as literal string |
| `caseSensitive` | boolean | false | Case-sensitive search |
| `wholeWord` | boolean | false | Match whole words only |
| `filesOnly` | boolean | false | Return only file paths (fast discovery) |
| `contextLines` | number | 0 | Lines of context around match |
| `maxMatchesPerFile` | number | - | Limit matches per file |
| `filesPerPage` | number | 10 | Pagination: files per page |
| `filePageNumber` | number | 1 | Pagination: page number |
| `include` | string | - | Glob patterns to include (comma-separated) |
| `exclude` | string | - | Glob patterns to exclude (comma-separated) |
| `hidden` | boolean | false | Include hidden files |
| `mode` | enum | - | Preset: "discovery", "paginated", "detailed" |

**Examples:**

```bash
# Basic search
./cli localSearchCode pattern="authenticate" path="/Users/me/project"

# TypeScript files only
./cli localSearchCode pattern="export function" path="/src" type="ts"

# Discovery mode (fast, files only)
./cli localSearchCode pattern="TODO" path="." mode="discovery"

# With context lines
./cli localSearchCode pattern="handleError" path="/src" contextLines=3

# Case-insensitive whole word
./cli localSearchCode pattern="user" path="." caseSensitive=false wholeWord=true

# Exclude node_modules and tests
./cli localSearchCode pattern="config" path="." exclude="node_modules,**/*.test.ts"
```

---

### 2. `localGetFileContent`

Read file contents with various extraction modes.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Path to the file |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fullContent` | boolean | false | Read entire file |
| `startLine` | number | - | Start line (1-indexed) |
| `endLine` | number | - | End line (1-indexed) |
| `matchString` | string | - | Find and show around this string |
| `matchStringContextLines` | number | 5 | Context lines around matchString |
| `matchStringIsRegex` | boolean | false | Treat matchString as regex |
| `charOffset` | number | - | Character offset for pagination |
| `charLength` | number | - | Characters to read |

**Examples:**

```bash
# Read entire file
./cli localGetFileContent path="/src/server.ts" fullContent=true

# Read specific lines
./cli localGetFileContent path="/src/index.ts" startLine=1 endLine=50

# Find and show context around match
./cli localGetFileContent path="/src/auth.ts" matchString="validateToken" matchStringContextLines=10

# Regex match in file
./cli localGetFileContent path="/src/api.ts" matchString="async function \\w+" matchStringIsRegex=true
```

---

### 3. `localFindFiles`

Find files by name, metadata, or properties.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Directory to search in |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | - | Filename pattern (glob) |
| `names` | string | - | Multiple filenames (comma-separated) |
| `iname` | string | - | Case-insensitive filename pattern |
| `type` | enum | - | File type: "file", "directory", "symlink" |
| `maxDepth` | number | - | Maximum directory depth |
| `minDepth` | number | - | Minimum directory depth |
| `modifiedWithin` | string | - | Modified within (e.g., "1d", "2h") |
| `sizeGreater` | string | - | Min size (e.g., "100k", "1M") |
| `sizeLess` | string | - | Max size |
| `empty` | boolean | - | Find empty files/dirs |
| `executable` | boolean | - | Find executable files |
| `excludeDir` | string | - | Directories to exclude |
| `details` | boolean | true | Include file metadata |

**Examples:**

```bash
# Find TypeScript files
./cli localFindFiles path="/src" name="*.ts"

# Find config files (case-insensitive)
./cli localFindFiles path="." iname="*config*"

# Find recently modified
./cli localFindFiles path="/src" modifiedWithin="1d"

# Find large files
./cli localFindFiles path="." sizeGreater="1M" type="file"

# Find directories only
./cli localFindFiles path="/src" type="directory" maxDepth=2

# Find multiple specific files
./cli localFindFiles path="." names="package.json,tsconfig.json,README.md"
```

---

### 4. `localViewStructure`

View directory tree structure.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | Directory path |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | number | 1 | Tree depth |
| `filesOnly` | boolean | false | Show only files |
| `directoriesOnly` | boolean | false | Show only directories |
| `extension` | string | - | Filter by extension |
| `pattern` | string | - | Glob pattern filter |
| `hidden` | boolean | false | Include hidden files |
| `details` | boolean | false | Include size/date |
| `sortBy` | enum | "time" | Sort: "name", "size", "time", "extension" |
| `reverse` | boolean | false | Reverse sort order |
| `entriesPerPage` | number | 20 | Pagination size |

**Examples:**

```bash
# Basic structure (depth 1)
./cli localViewStructure path="/src"

# Deeper exploration
./cli localViewStructure path="/src" depth=3

# Only TypeScript files
./cli localViewStructure path="/src" filesOnly=true extension=".ts"

# With details, sorted by size
./cli localViewStructure path="." details=true sortBy="size" reverse=true

# Include hidden files
./cli localViewStructure path="/home/user" hidden=true
```

---

## LSP Tools (3)

> **⚠️ CRITICAL**: LSP tools require `lineHint` from a prior `localSearchCode` call!

### 5. `lspGotoDefinition`

Jump to symbol definition.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `uri` | string | File path containing the symbol |
| `symbolName` | string | Name of the symbol |
| `lineHint` | number | Line number where symbol appears (1-indexed) |

**Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `orderHint` | number | 0 | Which occurrence on the line (0-indexed) |
| `contextLines` | number | 5 | Lines of context around definition |

**Examples:**

```bash
# Basic definition lookup (after finding line via search)
./cli lspGotoDefinition uri="/src/auth.ts" symbolName="validateToken" lineHint=42

# With more context
./cli lspGotoDefinition uri="/src/utils.ts" symbolName="formatDate" lineHint=15 contextLines=10

# When symbol appears multiple times on line
./cli lspGotoDefinition uri="/src/types.ts" symbolName="User" lineHint=8 orderHint=1
```

**Workflow:**
```bash
# 1. First, search to get lineHint
./cli localSearchCode pattern="validateToken" path="/src" type="ts"

# 2. Use lineHint from results
./cli lspGotoDefinition uri="/src/auth.ts" symbolName="validateToken" lineHint=42
```

---

### 6. `lspFindReferences`

Find all usages of a symbol.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `uri` | string | File path containing the symbol |
| `symbolName` | string | Name of the symbol |
| `lineHint` | number | Line number where symbol appears (1-indexed) |

**Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `orderHint` | number | 0 | Which occurrence on the line |
| `includeDeclaration` | boolean | true | Include the declaration in results |
| `contextLines` | number | 2 | Context lines around each reference |
| `referencesPerPage` | number | 20 | Pagination size |
| `page` | number | 1 | Page number |

**Examples:**

```bash
# Find all usages of a type
./cli lspFindReferences uri="/src/types.ts" symbolName="UserConfig" lineHint=12

# Exclude declaration, show more context
./cli lspFindReferences uri="/src/api.ts" symbolName="fetchData" lineHint=25 includeDeclaration=false contextLines=5

# Paginated results
./cli lspFindReferences uri="/src/utils.ts" symbolName="logger" lineHint=5 referencesPerPage=50 page=2
```

---

### 7. `lspCallHierarchy`

Trace function call relationships.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `uri` | string | File path containing the function |
| `symbolName` | string | Function name |
| `lineHint` | number | Line number where function is defined (1-indexed) |
| `direction` | enum | `"incoming"` or `"outgoing"` |

**Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `orderHint` | number | 0 | Which occurrence on the line |
| `depth` | number | 1 | Hierarchy depth (max 3) |
| `contextLines` | number | 2 | Context lines |
| `callsPerPage` | number | 15 | Pagination size |
| `page` | number | 1 | Page number |

**Examples:**

```bash
# Who calls this function?
./cli lspCallHierarchy uri="/src/auth.ts" symbolName="authenticate" lineHint=45 direction="incoming"

# What does this function call?
./cli lspCallHierarchy uri="/src/api.ts" symbolName="handleRequest" lineHint=10 direction="outgoing"

# Deeper hierarchy
./cli lspCallHierarchy uri="/src/service.ts" symbolName="processData" lineHint=30 direction="incoming" depth=2
```

---

## GitHub Tools (5)

### 8. `githubSearchCode`

Search code across GitHub repositories.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `keywordsToSearch` | string | Keywords to search (comma-separated) |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `owner` | string | - | Repository owner |
| `repo` | string | - | Repository name |
| `path` | string | - | Path prefix filter |
| `extension` | string | - | File extension filter |
| `filename` | string | - | Filename filter |
| `match` | enum | - | "file" (content) or "path" (filenames) |
| `limit` | number | 10 | Results limit |
| `page` | number | 1 | Page number |

**Examples:**

```bash
# Search in specific repo
./cli githubSearchCode keywordsToSearch="useState,useEffect" owner="facebook" repo="react"

# Search by file path
./cli githubSearchCode keywordsToSearch="config" match="path" owner="vercel" repo="next.js"

# Filter by extension
./cli githubSearchCode keywordsToSearch="export default" extension="ts" owner="microsoft" repo="typescript"

# Search with path prefix
./cli githubSearchCode keywordsToSearch="middleware" path="src/api" owner="expressjs" repo="express"
```

---

### 9. `githubGetFileContent`

Read file content from GitHub.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner |
| `repo` | string | Repository name |
| `path` | string | File path in repo |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `branch` | string | default | Branch name |
| `fullContent` | boolean | false | Read entire file |
| `startLine` | number | - | Start line |
| `endLine` | number | - | End line |
| `matchString` | string | - | Find and show context |
| `matchStringContextLines` | number | 5 | Context around match |

**Examples:**

```bash
# Read entire file
./cli githubGetFileContent owner="facebook" repo="react" path="packages/react/index.js" fullContent=true

# Read specific lines
./cli githubGetFileContent owner="microsoft" repo="typescript" path="src/compiler/parser.ts" startLine=1 endLine=100

# Find specific content
./cli githubGetFileContent owner="vercel" repo="next.js" path="packages/next/src/server/app-render/index.tsx" matchString="renderToReadableStream"

# From specific branch
./cli githubGetFileContent owner="nodejs" repo="node" path="lib/fs.js" branch="v20.x" startLine=1 endLine=50
```

---

### 10. `githubSearchRepositories`

Find GitHub repositories.

**Required Parameters (at least one):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `keywordsToSearch` | string | Keywords (comma-separated) |
| `topicsToSearch` | string | Topics (comma-separated) |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `owner` | string | - | Filter by owner/org |
| `stars` | string | - | Stars filter (e.g., ">1000") |
| `created` | string | - | Created date (e.g., ">2023-01-01") |
| `updated` | string | - | Updated date |
| `sort` | enum | - | "stars", "forks", "updated", "best-match" |
| `match` | string | - | Match in: "name", "description", "readme" |
| `limit` | number | 10 | Results limit |

**Examples:**

```bash
# Search by keywords
./cli githubSearchRepositories keywordsToSearch="react,components" stars=">1000"

# Search by topics
./cli githubSearchRepositories topicsToSearch="machine-learning,python" sort="stars"

# Search in organization
./cli githubSearchRepositories keywordsToSearch="api" owner="wix-private"

# Recently updated
./cli githubSearchRepositories keywordsToSearch="cli" updated=">2024-01-01" sort="updated"
```

---

### 11. `githubViewRepoStructure`

View repository file tree.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner |
| `repo` | string | Repository name |
| `branch` | string | Branch name |

**Key Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | "" | Subdirectory path |
| `depth` | number | 1 | Tree depth (max 2) |
| `entriesPerPage` | number | 50 | Entries per page |
| `entryPageNumber` | number | 1 | Page number |

**Examples:**

```bash
# Root structure
./cli githubViewRepoStructure owner="facebook" repo="react" branch="main"

# Subdirectory with depth
./cli githubViewRepoStructure owner="vercel" repo="next.js" branch="canary" path="packages/next/src" depth=2

# Paginated results
./cli githubViewRepoStructure owner="microsoft" repo="vscode" branch="main" entriesPerPage=100
```

---

### 12. `githubSearchPullRequests`

Search pull requests.

**Key Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner |
| `repo` | string | Repository name |
| `prNumber` | number | Specific PR number |
| `query` | string | Search query |
| `state` | enum | "open" or "closed" |
| `merged` | boolean | Filter merged PRs |
| `author` | string | Filter by author |
| `label` | string | Filter by label(s) |
| `base` | string | Target branch |
| `created` | string | Created date filter |
| `sort` | enum | "created", "updated", "best-match" |
| `withComments` | boolean | Include comments |
| `withCommits` | boolean | Include commits |
| `type` | enum | "metadata", "fullContent", "partialContent" |

**Examples:**

```bash
# Get specific PR
./cli githubSearchPullRequests owner="facebook" repo="react" prNumber=25000

# Search merged PRs
./cli githubSearchPullRequests owner="vercel" repo="next.js" state="closed" merged=true limit=20

# PRs by author
./cli githubSearchPullRequests owner="microsoft" repo="typescript" author="RyanCavanaugh" state="closed"

# Search with query
./cli githubSearchPullRequests query="fix authentication" owner="nodejs" repo="node" state="closed"

# With comments for review context
./cli githubSearchPullRequests owner="facebook" repo="react" prNumber=25000 withComments=true type="fullContent"
```

---

## Package Tools (1)

### 13. `packageSearch`

Search npm or PyPI packages.

**Required Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Package name to search |

**Optional Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ecosystem` | enum | "npm" | "npm" or "python" |
| `searchLimit` | number | 1 | Number of results |
| `npmFetchMetadata` | boolean | false | Include npm metadata |
| `pythonFetchMetadata` | boolean | false | Include PyPI metadata |

**Examples:**

```bash
# Search npm package
./cli packageSearch name="express"

# Search with metadata
./cli packageSearch name="lodash" npmFetchMetadata=true

# Search alternatives
./cli packageSearch name="react" searchLimit=5

# Search Python package
./cli packageSearch name="requests" ecosystem="python"

# Python with metadata
./cli packageSearch name="django" ecosystem="python" pythonFetchMetadata=true
```

---

## Quick Reference

### All Tool Names (for direct CLI calls)

```bash
# Local (4)
./cli localSearchCode
./cli localGetFileContent
./cli localFindFiles
./cli localViewStructure

# LSP (3)
./cli lspGotoDefinition
./cli lspFindReferences
./cli lspCallHierarchy

# GitHub (5)
./cli githubSearchCode
./cli githubGetFileContent
./cli githubSearchRepositories
./cli githubViewRepoStructure
./cli githubSearchPullRequests

# Package (1)
./cli packageSearch
```

### Common Patterns

```bash
# Discovery workflow
./cli localSearchCode pattern="TODO" path="." mode="discovery"
./cli localViewStructure path="/src" depth=2

# Definition lookup workflow
./cli localSearchCode pattern="MyClass" path="/src" type="ts"  # Get lineHint
./cli lspGotoDefinition uri="/src/types.ts" symbolName="MyClass" lineHint=42

# Impact analysis workflow
./cli localSearchCode pattern="deprecatedFunction" path="."  # Get lineHint
./cli lspFindReferences uri="/src/utils.ts" symbolName="deprecatedFunction" lineHint=15

# External research workflow
./cli packageSearch name="express"
./cli githubViewRepoStructure owner="expressjs" repo="express" branch="master"
./cli githubSearchCode keywordsToSearch="middleware" owner="expressjs" repo="express"
```

---

## API Alternatives

### POST /tools/call/:toolName (JSON body)

For complex queries, use POST with JSON:

```bash
curl -X POST http://localhost:1987/tools/call/localSearchCode \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [{
      "pattern": "authenticate",
      "path": "/Users/me/project",
      "type": "ts",
      "contextLines": 3
    }]
  }'
```

### GET with query params (what CLI uses)

```bash
curl "http://localhost:1987/localSearchCode?pattern=authenticate&path=/Users/me/project&type=ts"
```

---

*All 13 tools support their complete MCP schema. Use `GET /tools/info/{toolName}` for the full JSON schema of any tool.*
