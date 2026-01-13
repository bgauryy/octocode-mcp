# lspCallHierarchy

Trace function call relationships using LSP (Language Server Protocol).

## Import

```typescript
import { lspCallHierarchy } from 'octocode-research';
```

## ⚠️ Critical Requirements

1. **Requires `lineHint`** from `localSearchCode` results!
2. **Only works for functions/methods** - For types/variables, use [`lspFindReferences`](./lspFindReferences.md)

## Direction

| Direction | Question | Result |
|-----------|----------|--------|
| `incoming` | "Who calls this function?" | Functions that call the target |
| `outgoing` | "What does this function call?" | Functions called by the target |

## Input Type

```typescript
interface LSPCallHierarchyQuery {
  // Required
  uri: string;                  // File path
  symbolName: string;           // Function/method name
  lineHint: number;             // From search results! (1-indexed)
  direction: 'incoming' | 'outgoing';  // Call direction
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Options
  depth?: number;               // Recursion depth (default: 1, max: 3)
  contextLines?: number;        // Context around calls (default: 2, max: 10)
  orderHint?: number;           // Which occurrence (0-indexed)
  
  // Pagination
  page?: number;                // Default: 1
  callsPerPage?: number;        // Default: 15, max: 30
}
```

## Output Type

```typescript
interface CallHierarchyResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorType?: LSPErrorType;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
  direction?: 'incoming' | 'outgoing';
  depth?: number;
  item?: {
    name: string;
    kind: SymbolKind;
    uri: string;
    range: LSPRange;
    selectionRange: LSPRange;
    content?: string;
    displayRange?: {
      startLine: number;
      endLine: number;
    };
  };
  incomingCalls?: Array<{
    from: CallHierarchyItem;
    fromRanges: LSPRange[];
  }>;
  outgoingCalls?: Array<{
    to: CallHierarchyItem;
    fromRanges: LSPRange[];
  }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    hasMore: boolean;
    resultsPerPage: number;
  };
}

type LSPErrorType = 
  | 'symbol_not_found' 
  | 'file_not_found' 
  | 'not_a_function'  // Symbol is not a function!
  | 'timeout' 
  | 'parse_error' 
  | 'unknown';
```

## Examples

### Find incoming calls (who calls this)

```typescript
import { lspCallHierarchy } from 'octocode-research';

const result = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'processRequest',
    lineHint: 50,
    direction: 'incoming',
  }]
});
```

### Find outgoing calls (what this calls)

```typescript
const result = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'processRequest',
    lineHint: 50,
    direction: 'outgoing',
  }]
});
```

### Deeper call chain

```typescript
const result = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/auth.ts',
    symbolName: 'authenticate',
    lineHint: 20,
    direction: 'incoming',
    depth: 2,  // Follow 2 levels up the call chain
  }]
});
```

### With more context

```typescript
const result = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/service.ts',
    symbolName: 'handleRequest',
    lineHint: 35,
    direction: 'outgoing',
    contextLines: 5,
  }]
});
```

## Full Workflow Example

```typescript
import { localSearchCode, lspCallHierarchy } from 'octocode-research';

// Step 1: Search for the function
const search = await localSearchCode({
  queries: [{
    pattern: 'async function processRequest',
    path: '/project/src',
  }]
});
// Found at line 50 in /project/src/api.ts

// Step 2: Find who calls this function
const incoming = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'processRequest',
    lineHint: 50,
    direction: 'incoming',
  }]
});

// Step 3: Find what this function calls
const outgoing = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'processRequest',
    lineHint: 50,
    direction: 'outgoing',
  }]
});

// Step 4: Chain - follow a caller
if (incoming.incomingCalls?.[0]) {
  const caller = incoming.incomingCalls[0].from;
  const callerChain = await lspCallHierarchy({
    queries: [{
      uri: caller.uri,
      symbolName: caller.name,
      lineHint: caller.range.start.line + 1,  // Convert to 1-indexed
      direction: 'incoming',
    }]
  });
}
```

## Tips

- **Use `depth: 1` and chain manually**: Faster than `depth: 3` for large codebases
- **Check `errorType: 'not_a_function'`**: Symbol must be a function/method
- **For types/interfaces**: Use `lspFindReferences` instead
- **Follow the chain**: Use results to make subsequent calls

## Common Error: `not_a_function`

```typescript
// This will fail - Config is a type, not a function
const result = await lspCallHierarchy({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'Config',  // Type, not function!
    lineHint: 5,
    direction: 'incoming',
  }]
});
// Error: not_a_function

// Use lspFindReferences instead for types
```

## lspCallHierarchy vs lspFindReferences

| Use Case | Tool |
|----------|------|
| "Who calls function X?" | `lspCallHierarchy(incoming)` |
| "What does function X call?" | `lspCallHierarchy(outgoing)` |
| "All usages of type X?" | `lspFindReferences` |
| "All usages of variable X?" | `lspFindReferences` |
| "All usages of function X?" | Either (references gives more, hierarchy gives direction) |

## Related Functions

- [`localSearchCode`](./localSearchCode.md) - Search to get lineHint
- [`lspGotoDefinition`](./lspGotoDefinition.md) - Jump to definition
- [`lspFindReferences`](./lspFindReferences.md) - Find all usages (types, variables)
