# Bug Report: Response Format Mismatch

## Summary

All HTTP endpoints return empty or incorrect data due to a mismatch between expected and actual response formats from octocode-mcp tool functions.

## Symptoms

- All endpoints return `"No files in this directory"` or `"No matches found"`
- `structuredContent` is always `{}`
- Server logs show `"success": true` but data is empty
- Health check works correctly

## Root Cause

The route handlers in `src/routes/*.ts` expect responses with a `structuredContent` property:

```typescript
// src/routes/local.ts:32
const rawResult = await localSearchCode({ queries } as any);
const data = (rawResult.structuredContent || {}) as StructuredData;
```

However, the octocode-mcp `executeBulkOperation` returns data in a different format:

```typescript
// From octocode-mcp/src/utils/response/bulk.ts:169
return {
  content: [
    {
      type: 'text' as const,
      text: createResponseFormat(responseData, fullKeysPriority),
    },
  ],
  isError: false,
};
```

**Missing:** `structuredContent` property on the returned object.

## Affected Files

- `src/routes/local.ts` - Lines 32, 74, 110, 154
- `src/routes/github.ts` - Lines 34, 69, 106, 148, 188
- `src/routes/package.ts` - Line 23
- `src/routes/lsp.ts` - All route handlers

## Solution

### Option 1: Parse content text (Quick Fix)

Extract data from the text content and parse as JSON:

```typescript
// Before
const data = (rawResult.structuredContent || {}) as StructuredData;

// After
let data: StructuredData = {};
if (rawResult.content?.[0]?.text) {
  try {
    const parsed = JSON.parse(rawResult.content[0].text);
    // The bulk response wraps data in a specific structure
    if (parsed.results?.[0]?.data) {
      data = parsed.results[0].data;
    }
  } catch {
    data = {};
  }
}
```

### Option 2: Add structuredContent to bulk response (Proper Fix)

Modify `octocode-mcp/src/utils/response/bulk.ts` to include structuredContent:

```typescript
// In createBulkResponse function, add to return:
return {
  content: [...],
  isError: false,
  structuredContent: responseData,  // Add this line
};
```

This requires changes to the octocode-mcp package.

### Option 3: Use non-bulk tool functions

If available, use the single-query variants that return structured data directly:

```typescript
// Instead of executeBulkOperation wrapper
import { searchContentRipgrep } from 'octocode-mcp/public';

const result = await searchContentRipgrep(query);
// result.files, result.status, etc. are directly accessible
```

## Recommended Fix

**Option 2** is the cleanest solution as it:
1. Maintains backwards compatibility
2. Requires minimal changes to route handlers
3. Aligns with the expected interface

## Testing After Fix

```bash
# Should return actual search results
curl "http://localhost:1987/local/search?pattern=export&path=/src"

# Should show repo structure
curl "http://localhost:1987/github/structure?owner=facebook&repo=react&branch=main&path=/&depth=1"

# Should return file content
curl "http://localhost:1987/local/content?path=/path/to/file.ts"
```

## Workaround (For Immediate Use)

Until fixed, you can call the octocode-mcp tools directly from code:

```typescript
import { searchContentRipgrep } from 'octocode-mcp/public';

const result = await searchContentRipgrep({
  pattern: 'function',
  path: '/src',
  mainResearchGoal: 'Find functions',
  researchGoal: 'Search for function declarations',
  reasoning: 'Understanding codebase structure'
});

// Result has: result.status, result.files, result.totalMatches, etc.
```
