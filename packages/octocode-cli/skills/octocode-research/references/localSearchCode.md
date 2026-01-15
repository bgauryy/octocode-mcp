# localSearchCode

Search code using ripgrep in local directories.

**Endpoint**: `GET /local/search`

> **Server runs locally** on user's machine. All paths are local filesystem paths.

## HTTP API Examples

```bash
# Basic search
curl "http://localhost:1987/local/search?pattern=authenticate&path=/project/src"

# Discovery mode (fast, files only)
curl "http://localhost:1987/local/search?pattern=UserService&path=/project/src&mode=discovery"

# With context lines
curl "http://localhost:1987/local/search?pattern=class.*Service&path=/project/src&contextLines=5"

# Filter by file type
curl "http://localhost:1987/local/search?pattern=export&path=/project/src&type=ts"

# Exclude test files
curl "http://localhost:1987/local/search?pattern=handler&path=/project/src&exclude=*.test.ts,*.spec.ts"

# Paginated results
curl "http://localhost:1987/local/search?pattern=import&path=/project/src&filePageNumber=2&filesPerPage=10"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | ✅ | Regex pattern to search |
| `path` | string | ✅ | Directory to search (local path) |
| `mode` | string | | `discovery` (fast, files only), `paginated`, `detailed` |
| `contextLines` | number | | Lines around matches (max: 50) |
| `type` | string | | File type: `ts`, `py`, `js`, etc. |
| `include` | string | | Glob patterns: `*.ts,*.tsx` |
| `exclude` | string | | Exclude patterns: `*.test.ts` |
| `excludeDir` | string | | Exclude directories |
| `filesOnly` | boolean | | Return only file paths |
| `filesPerPage` | number | | Default: 10, max: 20 |
| `filePageNumber` | number | | Default: 1 |
| `matchesPerPage` | number | | Default: 10, max: 100 |
| `maxMatchesPerFile` | number | | Max: 100 |
| `smartCase` | boolean | | Default: true |
| `caseInsensitive` | boolean | | Case insensitive search |
| `wholeWord` | boolean | | Match whole words only |
| `multiline` | boolean | | Multi-line patterns |

## Response Structure

```json
{
  "status": "hasResults",
  "path": "/project/src",
  "totalMatches": 15,
  "totalFiles": 5,
  "files": [
    {
      "path": "/project/src/auth/middleware.ts",
      "matchCount": 3,
      "matches": [
        {
          "line": 15,
          "column": 10,
          "value": "export async function authenticate(req, res, next) {",
          "location": {
            "byteOffset": 342,
            "charOffset": 342
          }
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "hasMore": true
  }
}
```

## Getting lineHint for LSP Tools

**⚠️ CRITICAL**: The `line` field in matches is the `lineHint` required by LSP tools!

```bash
# Step 1: Search
curl "http://localhost:1987/local/search?pattern=processRequest&path=/project/src"

# Response shows line: 42
# Step 2: Use line as lineHint
curl "http://localhost:1987/lsp/definition?uri=/project/src/api.ts&symbolName=processRequest&lineHint=42"
```

## Workflow Modes

| Mode | Purpose | Settings |
|------|---------|----------|
| `discovery` | Fast file discovery (25x faster) | `filesOnly: true`, `smartCase: true` |
| `paginated` | Paginated content with limits | `filesPerPage: 10`, `matchesPerPage: 10` |
| `detailed` | Full matches with context | `contextLines: 3`, `matchesPerPage: 20` |

## Tips

- **Use `mode=discovery`** for initial exploration - 25x faster than full content
- **Use `type` parameter** instead of `include` globs for known file types
- **The `line` field is lineHint**: Required for all LSP tool calls
- **Limit output**: Set `maxMatchesPerFile` to prevent output explosion

## Next Steps

After finding matches, use the `line` number as `lineHint` for:
- [`/lsp/definition`](./lspGotoDefinition.md) - Jump to definition
- [`/lsp/references`](./lspFindReferences.md) - Find all usages
- [`/lsp/calls`](./lspCallHierarchy.md) - Trace call relationships

## Related Endpoints

- [`/local/structure`](./localViewStructure.md) - View directory tree before searching
- [`/local/find`](./localFindFiles.md) - Find files by metadata
- [`/local/content`](./localGetFileContent.md) - Read found files (last step)
