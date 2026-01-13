# localViewStructure

View directory tree structure.

## Import

```typescript
import { localViewStructure } from 'octocode-research';
```

## Input Type

```typescript
interface ViewStructureQuery {
  // Required
  path: string;                 // Directory to explore
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Display options
  depth?: number;               // Default: 1, max: 5
  filesOnly?: boolean;
  directoriesOnly?: boolean;
  hidden?: boolean;             // Include hidden files
  recursive?: boolean;
  
  // Sorting
  sortBy?: 'name' | 'size' | 'time' | 'extension';
  reverse?: boolean;
  
  // Filtering
  extension?: string;           // Single extension
  extensions?: string[];        // Multiple extensions
  pattern?: string;             // Name pattern
  
  // Pagination
  entriesPerPage?: number;      // Default: 20, max: 20
  entryPageNumber?: number;     // Default: 1
  limit?: number;               // Max: 10000
  
  // Output
  details?: boolean;            // Include size, time
  humanReadable?: boolean;      // Default: true
  summary?: boolean;            // Default: true
  showFileLastModified?: boolean;
  
  // Character pagination
  charOffset?: number;
  charLength?: number;          // Max: 10000
}
```

## Output Type

```typescript
interface ViewStructureResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  entries?: Array<{
    name: string;
    type: 'file' | 'dir';
    size?: number;
    modified?: string;
  }>;
  totalFiles?: number;
  totalDirectories?: number;
  structuredOutput?: string;    // Formatted tree output
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
  };
  hints?: string[];
}
```

## Examples

### Basic structure view

```typescript
import { localViewStructure } from 'octocode-research';

const result = await localViewStructure({
  queries: [{
    path: '/project/src',
    depth: 1,
  }]
});
```

### Deep exploration

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project/src',
    depth: 3,
    filesOnly: true,
  }]
});
```

### Sort by modification time

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project/src',
    sortBy: 'time',
    reverse: true,  // Most recent first
  }]
});
```

### Filter by extension

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project/src',
    extensions: ['ts', 'tsx'],
    filesOnly: true,
  }]
});
```

### Directories only

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project',
    directoriesOnly: true,
    depth: 2,
  }]
});
```

### Include hidden files

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project',
    hidden: true,
    depth: 1,
  }]
});
```

### Paginated results

```typescript
const result = await localViewStructure({
  queries: [{
    path: '/project/src',
    entryPageNumber: 2,
    entriesPerPage: 20,
  }]
});
```

## Tips

- **Start at root with `depth: 1`**: Get overview before drilling deeper
- **Use `depth: 2` on subdirs**: Faster than deep recursion from root
- **Filter noisy dirs**: `.git`, `node_modules`, `dist` are auto-filtered
- **Max 200 items**: Check `pagination.hasMore` if results are truncated

## Workflow

```
1. View root (depth=1)
2. Identify key directories
3. Drill into specific subdirs (depth=2)
4. Use localSearchCode to find patterns
```

## Related Functions

- [`localFindFiles`](./localFindFiles.md) - Find files by metadata
- [`localSearchCode`](./localSearchCode.md) - Search file contents
- [`localGetFileContent`](./localGetFileContent.md) - Read files
