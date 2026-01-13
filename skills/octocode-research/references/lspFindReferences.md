# lspFindReferences

Find all references to a symbol using LSP (Language Server Protocol).

## Import

```typescript
import { lspFindReferences } from 'octocode-research';
```

## ⚠️ Critical Requirement

**Requires `lineHint` from `localSearchCode` results!**

Always search first to get the line number.

## When to Use

Use `lspFindReferences` for:
- **Types and interfaces** - Find all usages of a type
- **Variables and constants** - Find all references
- **Functions/methods** - Alternative to `lspCallHierarchy` when you need ALL references, not just call sites
- **Class properties** - Find all property accesses

**Note**: For tracing function call relationships specifically, use [`lspCallHierarchy`](./lspCallHierarchy.md).

## Input Type

```typescript
interface LSPFindReferencesQuery {
  // Required
  uri: string;                  // File path
  symbolName: string;           // Symbol to find
  lineHint: number;             // From search results! (1-indexed)
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Options
  includeDeclaration?: boolean; // Include definition (default: true)
  contextLines?: number;        // Context around references (default: 2, max: 10)
  orderHint?: number;           // Which occurrence (0-indexed)
  
  // Pagination
  page?: number;                // Default: 1
  referencesPerPage?: number;   // Default: 20, max: 50
}
```

## Output Type

```typescript
interface FindReferencesResult {
  status: 'hasResults' | 'empty' | 'error';
  error?: string;
  errorType?: LSPErrorType;
  hints?: string[];
  researchGoal?: string;
  reasoning?: string;
  locations?: Array<{
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    content: string;
    symbolKind?: SymbolKind;
    isDefinition?: boolean;
    displayRange?: {
      startLine: number;
      endLine: number;
    };
  }>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    hasMore: boolean;
    resultsPerPage: number;
  };
  totalReferences?: number;
  hasMultipleFiles?: boolean;
}

type LSPErrorType = 
  | 'symbol_not_found' 
  | 'file_not_found' 
  | 'timeout' 
  | 'parse_error' 
  | 'unknown';
```

## Examples

### Basic reference lookup

```typescript
import { lspFindReferences } from 'octocode-research';

const result = await lspFindReferences({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'UserConfig',
    lineHint: 15,
  }]
});
```

### Exclude definition

```typescript
const result = await lspFindReferences({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'UserConfig',
    lineHint: 15,
    includeDeclaration: false,  // Only usages, not definition
  }]
});
```

### With more context

```typescript
const result = await lspFindReferences({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'fetchData',
    lineHint: 20,
    contextLines: 5,  // More code around each reference
  }]
});
```

### Paginated results

```typescript
// Get second page of results
const result = await lspFindReferences({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'Config',
    lineHint: 5,
    page: 2,
    referencesPerPage: 30,
  }]
});
```

## Full Workflow Example

```typescript
import { localSearchCode, lspFindReferences } from 'octocode-research';

// Step 1: Search for the type
const search = await localSearchCode({
  queries: [{
    pattern: 'interface UserConfig',
    path: '/project/src',
  }]
});
// Found at line 15 in /project/src/types.ts

// Step 2: Find all references
const refs = await lspFindReferences({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'UserConfig',
    lineHint: 15,
  }]
});

// Step 3: Analyze the results
if (refs.content[0]?.text) {
  console.log(`Found ${refs.totalReferences} references`);
  console.log(`Across multiple files: ${refs.hasMultipleFiles}`);
}
```

## Tips

- **Use for types/interfaces**: Better than `lspCallHierarchy` which only works on functions
- **Use for impact analysis**: Find all code that depends on a symbol
- **Check `hasMultipleFiles`**: Understand if symbol is used across the codebase
- **Pagination**: Large codebases may have many references - use pagination

## lspFindReferences vs lspCallHierarchy

| Feature | lspFindReferences | lspCallHierarchy |
|---------|-------------------|------------------|
| Works on types | ✅ Yes | ❌ No |
| Works on interfaces | ✅ Yes | ❌ No |
| Works on variables | ✅ Yes | ❌ No |
| Works on functions | ✅ Yes | ✅ Yes |
| Shows call direction | ❌ No | ✅ Yes (incoming/outgoing) |
| Shows call chain | ❌ No | ✅ Yes (depth parameter) |

## Related Functions

- [`localSearchCode`](./localSearchCode.md) - Search to get lineHint
- [`lspGotoDefinition`](./lspGotoDefinition.md) - Jump to definition
- [`lspCallHierarchy`](./lspCallHierarchy.md) - Trace function calls
