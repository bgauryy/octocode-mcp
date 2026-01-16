# lspCallHierarchy

Trace function call relationships using LSP (Language Server Protocol).

**Endpoint**: `GET /lsp/calls`

> **Server runs locally** on user's machine with LSP support for TypeScript/JavaScript.

## HTTP API Examples

```bash
# Find incoming calls (who calls this)
curl "http://localhost:1987/lsp/calls?uri=/project/src/api.ts&symbolName=processRequest&lineHint=50&direction=incoming"

# Find outgoing calls (what this calls)
curl "http://localhost:1987/lsp/calls?uri=/project/src/api.ts&symbolName=processRequest&lineHint=50&direction=outgoing"

# Deeper call chain
curl "http://localhost:1987/lsp/calls?uri=/project/src/auth.ts&symbolName=authenticate&lineHint=20&direction=incoming&depth=2"

# With more context
curl "http://localhost:1987/lsp/calls?uri=/project/src/service.ts&symbolName=handleRequest&lineHint=35&direction=outgoing&contextLines=5"
```

## ⚠️ Critical Requirements

1. **Requires `lineHint`** from `/local/search` results!
2. **Only works for functions/methods** - For types/variables, use [`/lsp/references`](./lspFindReferences.md)

## Direction

| Direction | Question | Result |
|-----------|----------|--------|
| `incoming` | "Who calls this function?" | Functions that call the target |
| `outgoing` | "What does this function call?" | Functions called by the target |

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uri` | string | ✅ | File path |
| `symbolName` | string | ✅ | Function/method name |
| `lineHint` | number | ✅ | From search results! (1-indexed) |
| `direction` | string | ✅ | `incoming` or `outgoing` |
| `depth` | number | | Recursion depth (default: 1, max: 3) |
| `contextLines` | number | | Context around calls (default: 2, max: 10) |
| `orderHint` | number | | Which occurrence (0-indexed) |
| `page` | number | | Default: 1 |
| `callsPerPage` | number | | Default: 15, max: 30 |

## Response Structure

```json
{
  "status": "hasResults",
  "direction": "incoming",
  "depth": 1,
  "item": {
    "name": "processRequest",
    "kind": "function",
    "uri": "/project/src/api.ts",
    "range": { "start": { "line": 50 }, "end": { "line": 75 } },
    "content": "async function processRequest(req) {...}"
  },
  "incomingCalls": [
    {
      "from": {
        "name": "handleRoute",
        "uri": "/project/src/router.ts",
        "range": { "start": { "line": 20 } }
      },
      "fromRanges": [{ "start": { "line": 25 } }]
    }
  ]
}
```

## Full Workflow Example

```bash
# Step 1: Search for the function
curl "http://localhost:1987/local/search?pattern=async%20function%20processRequest&path=/project/src"
# Found at line 50 in /project/src/api.ts

# Step 2: Find who calls this function (parallel with step 3)
curl "http://localhost:1987/lsp/calls?uri=/project/src/api.ts&symbolName=processRequest&lineHint=50&direction=incoming"

# Step 3: Find what this function calls (parallel with step 2)
curl "http://localhost:1987/lsp/calls?uri=/project/src/api.ts&symbolName=processRequest&lineHint=50&direction=outgoing"

# Step 4: Chain - follow a caller (use line from step 2 results)
curl "http://localhost:1987/lsp/calls?uri=/project/src/router.ts&symbolName=handleRoute&lineHint=20&direction=incoming"
```

## Common Error: `not_a_function`

```bash
# This will fail - Config is a type, not a function
curl "http://localhost:1987/lsp/calls?uri=/project/src/types.ts&symbolName=Config&lineHint=5&direction=incoming"
# Error: not_a_function

# Use /lsp/references instead for types:
curl "http://localhost:1987/lsp/references?uri=/project/src/types.ts&symbolName=Config&lineHint=5"
```

## /lsp/calls vs /lsp/references

| Use Case | Tool |
|----------|------|
| "Who calls function X?" | `/lsp/calls` (incoming) |
| "What does function X call?" | `/lsp/calls` (outgoing) |
| "All usages of type X?" | `/lsp/references` |
| "All usages of variable X?" | `/lsp/references` |
| "All usages of function X?" | Either (references gives more, hierarchy gives direction) |

## Tips

- **Use `depth=1` and chain manually**: Faster than `depth=3` for large codebases
- **Check `errorType: 'not_a_function'`**: Symbol must be a function/method
- **For types/interfaces**: Use `/lsp/references` instead
- **Follow the chain**: Use results to make subsequent calls
- **Run parallel calls**: Incoming AND outgoing can run simultaneously

## Related Endpoints

- [`/local/search`](./localSearchCode.md) - Search to get lineHint
- [`/lsp/definition`](./lspGotoDefinition.md) - Jump to definition
- [`/lsp/references`](./lspFindReferences.md) - Find all usages (types, variables)
