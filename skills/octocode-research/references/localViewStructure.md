# localViewStructure

View directory tree structure.

**Endpoint**: `GET /local/structure`

> **Server runs locally** on user's machine. All paths are local filesystem paths.

## HTTP API Examples

```bash
# Basic structure view (start here)
curl "http://localhost:1987/local/structure?path=/project&depth=1"

# Drill into source directory
curl "http://localhost:1987/local/structure?path=/project/src&depth=2"

# Files only, sorted by time
curl "http://localhost:1987/local/structure?path=/project/src&filesOnly=true&sortBy=time&reverse=true"

# Filter by extension
curl "http://localhost:1987/local/structure?path=/project/src&extensions=ts,tsx&filesOnly=true"

# Directories only
curl "http://localhost:1987/local/structure?path=/project&directoriesOnly=true&depth=2"

# Paginated results
curl "http://localhost:1987/local/structure?path=/project/src&entryPageNumber=2&entriesPerPage=20"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | Directory to explore |
| `depth` | number | | Default: 1, max: 5 |
| `filesOnly` | boolean | | Show only files |
| `directoriesOnly` | boolean | | Show only directories |
| `hidden` | boolean | | Include hidden files |
| `recursive` | boolean | | Recursive listing |
| `sortBy` | string | | `name`, `size`, `time`, `extension` |
| `reverse` | boolean | | Reverse sort order |
| `extension` | string | | Single extension filter |
| `extensions` | string | | Multiple extensions: `ts,tsx` |
| `pattern` | string | | Name pattern |
| `entriesPerPage` | number | | Default: 20, max: 20 |
| `entryPageNumber` | number | | Default: 1 |
| `details` | boolean | | Include size, time |
| `summary` | boolean | | Default: true |

## Response Structure

```json
{
  "status": "hasResults",
  "path": "/project/src",
  "totalFiles": 42,
  "totalDirectories": 12,
  "structuredOutput": "[DIR]  auth/\n[DIR]  api/\n[FILE] index.ts (2.5KB)\n...",
  "entries": [
    { "name": "auth", "type": "dir" },
    { "name": "api", "type": "dir" },
    { "name": "index.ts", "type": "file", "size": 2560 }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "hasMore": true
  }
}
```

## Exploration Workflow

```
1. View root (path="/project", depth=1)    → Get overview
2. Identify key directories                 → Look for src/, lib/, packages/
3. Drill (path="/project/src", depth=2)    → Explore source
4. Use /local/search                        → Find specific code
```

## Tips

- **Start at root with `depth=1`**: Get overview before drilling deeper
- **Use `depth=2` on subdirs**: Faster than deep recursion from root
- **Noisy dirs auto-filtered**: `.git`, `node_modules`, `dist` are excluded
- **Max 200 items**: Check `pagination.hasMore` if results are truncated

## Related Endpoints

- [`/local/find`](./localFindFiles.md) - Find files by metadata
- [`/local/search`](./localSearchCode.md) - Search file contents
- [`/local/content`](./localGetFileContent.md) - Read files
