# lspGotoDefinition

Jump to symbol definition using LSP (Language Server Protocol).

**Endpoint**: `GET /lsp/definition`

> **Server runs locally** on user's machine with LSP support for TypeScript/JavaScript. Other languages may need LSP server installation.

## HTTP API Examples

```bash
# Basic definition lookup
curl "http://localhost:1987/lsp/definition?uri=/project/src/service.ts&symbolName=MyService&lineHint=42"

# With context lines
curl "http://localhost:1987/lsp/definition?uri=/project/src/api.ts&symbolName=fetchData&lineHint=15&contextLines=10"

# Multiple occurrences (get second one)
curl "http://localhost:1987/lsp/definition?uri=/project/src/types.ts&symbolName=Config&lineHint=5&orderHint=1"
```

## ⚠️ Critical Requirement

**Requires `lineHint` from `/local/search` results!**

```bash
# Step 1: Search to get lineHint
curl "http://localhost:1987/local/search?pattern=MyService&path=/project/src"
# Response: matches[].line = 42

# Step 2: Use lineHint with LSP
curl "http://localhost:1987/lsp/definition?uri=/project/src/service.ts&symbolName=MyService&lineHint=42"
```

**Never guess line numbers!** Always search first.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uri` | string | ✅ | File path (absolute or file:// URI) |
| `symbolName` | string | ✅ | Symbol to find (max: 255 chars) |
| `lineHint` | number | ✅ | Line number from search (1-indexed!) |
| `orderHint` | number | | Which occurrence (0-indexed, default: 0) |
| `contextLines` | number | | Context around definition (default: 5, max: 20) |
| `researchGoal` | string | | For tracking |
| `reasoning` | string | | For tracking |

## Response Structure

```json
{
  "status": "hasResults",
  "locations": [
    {
      "uri": "/project/src/service.ts",
      "range": {
        "start": { "line": 10, "character": 0 },
        "end": { "line": 25, "character": 1 }
      },
      "content": "export class MyService {\n  constructor() {...}\n  async process() {...}\n}",
      "symbolKind": "class",
      "displayRange": {
        "startLine": 10,
        "endLine": 25
      }
    }
  ],
  "resolvedPosition": { "line": 42, "character": 5 },
  "searchRadius": 2
}
```

## Symbol Kinds

`function` | `method` | `class` | `interface` | `type` | `variable` | `constant` | `property` | `enum` | `module` | `namespace`

## Error Types

| Error | Meaning |
|-------|---------|
| `symbol_not_found` | Symbol not found at lineHint |
| `file_not_found` | File doesn't exist |
| `timeout` | LSP server timeout |
| `parse_error` | File has syntax errors |

## Tips

- **lineHint is 1-indexed**: Line 1 is the first line
- **Use absolute paths**: Relative paths may not resolve correctly
- **Check error status**: Handle `symbol_not_found` gracefully
- **TypeScript/JS works out-of-box**: Other languages may need LSP server

## Next Steps

After finding the definition:
- [`/lsp/references`](./lspFindReferences.md) - Find all usages
- [`/lsp/calls`](./lspCallHierarchy.md) - Trace call relationships
- [`/local/content`](./localGetFileContent.md) - Read more implementation details

## Related Endpoints

- [`/local/search`](./localSearchCode.md) - Search to get lineHint
- [`/lsp/references`](./lspFindReferences.md) - Find all usages
- [`/lsp/calls`](./lspCallHierarchy.md) - Trace calls
