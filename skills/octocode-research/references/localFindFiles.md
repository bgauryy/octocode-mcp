# localFindFiles

Find files by name, type, or metadata.

## Import

```typescript
import { localFindFiles } from 'octocode-research';
```

## Input Type

```typescript
interface FindFilesQuery {
  // Required
  path: string;                 // Directory to search
  
  // Research context
  researchGoal?: string;
  reasoning?: string;
  
  // Name filters
  name?: string;                // Glob pattern: "*.ts"
  iname?: string;               // Case-insensitive name
  names?: string[];             // Multiple patterns
  pathPattern?: string;         // Path pattern
  regex?: string;               // Regex pattern
  regexType?: 'posix-egrep' | 'posix-extended' | 'posix-basic';
  
  // Type filter
  type?: 'f' | 'd' | 'l' | 'b' | 'c' | 'p' | 's';
  // f=files, d=directories, l=symlinks
  // b=block, c=char, p=pipe, s=socket
  
  // Time filters
  modifiedWithin?: string;      // "7d", "1h", "30m"
  modifiedBefore?: string;      // Date string
  accessedWithin?: string;
  
  // Size filters
  sizeGreater?: string;         // "1M", "100K"
  sizeLess?: string;
  
  // Depth control
  maxDepth?: number;            // Max: 10
  minDepth?: number;            // Min: 0
  
  // Exclusions
  excludeDir?: string[];        // Directories to skip
  
  // Pagination
  filesPerPage?: number;        // Default: 20, max: 20
  filePageNumber?: number;      // Default: 1
  limit?: number;               // Max: 10000
  
  // Permissions
  executable?: boolean;
  readable?: boolean;
  writable?: boolean;
  permissions?: string;         // e.g., "755"
  empty?: boolean;              // Find empty files/dirs
  
  // Output
  details?: boolean;            // Default: true
  showFileLastModified?: boolean; // Default: true
  
  // Character pagination
  charOffset?: number;
  charLength?: number;          // Max: 10000
}
```

## Output Type

```typescript
interface FindFilesResult {
  status: 'hasResults' | 'empty' | 'error';
  path?: string;
  files?: Array<{
    path: string;
    size?: number;
    modified?: string;
    type?: string;
  }>;
  totalFiles?: number;
  pagination?: {
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
  };
  hints?: string[];
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

## Examples

### Find by name pattern

```typescript
import { localFindFiles } from 'octocode-research';

const result = await localFindFiles({
  queries: [{
    path: '/project/src',
    name: '*.test.ts',
    type: 'f',
  }]
});
```

### Find recently modified files

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project',
    modifiedWithin: '7d',
    type: 'f',
  }]
});
```

### Find large files

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project',
    sizeGreater: '1M',
    type: 'f',
  }]
});
```

### Find directories only

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project/src',
    type: 'd',
    maxDepth: 2,
  }]
});
```

### Find executable scripts

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project/scripts',
    executable: true,
    type: 'f',
  }]
});
```

### Find empty files

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project',
    empty: true,
    type: 'f',
  }]
});
```

### Multiple name patterns

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project/src',
    names: ['*.ts', '*.tsx'],
    excludeDir: ['node_modules', 'dist'],
  }]
});
```

### Paginated results

```typescript
const result = await localFindFiles({
  queries: [{
    path: '/project',
    name: '*.ts',
    filePageNumber: 2,
    filesPerPage: 20,
  }]
});
```

## Tips

- **Use `type: 'f'`** to filter only files (excludes directories)
- **Use `maxDepth`** to limit search depth for large directories
- **Combine filters**: `modifiedWithin` + `name` for recent changes to specific file types
- **Case-insensitive**: Use `iname` instead of `name` for case-insensitive matching

## Related Functions

- [`localViewStructure`](./localViewStructure.md) - View directory tree
- [`localSearchCode`](./localSearchCode.md) - Search file contents
- [`localGetFileContent`](./localGetFileContent.md) - Read found files
