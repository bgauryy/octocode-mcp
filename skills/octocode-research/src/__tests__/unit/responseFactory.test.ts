import { describe, it, expect } from 'vitest';
import {
  safeString,
  safeNumber,
  safeArray,
  extractMatchLocations,
  transformPagination,
} from '../../utils/responseFactory.js';

describe('safeString', () => {
  it('extracts string property', () => {
    expect(safeString({ name: 'hello' }, 'name')).toBe('hello');
  });

  it('returns fallback for missing property', () => {
    expect(safeString({}, 'name')).toBe('');
    expect(safeString({}, 'name', 'default')).toBe('default');
  });

  it('returns fallback for non-string value', () => {
    expect(safeString({ name: 123 }, 'name')).toBe('');
  });

  it('returns fallback for null input', () => {
    expect(safeString(null, 'name')).toBe('');
  });

  it('returns fallback for undefined input', () => {
    expect(safeString(undefined, 'name')).toBe('');
  });

  it('handles empty string value', () => {
    expect(safeString({ name: '' }, 'name')).toBe('');
  });
});

describe('safeNumber', () => {
  it('extracts number property', () => {
    expect(safeNumber({ count: 42 }, 'count')).toBe(42);
  });

  it('returns fallback for missing property', () => {
    expect(safeNumber({}, 'count')).toBe(0);
    expect(safeNumber({}, 'count', -1)).toBe(-1);
  });

  it('returns fallback for non-number value', () => {
    expect(safeNumber({ count: 'not-a-number' }, 'count')).toBe(0);
  });

  it('returns fallback for null input', () => {
    expect(safeNumber(null, 'count')).toBe(0);
  });

  it('handles zero value', () => {
    expect(safeNumber({ count: 0 }, 'count')).toBe(0);
  });

  it('handles negative values', () => {
    expect(safeNumber({ count: -5 }, 'count')).toBe(-5);
  });

  it('handles floating point values', () => {
    expect(safeNumber({ ratio: 3.14 }, 'ratio')).toBe(3.14);
  });
});

describe('safeArray', () => {
  it('extracts array property', () => {
    expect(safeArray({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3]);
  });

  it('returns empty array for missing property', () => {
    expect(safeArray({}, 'items')).toEqual([]);
  });

  it('returns empty array for non-array value', () => {
    expect(safeArray({ items: 'not-array' }, 'items')).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(safeArray(null, 'items')).toEqual([]);
  });

  it('handles empty array', () => {
    expect(safeArray({ items: [] }, 'items')).toEqual([]);
  });

  it('handles object arrays', () => {
    const items = [{ name: 'a' }, { name: 'b' }];
    expect(safeArray({ items }, 'items')).toEqual(items);
  });
});

describe('extractMatchLocations', () => {
  it('extracts line numbers from matches', () => {
    const matches = [
      { line: 10, column: 5, value: 'foo' },
      { line: 20, column: 3, value: 'bar' },
    ];
    const result = extractMatchLocations(matches);
    expect(result).toHaveLength(2);
    expect(result[0].line).toBe(10);
    expect(result[0].column).toBe(5);
    expect(result[0].value).toBe('foo');
  });

  it('handles matches with byte/char offsets', () => {
    const matches = [{ line: 1, byteOffset: 100, charOffset: 50 }];
    const result = extractMatchLocations(matches);
    expect(result[0].byteOffset).toBe(100);
    expect(result[0].charOffset).toBe(50);
  });

  it('handles non-object matches', () => {
    const result = extractMatchLocations(['not-an-object', null, undefined]);
    expect(result).toHaveLength(3);
    expect(result[0].line).toBe(0);
  });

  it('handles empty matches', () => {
    expect(extractMatchLocations([])).toEqual([]);
  });

  it('trims value strings', () => {
    const matches = [{ line: 1, value: '  hello  ' }];
    const result = extractMatchLocations(matches);
    expect(result[0].value).toBe('hello');
  });

  it('omits optional fields when missing', () => {
    const matches = [{ line: 5 }];
    const result = extractMatchLocations(matches);
    expect(result[0].line).toBe(5);
    expect(result[0].column).toBeUndefined();
    expect(result[0].value).toBeUndefined();
    expect(result[0].byteOffset).toBeUndefined();
  });
});

describe('transformPagination', () => {
  it('transforms valid pagination', () => {
    const result = transformPagination({
      currentPage: 2,
      totalPages: 5,
      hasMore: true,
    });
    expect(result).toEqual({ page: 2, total: 5, hasMore: true });
  });

  it('returns undefined for non-object input', () => {
    expect(transformPagination(null)).toBeUndefined();
    expect(transformPagination(undefined)).toBeUndefined();
    expect(transformPagination('string')).toBeUndefined();
    expect(transformPagination(42)).toBeUndefined();
  });

  it('uses defaults for missing fields', () => {
    const result = transformPagination({});
    expect(result).toEqual({ page: 1, total: 1, hasMore: false });
  });

  it('hasMore is false when not explicitly true', () => {
    const result = transformPagination({ currentPage: 1, totalPages: 1 });
    expect(result?.hasMore).toBe(false);
  });

  it('hasMore detects boolean true value', () => {
    const result = transformPagination({ hasMore: true });
    expect(result?.hasMore).toBe(true);
  });
});
