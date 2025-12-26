import { describe, it, expect } from 'vitest';
import { RESPONSE_KEY_PRIORITY } from '../../src/scheme/responsePriority';

describe('RESPONSE_KEY_PRIORITY', () => {
  it('should have no duplicate keys', () => {
    const uniqueKeys = new Set(RESPONSE_KEY_PRIORITY);
    expect(uniqueKeys.size).toBe(RESPONSE_KEY_PRIORITY.length);
  });

  it('should use camelCase for all keys', () => {
    const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
    const invalidKeys = RESPONSE_KEY_PRIORITY.filter(
      key => !camelCaseRegex.test(key)
    );
    expect(invalidKeys).toEqual([]);
  });

  it('should maintain documented priority order: context → structure → data → pagination → status → hints', () => {
    const indexOf = (key: string): number => RESPONSE_KEY_PRIORITY.indexOf(key);

    // Context comes first
    expect(indexOf('researchGoal')).toBeLessThan(indexOf('results'));

    // Structure before data
    expect(indexOf('results')).toBeLessThan(indexOf('files'));

    // Data before pagination
    expect(indexOf('content')).toBeLessThan(indexOf('pagination'));

    // Pagination before status
    expect(indexOf('hasMore')).toBeLessThan(indexOf('isPartial'));

    // Status before hints
    expect(indexOf('error')).toBeLessThan(indexOf('hints'));

    // Hints at the end
    expect(indexOf('hints')).toBeGreaterThan(indexOf('error'));
  });

  it('should be usable as a sort comparator for response keys', () => {
    const unsortedKeys = ['hints', 'content', 'researchGoal', 'pagination'];
    const sorted = [...unsortedKeys].sort(
      (a, b) =>
        RESPONSE_KEY_PRIORITY.indexOf(a) - RESPONSE_KEY_PRIORITY.indexOf(b)
    );

    expect(sorted).toEqual(['researchGoal', 'content', 'pagination', 'hints']);
  });

  it('should handle keys not in priority list by placing them last', () => {
    const keysWithUnknown = ['hints', 'unknownKey', 'researchGoal'];
    const sorted = [...keysWithUnknown].sort((a, b) => {
      const aIdx = RESPONSE_KEY_PRIORITY.indexOf(a);
      const bIdx = RESPONSE_KEY_PRIORITY.indexOf(b);
      // -1 means not found, treat as last
      const aOrder = aIdx === -1 ? Infinity : aIdx;
      const bOrder = bIdx === -1 ? Infinity : bIdx;
      return aOrder - bOrder;
    });

    expect(sorted).toEqual(['researchGoal', 'hints', 'unknownKey']);
  });

  it('should match snapshot to catch unintended changes', () => {
    expect(RESPONSE_KEY_PRIORITY).toMatchInlineSnapshot(`
      [
        "researchGoal",
        "reasoning",
        "instructions",
        "results",
        "summary",
        "status",
        "path",
        "files",
        "matches",
        "content",
        "structuredOutput",
        "totalMatches",
        "totalFiles",
        "totalDirectories",
        "totalSize",
        "totalLines",
        "contentLength",
        "pagination",
        "charPagination",
        "currentPage",
        "totalPages",
        "hasMore",
        "charOffset",
        "charLength",
        "totalChars",
        "filesPerPage",
        "entriesPerPage",
        "matchesPerPage",
        "isPartial",
        "minificationFailed",
        "warnings",
        "error",
        "errorCode",
        "data",
        "hints",
        "hasResultsStatusHints",
        "emptyStatusHints",
        "errorStatusHints",
      ]
    `);
  });
});
