# lspGotoDefinition

Jump to symbol definition using LSP (Language Server Protocol).

## Import

```typescript
import { lspGotoDefinition } from 'octocode-research';
```

## ⚠️ Critical Requirement

**Requires `lineHint` from `localSearchCode` results!**

Always search first to get the line number:

```typescript
// Step 1: Search to get lineHint
const search = await localSearchCode({
  queries: [{ pattern: 'MyService', path: '/project/src' }]
});
// Extract lineHint from result: 42

// Step 2: Go to definition
const result = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/service.ts',
    symbolName: 'MyService',
    lineHint: 42,  // From search results!
  }]
});
```

## Input Type

```typescript
interface LSPGotoDefinitionQuery {
  // Required
  uri: string;                  // File path (absolute or file:// URI)
  symbolName: string;           // Symbol to find (max: 255 chars)
  lineHint: number;             // Line number from search (1-indexed!)
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Options
  orderHint?: number;           // Which occurrence (0-indexed, default: 0)
  contextLines?: number;        // Context around definition (default: 5, max: 20)
}
```

## Output Type

```typescript
interface GotoDefinitionResult {
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
    displayRange?: {
      startLine: number;
      endLine: number;
    };
  }>;
  resolvedPosition?: { line: number; character: number };
  searchRadius?: number;
}

type LSPErrorType = 
  | 'symbol_not_found' 
  | 'file_not_found' 
  | 'not_a_function'
  | 'timeout' 
  | 'parse_error' 
  | 'unknown';

type SymbolKind = 
  | 'function' | 'method' | 'class' | 'interface' 
  | 'type' | 'variable' | 'constant' | 'property' 
  | 'enum' | 'module' | 'namespace' | 'unknown';
```

## Examples

### Basic definition lookup

```typescript
import { lspGotoDefinition } from 'octocode-research';

const result = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/service.ts',
    symbolName: 'MyService',
    lineHint: 42,
  }]
});
```

### With context lines

```typescript
const result = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'fetchData',
    lineHint: 15,
    contextLines: 10,  // More code around definition
  }]
});
```

### Multiple occurrences

```typescript
// Get second occurrence of symbol
const result = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/types.ts',
    symbolName: 'Config',
    lineHint: 5,
    orderHint: 1,  // 0-indexed, so this is 2nd occurrence
  }]
});
```

### With research context

```typescript
const result = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/auth.ts',
    symbolName: 'authenticate',
    lineHint: 20,
    researchGoal: 'Find authentication implementation',
    reasoning: 'Need to understand auth flow',
  }]
});
```

## Full Workflow Example

```typescript
import { localSearchCode, lspGotoDefinition } from 'octocode-research';

// Step 1: Search for the symbol
const search = await localSearchCode({
  queries: [{
    pattern: 'processRequest',
    path: '/project/src',
    mode: 'discovery',
  }]
});

// Step 2: Extract file and line from results
// Assume search found: /project/src/api.ts at line 42

// Step 3: Go to definition
const definition = await lspGotoDefinition({
  queries: [{
    uri: '/project/src/api.ts',
    symbolName: 'processRequest',
    lineHint: 42,
  }]
});

// Result contains the definition location and code snippet
console.log(definition);
```

## Tips

- **lineHint is 1-indexed**: Line 1 is the first line, not line 0
- **Use absolute paths**: Relative paths may not resolve correctly
- **Check error status**: Handle `symbol_not_found` gracefully
- **TypeScript/JS works out-of-box**: Other languages may need LSP server installation

## Next Steps

After finding the definition:
- [`lspFindReferences`](./lspFindReferences.md) - Find all usages
- [`lspCallHierarchy`](./lspCallHierarchy.md) - Trace call relationships
- [`localGetFileContent`](./localGetFileContent.md) - Read more implementation details

## Related Functions

- [`localSearchCode`](./localSearchCode.md) - Search to get lineHint
- [`lspFindReferences`](./lspFindReferences.md) - Find all usages
- [`lspCallHierarchy`](./lspCallHierarchy.md) - Trace calls
