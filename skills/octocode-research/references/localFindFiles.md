# localFindFiles

Find files by name, type, or metadata.

**Endpoint**: `GET /local/find`

> **Server runs locally** on user's machine. All paths are local filesystem paths.

## HTTP API Examples

```bash
# Find by name pattern
curl "http://localhost:1987/local/find?path=/project/src&name=*.test.ts&type=f"

# Find recently modified files
curl "http://localhost:1987/local/find?path=/project&modifiedWithin=7d&type=f"

# Find large files
curl "http://localhost:1987/local/find?path=/project&sizeGreater=1M&type=f"

# Find directories only
curl "http://localhost:1987/local/find?path=/project/src&type=d&maxDepth=2"

# Find executable scripts
curl "http://localhost:1987/local/find?path=/project/scripts&executable=true&type=f"

# Multiple name patterns
curl "http://localhost:1987/local/find?path=/project/src&names=*.ts,*.tsx&excludeDir=node_modules,dist"

# Paginated results
curl "http://localhost:1987/local/find?path=/project&name=*.ts&filePageNumber=2&filesPerPage=20"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | Directory to search |
| `name` | string | | Glob pattern: `*.ts` |
| `iname` | string | | Case-insensitive name |
| `names` | string | | Multiple patterns: `*.ts,*.tsx` |
| `type` | string | | `f`=files, `d`=directories, `l`=symlinks |
| `modifiedWithin` | string | | `7d`, `24h`, `30m` |
| `modifiedBefore` | string | | Date string |
| `accessedWithin` | string | | Time since access |
| `sizeGreater` | string | | `1M`, `100K` |
| `sizeLess` | string | | Max size |
| `maxDepth` | number | | Max: 10 |
| `minDepth` | number | | Min: 0 |
| `excludeDir` | string | | Directories to skip |
| `executable` | boolean | | Find executables |
| `readable` | boolean | | Find readable files |
| `writable` | boolean | | Find writable files |
| `empty` | boolean | | Find empty files/dirs |
| `filesPerPage` | number | | Default: 20, max: 20 |
| `filePageNumber` | number | | Default: 1 |

## Response Structure

```json
{
  "status": "hasResults",
  "path": "/project",
  "totalFiles": 156,
  "files": [
    {
      "path": "/project/src/auth/middleware.test.ts",
      "type": "file",
      "size": 4523,
      "modified": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 8,
    "hasMore": true
  }
}
```

## Time Formats

| Format | Meaning |
|--------|---------|
| `7d` | 7 days |
| `24h` | 24 hours |
| `30m` | 30 minutes |
| `2w` | 2 weeks |

## Size Formats

| Format | Meaning |
|--------|---------|
| `1K` | 1 kilobyte |
| `1M` | 1 megabyte |
| `1G` | 1 gigabyte |
| `100` | 100 bytes |

## Tips

- **Use `type=f`** to filter only files (excludes directories)
- **Use `maxDepth`** to limit search depth for large directories
- **Combine filters**: `modifiedWithin` + `name` for recent changes to specific file types
- **Case-insensitive**: Use `iname` instead of `name`

## Related Endpoints

- [`/local/structure`](./localViewStructure.md) - View directory tree
- [`/local/search`](./localSearchCode.md) - Search file contents
- [`/local/content`](./localGetFileContent.md) - Read found files
