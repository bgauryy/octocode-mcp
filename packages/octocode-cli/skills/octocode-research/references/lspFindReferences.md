# lspFindReferences

Find all references to a symbol using LSP (Language Server Protocol).

**Endpoint**: `GET /lsp/references`

> **Server runs locally** on user's machine with LSP support for TypeScript/JavaScript.

## HTTP API Examples

```bash
# Basic reference lookup
curl "http://localhost:1987/lsp/references?uri=/project/src/types.ts&symbolName=UserConfig&lineHint=15"

# Exclude definition (usages only)
curl "http://localhost:1987/lsp/references?uri=/project/src/types.ts&symbolName=UserConfig&lineHint=15&includeDeclaration=false"

# With more context
curl "http://localhost:1987/lsp/references?uri=/project/src/api.ts&symbolName=fetchData&lineHint=20&contextLines=5"

# Paginated results
curl "http://localhost:1987/lsp/references?uri=/project/src/types.ts&symbolName=Config&lineHint=5&page=2&referencesPerPage=30"
```

## ⚠️ Critical Requirement

**Requires `lineHint` from `/local/search` results!**

```bash
# Step 1: Search to get lineHint
curl "http://localhost:1987/local/search?pattern=interface%20UserConfig&path=/project/src"
# Response: matches[].line = 15

# Step 2: Find all references
curl "http://localhost:1987/lsp/references?uri=/project/src/types.ts&symbolName=UserConfig&lineHint=15"
```

## When to Use

Use `/lsp/references` for:
- **Types and interfaces** - Find all usages of a type
- **Variables and constants** - Find all references
- **Functions/methods** - Alternative to `/lsp/calls` for ALL references
- **Class properties** - Find all property accesses

**Note**: For tracing function call relationships specifically, use [`/lsp/calls`](./lspCallHierarchy.md).

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uri` | string | ✅ | File path |
| `symbolName` | string | ✅ | Symbol to find |
| `lineHint` | number | ✅ | From search results! (1-indexed) |
| `includeDeclaration` | boolean | | Include definition (default: true) |
| `contextLines` | number | | Context around references (default: 2, max: 10) |
| `orderHint` | number | | Which occurrence (0-indexed) |
| `page` | number | | Default: 1 |
| `referencesPerPage` | number | | Default: 20, max: 50 |

## Response Structure

```json
{
  "status": "hasResults",
  "totalReferences": 12,
  "hasMultipleFiles": true,
  "locations": [
    {
      "uri": "/project/src/api/handler.ts",
      "range": {
        "start": { "line": 5, "character": 10 },
        "end": { "line": 5, "character": 20 }
      },
      "content": "function handle(config: UserConfig) {",
      "isDefinition": false
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalResults": 12,
    "hasMore": true
  }
}
```

## /lsp/references vs /lsp/calls

| Feature | /lsp/references | /lsp/calls |
|---------|-----------------|------------|
| Works on types | ✅ Yes | ❌ No |
| Works on interfaces | ✅ Yes | ❌ No |
| Works on variables | ✅ Yes | ❌ No |
| Works on functions | ✅ Yes | ✅ Yes |
| Shows call direction | ❌ No | ✅ Yes (incoming/outgoing) |
| Shows call chain | ❌ No | ✅ Yes (depth parameter) |

## Tips

- **Use for types/interfaces**: Better than `/lsp/calls` which only works on functions
- **Use for impact analysis**: Find all code that depends on a symbol
- **Check `hasMultipleFiles`**: Understand if symbol is used across the codebase
- **Pagination**: Large codebases may have many references

## Related Endpoints

- [`/local/search`](./localSearchCode.md) - Search to get lineHint
- [`/lsp/definition`](./lspGotoDefinition.md) - Jump to definition
- [`/lsp/calls`](./lspCallHierarchy.md) - Trace function calls
