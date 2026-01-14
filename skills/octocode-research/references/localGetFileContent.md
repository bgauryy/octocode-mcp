# localGetFileContent

Read file content from local filesystem.

**Endpoint**: `GET /local/content`

> **Server runs locally** on user's machine. All paths are local filesystem paths.

## HTTP API Examples

```bash
# Read with match string (RECOMMENDED for large files)
curl "http://localhost:1987/local/content?path=/project/src/index.ts&matchString=export%20class&matchStringContextLines=20"

# Read line range
curl "http://localhost:1987/local/content?path=/project/src/service.ts&startLine=40&endLine=80"

# Read full file (small configs only)
curl "http://localhost:1987/local/content?path=/project/package.json&fullContent=true"

# Regex match
curl "http://localhost:1987/local/content?path=/project/src/api.ts&matchString=async%20function%20%5Cw%2B&matchStringIsRegex=true&matchStringContextLines=15"

# Paginated reading for large files
curl "http://localhost:1987/local/content?path=/project/src/large-file.ts&charOffset=0&charLength=5000"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | Absolute file path |
| `matchString` | string | | Pattern to find |
| `matchStringContextLines` | number | | Default: 5, max: 50 |
| `matchStringIsRegex` | boolean | | Default: false |
| `matchStringCaseSensitive` | boolean | | Default: false |
| `startLine` | number | | 1-indexed start line |
| `endLine` | number | | 1-indexed end line (inclusive) |
| `fullContent` | boolean | | Read entire file (small files only) |
| `charOffset` | number | | Character offset for pagination |
| `charLength` | number | | Max: 10000 |

## Extraction Methods

Choose **ONE** method:

| Method | Use Case | Parameters |
|--------|----------|------------|
| Match string | Find specific pattern | `matchString`, `matchStringContextLines` |
| Line range | Known line numbers | `startLine`, `endLine` |
| Full content | Small config files | `fullContent=true` |
| Char pagination | Large files | `charOffset`, `charLength` |

## Response Structure

```json
{
  "status": "hasResults",
  "path": "/project/src/auth/middleware.ts",
  "content": "export async function authenticate(req, res, next) {\n  const token = req.headers.authorization;\n  ...",
  "contentLength": 1523,
  "totalLines": 85,
  "startLine": 10,
  "endLine": 35,
  "extractedLines": 26,
  "isPartial": true,
  "matchRanges": [
    { "start": 0, "end": 45 }
  ]
}
```

## Checkpoint: Before Reading Files

**⚠️ STOP and check:**

1. Is user asking about FLOWS or CALLS?
   - YES → Use `/lsp/calls` first, NOT this endpoint!

2. Have you traced call hierarchy with LSP?
   - NO → Do that first

3. Reading for specific implementation details?
   - YES → Proceed with this endpoint

## Tips

- **Use `matchString`** for targeted extraction - more efficient than `fullContent`
- **Choose ONE method**: Cannot combine `startLine/endLine` with `matchString` or `fullContent`
- **Line numbers are 1-indexed**: First line is line 1, not line 0
- **Use for implementation details**: This should be your LAST step after LSP analysis

## Validation Rules

1. `startLine` and `endLine` must be used together
2. `startLine` must be ≤ `endLine`
3. Cannot use line range with `matchString`
4. Cannot use line range with `fullContent`

## Related Endpoints

- [`/local/search`](./localSearchCode.md) - Search before reading
- [`/local/structure`](./localViewStructure.md) - Find files first
